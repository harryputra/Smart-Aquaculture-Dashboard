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

      // Best-effort (perlu feeder ONLINE): saat rencana aktif → set feeder ke MANUAL
      // (agar tak dobel dgn jadwal onboard) + SINKRONKAN jam jadwal onboard = sesi
      // rencana, supaya tampilan "Jadwal Pakan Aktif" cocok dengan Rencana Pakan.
      if (plan.enabled) {
        try {
          const dev = (await pool.query(`SELECT device_id FROM lele_devices WHERE pond_id = $1 LIMIT 1`, [pondId])).rows[0]?.device_id;
          if (dev) {
            const cfg = (o) => leleMqttClient.publish(`lele/device/${dev}/config`, JSON.stringify(o));
            leleMqttClient.publish(`lele/device/${dev}/command`, JSON.stringify({ command: 'set_feed_mode', mode: 'manual', source: 'plan', timestamp: Date.now() }));
            const act = rows.filter((s) => s.enabled !== false)
              .map((s) => String(s.session_time).slice(0, 5))
              .filter((t) => /^\d{2}:\d{2}$/.test(t))
              .sort().slice(0, 6);
            if (act.length) cfg({ feeding_per_day: act.length });   // firmware auto-gen dulu, lalu jam di-override:
            act.forEach((t, i) => { const [h, m] = t.split(':').map(Number); cfg({ schedule_index: i, hour: h, minute: m, enabled: true }); });
            for (let i = act.length; i < 6; i++) cfg({ schedule_index: i, enabled: false });
          }
        } catch (_) { /* feeder offline → dilewati */ }
      }

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
        `SELECT s.*, fp.fish_count, fp.avg_weight_g, fp.feeding_rate_percent
         FROM feed_plan_sessions s JOIN feed_plan fp ON s.pond_id = fp.pond_id
         WHERE fp.enabled = TRUE AND s.enabled = TRUE AND s.session_time = $1
           AND (s.last_run_date IS NULL OR s.last_run_date <> CURRENT_DATE)`, [hhmm]);
      for (const s of due.rows) {
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
