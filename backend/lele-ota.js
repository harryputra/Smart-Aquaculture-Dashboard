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

  async function otaLog(device_id, event, fromV, toV, byUser, detail) {
    await pool.query(
      `INSERT INTO lele_ota_log (device_id, event, from_version, to_version, by_user, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
      [device_id, event, fromV || null, toV || null, byUser || null, detail || null]).catch(() => {});
  }
  const fwById = async (id) => (id
    ? (await pool.query(`SELECT * FROM lele_firmware WHERE id = $1`, [id])).rows[0]
    : (await pool.query(`SELECT * FROM lele_firmware WHERE is_latest = TRUE ORDER BY created_at DESC LIMIT 1`)).rows[0]);

  async function triggerToDevice(deviceId, fw, byUser) {
    const manifest = { version: fw.version, url: fileUrl(fw.id), sha256: fw.sha256 };
    mqttClient.publish(`lele/device/${deviceId}/ota`, JSON.stringify(manifest));
    const cur = (await pool.query(`SELECT firmware_version FROM lele_devices WHERE device_id=$1`, [deviceId])).rows[0];
    await pool.query(
      `UPDATE lele_devices SET ota_state='triggered', ota_target_version=$2, ota_progress=0, ota_at=NOW() WHERE device_id=$1`,
      [deviceId, fw.version]);
    await otaLog(deviceId, 'trigger', cur?.firmware_version, fw.version, byUser, null);
    console.log(`📤 OTA → ${deviceId}: v${fw.version}`);
    return manifest;
  }

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
      const fw = await fwById(req.body?.firmware_id);
      if (!fw) return res.status(404).json({ error: 'Firmware tidak ditemukan.' });
      const manifest = await triggerToDevice(req.params.deviceId, fw, req.auth?.uid);
      res.json({ success: true, manifest });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---------------- Rollout canary + audit ----------------
  app.post('/api/lele/ota/rollout', requireOwner, async (req, res) => {
    try {
      if (!PUBLIC_BASE) return res.status(500).json({ error: 'OTA_PUBLIC_BASE belum diset di server.' });
      const ids = Array.isArray(req.body?.device_ids) ? req.body.device_ids.filter(Boolean) : [];
      if (!ids.length) return res.status(400).json({ error: 'device_ids wajib (minimal 1).' });
      const fw = await fwById(req.body?.firmware_id);
      if (!fw) return res.status(404).json({ error: 'Firmware tidak ditemukan.' });
      const canary = ids[0];
      const remaining = ids.slice(1);
      const r = await pool.query(
        `INSERT INTO lele_ota_rollout (firmware_id, version, status, canary_device_id, remaining, created_by)
         VALUES ($1,$2,'canary',$3,$4,$5) RETURNING *`,
        [fw.id, fw.version, canary, JSON.stringify(remaining), req.auth?.uid || null]);
      await triggerToDevice(canary, fw, req.auth?.uid);
      await otaLog(canary, 'canary_start', null, fw.version, req.auth?.uid, `rollout #${r.rows[0].id} · sisa ${remaining.length}`);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/ota/rollouts', async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM lele_ota_rollout ORDER BY created_at DESC LIMIT 20`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/ota/rollout/:id/abort', requireOwner, async (req, res) => {
    try {
      await pool.query(`UPDATE lele_ota_rollout SET status='aborted', updated_at=NOW() WHERE id=$1 AND status='canary'`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/ota/log', async (req, res) => {
    try {
      const dev = req.query.device;
      const r = dev
        ? await pool.query(`SELECT * FROM lele_ota_log WHERE device_id=$1 ORDER BY created_at DESC LIMIT 100`, [dev])
        : await pool.query(`SELECT * FROM lele_ota_log ORDER BY created_at DESC LIMIT 100`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Tick: majukan rollout canary (uji 1 → sehat → sebar; gagal/timeout → batal).
  async function tickRollouts() {
    const rs = await pool.query(`SELECT * FROM lele_ota_rollout WHERE status='canary'`);
    for (const ro of rs.rows) {
      const dev = (await pool.query(
        `SELECT firmware_version, is_online, ota_state FROM lele_devices WHERE device_id=$1`, [ro.canary_device_id])).rows[0];
      if (!dev) continue;
      const remaining = Array.isArray(ro.remaining) ? ro.remaining : [];
      if (dev.firmware_version === ro.version && dev.is_online) {
        const fw = await fwById(ro.firmware_id);
        if (fw) for (const d of remaining) await triggerToDevice(d, fw, ro.created_by);
        await pool.query(`UPDATE lele_ota_rollout SET status='done', updated_at=NOW() WHERE id=$1`, [ro.id]);
        await otaLog(ro.canary_device_id, 'canary_ok', null, ro.version, ro.created_by, `canary sehat → sebar ${remaining.length} device`);
      } else if (dev.ota_state === 'fail') {
        await pool.query(`UPDATE lele_ota_rollout SET status='aborted', updated_at=NOW() WHERE id=$1`, [ro.id]);
        await otaLog(ro.canary_device_id, 'canary_fail', null, ro.version, ro.created_by, 'canary gagal → rollout dibatalkan');
      } else {
        const ageMin = (Date.now() - new Date(ro.created_at).getTime()) / 60000;
        if (ageMin > 15) {
          await pool.query(`UPDATE lele_ota_rollout SET status='aborted', updated_at=NOW() WHERE id=$1`, [ro.id]);
          await otaLog(ro.canary_device_id, 'canary_timeout', null, ro.version, ro.created_by, 'canary tak konfirmasi 15 mnt (mungkin rollback)');
        }
      }
    }
  }
  setInterval(() => tickRollouts().catch(() => {}), 10000);

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
