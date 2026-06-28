// ======================================================================
// OTA firmware (Fase 2) — katalog firmware + trigger + endpoint device.
// - Admin (Pemilik/Superadmin): list/upload/delete firmware, trigger OTA.
// - Publik (device, tanpa login): GET .../firmware/latest (self-check) &
//   .../firmware/download/:id (.bin). Path publik didaftarkan di auth OPEN_PATHS.
// Integritas dijamin sha256 (dikirim via manifest MQTT yang TLS+auth).
// ======================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

function registerLeleOtaHandlers({ app, pool, mqttClient }) {
  const DIR = process.env.FIRMWARE_DIR || path.join(__dirname, 'firmware');
  const PUBLIC_BASE = (process.env.OTA_PUBLIC_BASE || '').replace(/\/+$/, '');
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (_) {}

  const upload = multer({ dest: DIR, limits: { fileSize: 8 * 1024 * 1024 } });   // maks 8 MB
  const fileUrl = (id) => `${PUBLIC_BASE}/api/lele/firmware/download/${id}`;

  // Hanya Pemilik/Superadmin boleh kelola firmware & memicu OTA.
  const requireOwner = (req, res, next) => {
    const role = req.auth?.role;
    if (role === 'pemilik' || role === 'superadmin') return next();
    return res.status(403).json({ error: 'Hanya Pemilik/Super Admin yang boleh kelola firmware/OTA.' });
  };

  // ---------------- Admin: katalog firmware ----------------
  app.get('/api/lele/firmware', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT id, model, version, sha256, size_bytes, notes, is_latest, uploaded_by, created_at
         FROM lele_firmware ORDER BY created_at DESC`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/firmware', requireOwner, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'File firmware (.bin) wajib.' });
      const model = String(req.body.model || 'pakan_lele').slice(0, 40);
      const version = String(req.body.version || '').trim().slice(0, 20);
      const notes = String(req.body.notes || '').slice(0, 500);
      if (!version) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'Versi wajib.' }); }

      const buf = fs.readFileSync(req.file.path);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const finalName = `${model}_${version}_${sha256.slice(0, 8)}.bin`.replace(/[^a-zA-Z0-9._-]/g, '_');
      fs.renameSync(req.file.path, path.join(DIR, finalName));

      await pool.query(`UPDATE lele_firmware SET is_latest = FALSE WHERE model = $1`, [model]);
      const r = await pool.query(
        `INSERT INTO lele_firmware (model, version, filename, sha256, size_bytes, notes, is_latest, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7) RETURNING *`,
        [model, version, finalName, sha256, buf.length, notes, req.auth?.uid || null]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/lele/firmware/:id/latest', requireOwner, async (req, res) => {
    try {
      const fw = (await pool.query(`SELECT model FROM lele_firmware WHERE id = $1`, [req.params.id])).rows[0];
      if (!fw) return res.status(404).json({ error: 'Tidak ditemukan.' });
      await pool.query(`UPDATE lele_firmware SET is_latest = FALSE WHERE model = $1`, [fw.model]);
      await pool.query(`UPDATE lele_firmware SET is_latest = TRUE WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/lele/firmware/:id', requireOwner, async (req, res) => {
    try {
      const r = await pool.query(`DELETE FROM lele_firmware WHERE id = $1 RETURNING filename`, [req.params.id]);
      if (r.rows[0]) { try { fs.unlinkSync(path.join(DIR, r.rows[0].filename)); } catch (_) {} }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------------- Admin: trigger OTA ----------------
  app.post('/api/lele/devices/:deviceId/ota', requireOwner, async (req, res) => {
    try {
      if (!PUBLIC_BASE) return res.status(500).json({ error: 'OTA_PUBLIC_BASE belum diset di server.' });
      const fwId = req.body?.firmware_id;
      const fw = fwId
        ? (await pool.query(`SELECT * FROM lele_firmware WHERE id = $1`, [fwId])).rows[0]
        : (await pool.query(`SELECT * FROM lele_firmware WHERE is_latest = TRUE ORDER BY created_at DESC LIMIT 1`)).rows[0];
      if (!fw) return res.status(404).json({ error: 'Firmware tidak ditemukan.' });

      const manifest = { version: fw.version, url: fileUrl(fw.id), sha256: fw.sha256 };
      mqttClient.publish(`lele/device/${req.params.deviceId}/ota`, JSON.stringify(manifest));
      await pool.query(
        `UPDATE lele_devices SET ota_state='triggered', ota_target_version=$2, ota_progress=0, ota_at=NOW() WHERE device_id=$1`,
        [req.params.deviceId, fw.version]);
      console.log(`📤 OTA → ${req.params.deviceId}: v${fw.version}`);
      res.json({ success: true, manifest });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------------- Publik (device) ----------------
  // Self-check manifest terbaru.
  app.get('/api/lele/firmware/latest', async (req, res) => {
    try {
      const model = req.query.model || 'pakan_lele';
      const current = req.query.current || '';
      const fw = (await pool.query(
        `SELECT * FROM lele_firmware WHERE model = $1 AND is_latest = TRUE ORDER BY created_at DESC LIMIT 1`, [model])).rows[0];
      if (!fw) return res.json({ update_available: false });
      const upd = fw.version !== current;
      res.json({ update_available: upd, version: fw.version, url: upd ? fileUrl(fw.id) : null, sha256: upd ? fw.sha256 : null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Unduh .bin.
  app.get('/api/lele/firmware/download/:id', async (req, res) => {
    try {
      const fw = (await pool.query(`SELECT filename FROM lele_firmware WHERE id = $1`, [req.params.id])).rows[0];
      if (!fw) return res.status(404).json({ error: 'Not found' });
      const fp = path.resolve(DIR, fw.filename);
      if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File firmware hilang di server.' });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.sendFile(fp);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ Lele OTA handlers terdaftar');
}

module.exports = { registerLeleOtaHandlers };
