// ======================================================================
// Notifikasi WhatsApp (WhatsApp Cloud API resmi / Meta).
// - Gateway GLOBAL (Superadmin set config). Penerima per org/farm/pond (Pemilik).
// - Dispatcher memantau tabel `notifications` → kirim ke penerima yang cocok
//   (scope + kategori + min severity). Non-invasif: menangkap semua notifikasi.
// - Cloud API notif proaktif WAJIB pakai message TEMPLATE (1 variabel {{1}}).
// ======================================================================

const SEV_RANK = { info: 0, success: 0, risk: 1, critical: 2 };
const MIN_RANK = { all: 0, risk: 1, critical: 2 };
const SEV_LABEL = { critical: 'KRITIS', risk: 'PERINGATAN', info: 'INFO', success: 'OK' };

// Normalisasi nomor ke format Cloud API (E.164 tanpa '+', Indonesia 62…).
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}

// Apakah config provider aktif sudah lengkap untuk mengirim?
function cfgReady(cfg) {
  if (!cfg || !cfg.enabled) return false;
  if (cfg.provider === 'fonnte') return !!cfg.fonnte_token;
  if (cfg.provider === 'wablas') return !!(cfg.wablas_token && cfg.wablas_domain);
  return !!(cfg.phone_number_id && cfg.access_token);   // cloud_api (default)
}

async function sendWhatsApp(cfg, phone, text) {
  const to = normPhone(phone);
  if (!to) throw new Error('Nomor tidak valid');
  const msg = String(text).slice(0, 1000);
  const provider = cfg.provider || 'cloud_api';

  // --- Gateway Fonnte (Indonesia) — teks bebas ---
  if (provider === 'fonnte') {
    const r = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: cfg.fonnte_token || '', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ target: to, message: msg }).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === false) throw new Error(`Fonnte ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    return j;
  }

  // --- Gateway Wablas (Indonesia) — teks bebas ---
  if (provider === 'wablas') {
    const base = String(cfg.wablas_domain || '').replace(/\/+$/, '');
    const r = await fetch(`${base}/api/send-message`, {
      method: 'POST',
      headers: { Authorization: cfg.wablas_token || '', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ phone: to, message: msg }).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === false) throw new Error(`Wablas ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    return j;
  }

  // --- WhatsApp Cloud API (Meta resmi) — pakai message template ---
  const ver = cfg.api_version || 'v21.0';
  const url = `https://graph.facebook.com/${ver}/${cfg.phone_number_id}/messages`;
  const body = cfg.template_name
    ? {
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: cfg.template_name,
          language: { code: cfg.template_lang || 'id' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: msg }] }],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg } };
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.text().catch(() => '');
    throw new Error(`WA Cloud ${r.status}: ${e.slice(0, 200)}`);
  }
  return r.json().catch(() => ({}));
}

function composeMessage(n) {
  const sev = SEV_LABEL[n.type] || n.type || '';
  const where = n.pond_name ? ` (${n.pond_name})` : '';
  return `🐟 AquaSmart [${sev}]${where}\n${n.title || ''}\n${n.message || ''}`.trim();
}

function registerWaHandlers({ app, pool }) {
  const getCfg = async () => (await pool.query(`SELECT * FROM wa_config WHERE id=1`)).rows[0] || { enabled: false };
  const isSuper = (req) => req.auth?.role === 'superadmin';
  const requireOwner = (req, res, next) => {
    if (req.auth?.role === 'pemilik' || req.auth?.role === 'superadmin') return next();
    return res.status(403).json({ error: 'Hanya Pemilik/Super Admin.' });
  };
  const waLog = (recipientId, phone, notifId, category, status, error) =>
    pool.query(`INSERT INTO wa_log (recipient_id, phone, notification_id, category, status, error) VALUES ($1,$2,$3,$4,$5,$6)`,
      [recipientId || null, phone || null, notifId || null, category || null, status, error || null]).catch(() => {});

  // ---------------- Config (Superadmin) ----------------
  app.get('/api/wa/config', async (req, res) => {
    if (!isSuper(req)) return res.status(403).json({ error: 'Hanya Super Admin.' });
    const c = await getCfg();
    res.json({
      enabled: c.enabled, provider: c.provider || 'cloud_api',
      // Cloud API
      phone_number_id: c.phone_number_id, api_version: c.api_version,
      template_name: c.template_name, template_lang: c.template_lang, has_token: !!c.access_token,
      // Gateway
      wablas_domain: c.wablas_domain, has_fonnte_token: !!c.fonnte_token, has_wablas_token: !!c.wablas_token,
    });
  });
  app.put('/api/wa/config', async (req, res) => {
    if (!isSuper(req)) return res.status(403).json({ error: 'Hanya Super Admin.' });
    try {
      const b = req.body || {};
      const cur = await getCfg();
      const provider = ['cloud_api', 'fonnte', 'wablas'].includes(b.provider) ? b.provider : (cur.provider || 'cloud_api');
      // Token kosong = jangan ubah (biar tak terhapus).
      const keep = (v, old) => (v && v !== '' ? v : old);
      await pool.query(
        `UPDATE wa_config SET enabled=$1, provider=$2, phone_number_id=$3, access_token=$4, api_version=$5,
           template_name=$6, template_lang=$7, fonnte_token=$8, wablas_token=$9, wablas_domain=$10, updated_at=NOW()
         WHERE id=1`,
        [!!b.enabled, provider, b.phone_number_id || null, keep(b.access_token, cur.access_token),
         b.api_version || 'v21.0', b.template_name || null, b.template_lang || 'id',
         keep(b.fonnte_token, cur.fonnte_token), keep(b.wablas_token, cur.wablas_token), b.wablas_domain || null]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------------- Recipients (Pemilik+; scope ke org-nya) ----------------
  app.get('/api/wa/recipients', requireOwner, async (req, res) => {
    try {
      const params = [], where = [];
      if (!isSuper(req)) { params.push(req.auth.org); where.push(`org_id=$${params.length}`); }
      else if (req.query.org_id) { params.push(req.query.org_id); where.push(`org_id=$${params.length}`); }
      const r = await pool.query(
        `SELECT * FROM wa_recipients ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`, params);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  async function validateScope(orgId, scope, scopeId) {
    if (scope === 'org') return true;
    if (scope === 'farm') return (await pool.query(`SELECT 1 FROM farms WHERE farm_id=$1 AND org_id=$2`, [scopeId, orgId])).rows.length > 0;
    if (scope === 'pond') return (await pool.query(
      `SELECT 1 FROM ponds p JOIN farms f ON p.farm_id=f.farm_id WHERE p.pond_id=$1 AND f.org_id=$2`, [scopeId, orgId])).rows.length > 0;
    return false;
  }

  app.post('/api/wa/recipients', requireOwner, async (req, res) => {
    try {
      const b = req.body || {};
      const org = isSuper(req) ? (b.org_id || req.auth.org) : req.auth.org;
      if (!org) return res.status(400).json({ error: 'Organisasi wajib.' });
      const scope = ['org', 'farm', 'pond'].includes(b.scope) ? b.scope : 'org';
      const scopeId = scope === 'org' ? null : b.scope_id;
      if (scope !== 'org' && !scopeId) return res.status(400).json({ error: 'Pilih kolam/peternakan.' });
      if (!(await validateScope(org, scope, scopeId))) return res.status(400).json({ error: 'Scope bukan milik organisasi ini.' });
      const phone = normPhone(b.phone);
      if (!phone) return res.status(400).json({ error: 'Nomor WhatsApp tidak valid.' });
      const cats = Array.isArray(b.categories) ? b.categories : ['sensor', 'offline', 'feeding', 'feed_stock'];
      const minSev = ['all', 'risk', 'critical'].includes(b.min_severity) ? b.min_severity : 'risk';
      const r = await pool.query(
        `INSERT INTO wa_recipients (org_id, scope, scope_id, name, phone, categories, min_severity, enabled, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [org, scope, scopeId, String(b.name || '').slice(0, 100), phone, JSON.stringify(cats), minSev, b.enabled !== false, req.auth?.uid || null]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/wa/recipients/:id', requireOwner, async (req, res) => {
    try {
      const cur = (await pool.query(`SELECT * FROM wa_recipients WHERE id=$1`, [req.params.id])).rows[0];
      if (!cur) return res.status(404).json({ error: 'Tidak ditemukan.' });
      if (!isSuper(req) && cur.org_id !== req.auth.org) return res.status(403).json({ error: 'Bukan milik organisasi Anda.' });
      const b = req.body || {};
      const phone = b.phone != null ? normPhone(b.phone) : cur.phone;
      if (!phone) return res.status(400).json({ error: 'Nomor tidak valid.' });
      const cats = Array.isArray(b.categories) ? b.categories : (cur.categories || []);
      const minSev = ['all', 'risk', 'critical'].includes(b.min_severity) ? b.min_severity : cur.min_severity;
      await pool.query(
        `UPDATE wa_recipients SET name=$2, phone=$3, categories=$4, min_severity=$5, enabled=$6 WHERE id=$1`,
        [req.params.id, b.name != null ? String(b.name).slice(0, 100) : cur.name, phone,
         JSON.stringify(cats), minSev, b.enabled != null ? !!b.enabled : cur.enabled]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/wa/recipients/:id', requireOwner, async (req, res) => {
    try {
      const cur = (await pool.query(`SELECT org_id FROM wa_recipients WHERE id=$1`, [req.params.id])).rows[0];
      if (!cur) return res.status(404).json({ error: 'Tidak ditemukan.' });
      if (!isSuper(req) && cur.org_id !== req.auth.org) return res.status(403).json({ error: 'Bukan milik organisasi Anda.' });
      await pool.query(`DELETE FROM wa_recipients WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Kirim pesan uji ke 1 penerima.
  app.post('/api/wa/recipients/:id/test', requireOwner, async (req, res) => {
    try {
      const cfg = await getCfg();
      if (!cfgReady(cfg))
        return res.status(400).json({ error: 'Gateway WhatsApp belum aktif/lengkap (atur di config Superadmin).' });
      const rcp = (await pool.query(`SELECT * FROM wa_recipients WHERE id=$1`, [req.params.id])).rows[0];
      if (!rcp) return res.status(404).json({ error: 'Tidak ditemukan.' });
      if (!isSuper(req) && rcp.org_id !== req.auth.org) return res.status(403).json({ error: 'Bukan milik organisasi Anda.' });
      try {
        await sendWhatsApp(cfg, rcp.phone, `🐟 AquaSmart — pesan UJI untuk ${rcp.name || rcp.phone}. Notifikasi WhatsApp aktif. ✅`);
        await waLog(rcp.id, rcp.phone, null, 'test', 'test', null);
        res.json({ success: true });
      } catch (e) { await waLog(rcp.id, rcp.phone, null, 'test', 'fail', e.message); res.status(502).json({ error: e.message }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/wa/log', requireOwner, async (req, res) => {
    try {
      // Pemilik: hanya log penerima org-nya; Superadmin: semua.
      const r = isSuper(req)
        ? await pool.query(`SELECT * FROM wa_log ORDER BY created_at DESC LIMIT 100`)
        : await pool.query(
            `SELECT l.* FROM wa_log l LEFT JOIN wa_recipients r ON l.recipient_id=r.id
             WHERE r.org_id=$1 ORDER BY l.created_at DESC LIMIT 100`, [req.auth.org]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------------- Dispatcher: notifications → WhatsApp ----------------
  async function dispatchTick() {
    const cfg = await getCfg();
    const rows = (await pool.query(
      `SELECT n.id, n.pond_id, n.type, n.category, n.title, n.message, n.created_at,
              p.farm_id, p.name AS pond_name, f.org_id
       FROM notifications n
       LEFT JOIN ponds p ON n.pond_id = p.pond_id
       LEFT JOIN farms f ON p.farm_id = f.farm_id
       WHERE n.wa_dispatched = FALSE
       ORDER BY n.id ASC LIMIT 50`)).rows;
    if (!rows.length) return;

    const ids = rows.map(r => r.id);
    await pool.query(`UPDATE notifications SET wa_dispatched = TRUE WHERE id = ANY($1)`, [ids]); // tandai dulu → anti dobel

    if (!cfgReady(cfg)) return;

    for (const n of rows) {
      // lewati notifikasi lama (mis. saat baru mengaktifkan fitur) atau tanpa org
      if (!n.org_id) continue;
      if (Date.now() - new Date(n.created_at).getTime() > 15 * 60 * 1000) continue;

      const rcps = (await pool.query(
        `SELECT * FROM wa_recipients
         WHERE enabled = TRUE AND org_id = $1
           AND (scope='org' OR (scope='farm' AND scope_id=$2) OR (scope='pond' AND scope_id=$3))
           AND categories @> $4::jsonb`,
        [n.org_id, n.farm_id, n.pond_id, JSON.stringify([n.category])])).rows;

      for (const r of rcps) {
        const rank = SEV_RANK[n.type] != null ? SEV_RANK[n.type] : 1;
        if (rank < (MIN_RANK[r.min_severity] || 1)) continue;
        try {
          await sendWhatsApp(cfg, r.phone, composeMessage(n));
          await waLog(r.id, r.phone, n.id, n.category, 'sent', null);
        } catch (e) {
          await waLog(r.id, r.phone, n.id, n.category, 'fail', e.message);
        }
      }
    }
  }
  setInterval(() => dispatchTick().catch(() => {}), 20000);

  // ---------------- Cek stok pakan rendah → buat notifikasi ----------------
  async function feedStockTick() {
    try {
      const low = (await pool.query(
        `SELECT fs.pond_id FROM feed_stock fs
         WHERE fs.low_threshold_kg > 0 AND fs.current_stock_kg < fs.low_threshold_kg
           AND NOT EXISTS (
             SELECT 1 FROM notifications n WHERE n.pond_id = fs.pond_id AND n.category='feed_stock'
               AND n.created_at > NOW() - INTERVAL '12 hours')`)).rows;
      for (const f of low) {
        const fs = (await pool.query(`SELECT current_stock_kg, low_threshold_kg FROM feed_stock WHERE pond_id=$1`, [f.pond_id])).rows[0];
        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1,'risk','feed_stock','Stok Pakan Rendah',$2)`,
          [f.pond_id, `Stok pakan tersisa ${fs.current_stock_kg} kg, di bawah ambang ${fs.low_threshold_kg} kg. Segera isi ulang.`]);
      }
    } catch (e) { /* */ }
  }
  setInterval(() => feedStockTick().catch(() => {}), 5 * 60 * 1000);

  console.log('✓ WhatsApp notify handlers terdaftar');
}

module.exports = { registerWaHandlers };
