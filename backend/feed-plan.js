// ======================================================================
// Rencana Pakan — pemberian pakan terjadwal berbasis PERSEN kebutuhan harian.
// Mode ONLINE-DRIVEN: server memicu feeder (manual_feed_gram) di tiap jam sesi.
// (Nanti bertahap dipindah ke firmware agar jalan offline.)
//
//   kebutuhan harian (g) = fish_count * avg_weight_g * rate/100
//   gram sesi            = kebutuhan harian * percent/100   (clamp 10..5000)
// ======================================================================
const cron = require('node-cron');
const { requireRole, requirePondAccess } = require('./authorize');

// Laju pakan default menurut bobot ikan (dipakai tombol "ambil dari sampling").
function autoRate(avgG) {
  const a = Number(avgG) || 0;
  if (a <= 20) return 7;
  if (a <= 50) return 5;
  if (a <= 100) return 3.5;
  if (a <= 300) return 2.8;
  return 2;
}

const dailyNeedG = (p) =>
  Math.max(0, Math.round((Number(p.fish_count) || 0) * (Number(p.avg_weight_g) || 0) * (Number(p.feeding_rate_percent) || 0) / 100));

const clampFeed = (g) => Math.min(5000, Math.max(0, Math.round(g)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Jeda antar publish MQTT config schedule_index saat push Rencana Pakan ke
// feeder v3.9+. Firmware menulis tiap config yang diterima ke flash (NVS)
// secara blocking (~puluhan field per schedule_index) -- kalau beberapa pesan
// dikirim beruntun tanpa jeda, ada risiko salah satu tertunda/tidak terproses
// sebelum pesan berikutnya datang. 400ms cukup longgar tanpa membuat proses
// Simpan Rencana terasa lambat (maks 6 slot x 400ms = 2.4 detik).
const SCHEDULE_PUSH_DELAY_MS = 400;

// Firmware >= 3.9.0 = mampu distribusi persen OFFLINE (onboard, via scheduleGram).
// Untuk device ini dashboard push GRAM per slot + auto_feed ON, dan cron TIDAK
// ikut memberi pakan (cegah dobel). < 3.9 = online-driven (cron kirim manual_feed).
function verGte(v, target) {
  const pa = String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = target.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const a = pa[i] || 0, b = pb[i] || 0; if (a > b) return true; if (a < b) return false; }
  return true;
}
const isOfflineCap = (v) => verGte(v, '3.9.0');

function registerFeedPlanHandlers({ app, pool, leleMqttClient }) {
  // Kirim perintah ke feeder lele kolam (bila ada device terpasang).
  async function feederCommand(pondId, command, extra = {}) {
    const r = await pool.query(`SELECT device_id FROM lele_devices WHERE pond_id = $1 LIMIT 1`, [pondId]);
    const deviceId = r.rows[0]?.device_id;
    if (!deviceId) return null;
    const payload = JSON.stringify({ command, source: 'plan', timestamp: Date.now(), ...extra });
    leleMqttClient.publish(`lele/device/${deviceId}/command`, payload);
    return deviceId;
  }

  // Default biomassa dari feeder kolam bila plan belum pernah dibuat.
  async function defaults(pondId) {
    const d = (await pool.query(
      `SELECT fish_count, avg_fish_g, feeding_rate_percent FROM lele_devices WHERE pond_id = $1 LIMIT 1`, [pondId]
    )).rows[0] || {};
    const avg = Number(d.avg_fish_g) || 0;
    return {
      enabled: true,
      fish_count: Number(d.fish_count) || 0,
      avg_weight_g: avg,
      feeding_rate_percent: Number(d.feeding_rate_percent) || autoRate(avg) || 3,
      biomass_source: 'manual',
    };
  }

  function withGrams(plan, sessions) {
    const daily = dailyNeedG(plan);
    const withG = sessions.map((s) => ({ ...s, grams: clampFeed(daily * (Number(s.percent) || 0) / 100) }));
    const totalPercent = sessions.reduce((a, s) => a + (Number(s.percent) || 0), 0);
    return { daily_need_g: daily, total_percent: Math.round(totalPercent * 100) / 100, sessions: withG };
  }

  // GET rencana pakan kolam
  app.get('/api/ponds/:pondId/feed-plan', requirePondAccess('pondId'), async (req, res) => {
    try {
      const pondId = req.params.pondId;
      let plan = (await pool.query(`SELECT * FROM feed_plan WHERE pond_id = $1`, [pondId])).rows[0];
      let isNew = false;
      if (!plan) { plan = { pond_id: pondId, ...(await defaults(pondId)) }; isNew = true; }
      const sessions = (await pool.query(
        `SELECT id, session_name, session_time, percent, enabled, sort, last_run_date
         FROM feed_plan_sessions WHERE pond_id = $1 ORDER BY sort ASC, session_time ASC`, [pondId]
      )).rows;
      const computed = withGrams(plan, sessions);
      res.json({ plan: { ...plan, _isNew: isNew }, ...computed });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUT simpan rencana (pekerja+). Upsert plan + ganti seluruh sesi.
  app.put('/api/ponds/:pondId/feed-plan', requireRole('pekerja', 'pemilik'), requirePondAccess('pondId'), async (req, res) => {
    const c = await pool.connect();
    try {
      const pondId = req.params.pondId;
      const b = req.body || {};
      await c.query('BEGIN');
      const plan = (await c.query(
        `INSERT INTO feed_plan (pond_id, enabled, fish_count, avg_weight_g, feeding_rate_percent, biomass_source, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (pond_id) DO UPDATE SET enabled=EXCLUDED.enabled, fish_count=EXCLUDED.fish_count,
           avg_weight_g=EXCLUDED.avg_weight_g, feeding_rate_percent=EXCLUDED.feeding_rate_percent,
           biomass_source=EXCLUDED.biomass_source, updated_at=NOW()
         RETURNING *`,
        [pondId, b.enabled !== false, parseInt(b.fish_count) || 0, parseFloat(b.avg_weight_g) || 0,
         parseFloat(b.feeding_rate_percent) || 0, ['manual', 'sampling'].includes(b.biomass_source) ? b.biomass_source : 'manual']
      )).rows[0];

      await c.query(`DELETE FROM feed_plan_sessions WHERE pond_id = $1`, [pondId]);
      const sessions = Array.isArray(b.sessions) ? b.sessions : [];
      let sort = 0;
      for (const s of sessions) {
        const time = String(s.session_time || '').slice(0, 5);
        if (!/^\d{2}:\d{2}$/.test(time)) continue;
        await c.query(
          `INSERT INTO feed_plan_sessions (pond_id, session_name, session_time, percent, enabled, sort)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [pondId, String(s.session_name || '').slice(0, 60), time,
           Math.max(0, Math.min(100, parseFloat(s.percent) || 0)), s.enabled !== false, sort++]
        );
      }
      await c.query('COMMIT');

      const rows = (await pool.query(
        `SELECT id, session_name, session_time, percent, enabled, sort, last_run_date
         FROM feed_plan_sessions WHERE pond_id = $1 ORDER BY sort ASC`, [pondId])).rows;

      // Best-effort (perlu feeder ONLINE): saat rencana AKTIF → MATIKAN auto-feed
      // onboard (gate jadwal onboard = autoFeedEnabled; firmware TIDAK mengenal
      // set_feed_mode) supaya feeder tak memberi porsi bawaan (AUTO FEED); porsi
      // persen diberikan server via manual_feed_gram. Juga sinkron jam slot onboard
      // = sesi rencana (untuk tampilan + firmware offline nanti). Nonaktif → kembalikan.
      try {
        const dev = (await pool.query(`SELECT device_id, firmware_version FROM lele_devices WHERE pond_id = $1 LIMIT 1`, [pondId])).rows[0];
        if (dev?.device_id) {
          const cmd = (o) => leleMqttClient.publish(`lele/device/${dev.device_id}/command`, JSON.stringify({ ...o, source: 'plan', timestamp: Date.now() }));
          const cfg = (o) => leleMqttClient.publish(`lele/device/${dev.device_id}/config`, JSON.stringify(o));
          if (plan.enabled) {
            const daily = dailyNeedG(plan);
            const act = rows.filter((s) => s.enabled !== false && /^\d{2}:\d{2}$/.test(String(s.session_time).slice(0, 5)))
              .sort((a, b) => String(a.session_time).localeCompare(String(b.session_time))).slice(0, 6);
            if (isOfflineCap(dev.firmware_version)) {
              // v3.9+: feeder memberi pakan OFFLINE dgn jam presisi per-sesi dari
              // Rencana Pakan. SENGAJA TIDAK kirim `feeding_per_day` di jalur ini --
              // firmware men-generate ULANG SEMUA jam pakai rumus bawaan (sebar rata
              // 07:00-17:00) begitu menerima field itu, MENIMPA jam presisi yang baru
              // saja/segera kita kirim lewat schedule_index di bawah. Kalau salah satu
              // pesan schedule_index telat/gagal diproses (mis. dikirim beruntun tanpa
              // jeda dulu), slot itu tertinggal di jam hasil auto-generate (mis. 17:00)
              // — BUKAN jam yang user atur — dan kalau jam itu sudah lewat hari itu,
              // sesi tsb diam total sampai besok. `feeding_per_day` adalah sisa dari
              // cara lama sebelum ada Rencana Pakan presisi, tidak relevan lagi utk
              // device kelas ini. Jeda SCHEDULE_PUSH_DELAY_MS antar publish juga
              // mengurangi risiko pesan tertunda krn firmware menulis tiap config yg
              // diterima ke flash (NVS) secara blocking.
              cmd({ command: 'set_auto_feed', enabled: true });
              for (let i = 0; i < act.length; i++) {
                const [h, m] = String(act[i].session_time).slice(0, 5).split(':').map(Number);
                cfg({ schedule_index: i, hour: h, minute: m, enabled: true, gram: clampFeed(daily * (Number(act[i].percent) || 0) / 100) });
                await sleep(SCHEDULE_PUSH_DELAY_MS);
              }
              for (let i = act.length; i < 6; i++) {
                cfg({ schedule_index: i, enabled: false, gram: 0 });
                await sleep(SCHEDULE_PUSH_DELAY_MS);
              }
            } else {
              // < v3.9: online-driven, alat generate jadwal sendiri dari feeding_per_day
              // (jam presisi tak didukung firmware ini) — cron dashboard yg kirim
              // manual_feed_gram di jam yang benar, jadi tidak kena race yang sama.
              if (act.length) cfg({ feeding_per_day: act.length });
              cmd({ command: 'set_auto_feed', enabled: false });
              act.forEach((s, i) => {
                const [h, m] = String(s.session_time).slice(0, 5).split(':').map(Number);
                cfg({ schedule_index: i, hour: h, minute: m, enabled: true });
              });
              for (let i = act.length; i < 6; i++) cfg({ schedule_index: i, enabled: false });
            }
          } else {
            cmd({ command: 'set_auto_feed', enabled: true });   // rencana nonaktif → kembalikan jadwal onboard
          }
        }
      } catch (_) { /* feeder offline → dilewati */ }

      res.json({ plan, ...withGrams(plan, rows) });
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: e.message });
    } finally { c.release(); }
  });

  // Ambil bobot rata-rata dari sampling biomassa terakhir feeder.
  app.get('/api/ponds/:pondId/feed-plan/last-sampling', requirePondAccess('pondId'), async (req, res) => {
    try {
      const d = (await pool.query(
        `SELECT avg_fish_g, fish_count FROM lele_devices WHERE pond_id = $1 LIMIT 1`, [req.params.pondId])).rows[0] || {};
      res.json({ avg_weight_g: Number(d.avg_fish_g) || 0, fish_count: Number(d.fish_count) || 0, rate_suggest: autoRate(d.avg_fish_g) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Uji beri pakan 1 sesi sekarang (pekerja+).
  app.post('/api/ponds/:pondId/feed-plan/test', requireRole('pekerja', 'pemilik'), requirePondAccess('pondId'), async (req, res) => {
    try {
      const grams = clampFeed(parseFloat(req.body?.grams) || 0);
      if (grams < 10) return res.status(400).json({ error: 'Gram terlalu kecil (min 10).' });
      const dev = await feederCommand(req.params.pondId, 'manual_feed_gram', { target_g: grams });
      if (!dev) return res.status(404).json({ error: 'Kolam ini belum punya feeder.' });
      res.json({ success: true, device_id: dev, grams });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- CRON: eksekusi sesi pakan tiap menit (online-driven) ----
  cron.schedule('* * * * *', async () => {
    try {
      // Jam sesi diisi user dalam WIB; container server jalan UTC → bandingkan
      // eksplisit terhadap waktu Asia/Jakarta agar 09:00 = 09:00 WIB.
      const hhmm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
      const due = await pool.query(
        `SELECT s.*, fp.fish_count, fp.avg_weight_g, fp.feeding_rate_percent, ld.firmware_version
         FROM feed_plan_sessions s JOIN feed_plan fp ON s.pond_id = fp.pond_id
         LEFT JOIN lele_devices ld ON ld.pond_id = s.pond_id
         WHERE fp.enabled = TRUE AND s.enabled = TRUE AND s.session_time = $1
           AND (s.last_run_date IS NULL OR s.last_run_date <> CURRENT_DATE)`, [hhmm]);
      for (const s of due.rows) {
        // Device v3.9+ memberi pakan sendiri (onboard/offline via scheduleGram) →
        // cron JANGAN kirim manual_feed_gram (cegah dobel). Biarkan feeder yg jalan.
        if (isOfflineCap(s.firmware_version)) continue;
        const grams = clampFeed(dailyNeedG(s) * (Number(s.percent) || 0) / 100);
        await pool.query(`UPDATE feed_plan_sessions SET last_run_date = CURRENT_DATE WHERE id = $1`, [s.id]);
        if (grams < 10) continue;   // porsi terlalu kecil → lewati
        const dev = await feederCommand(s.pond_id, 'manual_feed_gram', { target_g: grams });
        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1,'info','feeding',$2,$3)`,
          [s.pond_id, `Pakan Terjadwal: ${s.session_name || s.session_time}`,
           `Perintah beri ${grams} g (${s.percent}% dari kebutuhan harian) dikirim ke feeder${dev ? '' : ' — tapi feeder belum terpasang'}.`]
        ).catch(() => {});
      }
    } catch (e) { console.error('Feed-plan cron error:', e.message); }
  });

  console.log('✓ Feed-plan handlers + cron registered');
}

module.exports = { registerFeedPlanHandlers };
