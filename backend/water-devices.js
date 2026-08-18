// ======================================================================
// Perangkat AIR — model DEVICE-ID (disamakan dengan feeder lele_devices).
//
// Firmware V6P (device-id) publish:
//   aquaculture/device/<id>/status   → auto-daftar water_devices
//   aquaculture/device/<id>/sensors  → dirutekan ke kolam ter-assign
//   aquaculture/device/<id>/ota_status
// dan subscribe:
//   aquaculture/device/<id>/control  → kuras/isi (di-bridge dari kontrol pond)
//   aquaculture/device/<id>/ota      → manifest OTA
//
// Sensor: modul ini RE-PUBLISH payload ke topik pond-based
// (aquaculture/<farm>/<pond>/sensors) → diproses handler sensor lama di
// server.js (simpan + cek ambang + device_status). Jadi seluruh logika air
// yang sudah ada TETAP dipakai, tanpa duplikasi.
// ======================================================================
const { requireRole } = require('./authorize');

function registerWaterDeviceHandlers({ app, pool, mqttClient }) {
  const PUBLIC_BASE = (process.env.OTA_PUBLIC_BASE || '').replace(/\/+$/, '');
  const fileUrl = (id) => `${PUBLIC_BASE}/api/lele/firmware/download/${id}`;

  // Rekam lalu lintas MQTT air (untuk Monitor MQTT tab "Kualitas Air"). Fire-and-forget.
  function recordWaterTraffic(direction, topic, payloadStr, deviceId, isError = false) {
    pool.query(`INSERT INTO water_mqtt_traffic (device_id, direction, topic, payload, is_error) VALUES ($1,$2,$3,$4,$5)`,
      [deviceId || null, direction, topic, payloadStr, isError]).catch(() => {});
  }

  // status/sensors device sudah tercakup subscribe aquaculture/+/+/* (server.js).
  // Tambahan: kontrol pond-based (utk di-bridge) & ota_status device.
  mqttClient.subscribe('aquaculture/+/+/control');
  mqttClient.subscribe('aquaculture/device/+/ota_status');
  console.log('✓ Water-device subscriptions ready');

  mqttClient.on('message', async (topic, message) => {
    try {
      const parts = topic.split('/');
      if (parts[0] !== 'aquaculture' || parts.length < 4) return;

      // --- Bridge kontrol: kontrol kolam (dari backend) → device air ter-assign ---
      if (parts[3] === 'control' && parts[1] !== 'device') {
        const dev = (await pool.query(`SELECT device_id FROM water_devices WHERE pond_id=$1 LIMIT 1`, [parts[2]])).rows[0];
        if (dev?.device_id) {
          const t = `aquaculture/device/${dev.device_id}/control`;
          mqttClient.publish(t, message.toString());
          recordWaterTraffic('out', t, message.toString(), dev.device_id);
        }
        return;
      }

      if (parts[1] !== 'device') return;              // sisanya: model device-id
      const deviceId = parts[2], type = parts[3];
      let payload = {}; try { payload = JSON.parse(message.toString()); } catch (_) {}
      recordWaterTraffic('in', topic, message.toString(), deviceId, type === 'ota_status' && payload.state === 'fail');

      if (type === 'status') {
        await pool.query(
          `INSERT INTO water_devices (device_id, is_online, last_seen, ip_address, rssi, firmware_version)
           VALUES ($1, TRUE, NOW(), $2, $3, $4)
           ON CONFLICT (device_id) DO UPDATE SET is_online=TRUE, last_seen=NOW(),
             ip_address=COALESCE(EXCLUDED.ip_address, water_devices.ip_address),
             rssi=COALESCE(EXCLUDED.rssi, water_devices.rssi),
             firmware_version=COALESCE(EXCLUDED.firmware_version, water_devices.firmware_version)`,
          [deviceId, payload.ip || null, payload.rssi ?? null, payload.firmware_version || null]);
      } else if (type === 'sensors') {
        const r = (await pool.query(
          `SELECT wd.pond_id, p.farm_id FROM water_devices wd LEFT JOIN ponds p ON wd.pond_id=p.pond_id WHERE wd.device_id=$1`,
          [deviceId])).rows[0];
        await pool.query(`UPDATE water_devices SET last_seen=NOW(), is_online=TRUE WHERE device_id=$1`, [deviceId]);
        // Rute ke kolam ter-assign (bila ada) → handler pond-based memproses.
        if (r?.pond_id && r?.farm_id) {
          mqttClient.publish(`aquaculture/${r.farm_id}/${r.pond_id}/sensors`, message.toString());
        }
      } else if (type === 'ota_status') {
        await pool.query(`UPDATE water_devices SET firmware_version=COALESCE($2, firmware_version) WHERE device_id=$1`,
          [deviceId, payload.version || null]).catch(() => {});
      }
    } catch (e) { console.error('Water-device handler error:', e.message); }
  });

  // Tandai OFFLINE > 30 detik tanpa lapor (cermin feeder).
  setInterval(() => {
    pool.query(`UPDATE water_devices SET is_online=FALSE WHERE is_online=TRUE AND last_seen < NOW() - INTERVAL '30 seconds'`).catch(() => {});
    pool.query(`DELETE FROM water_mqtt_traffic WHERE created_at < NOW() - INTERVAL '2 days'`).catch(() => {});
  }, 15000);

  // ---------------- Endpoints (pairing + OTA) ----------------
  app.get('/api/water/devices', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT wd.*, p.name AS pond_name FROM water_devices wd
         LEFT JOIN ponds p ON wd.pond_id = p.pond_id ORDER BY wd.created_at DESC`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/water/devices/:id/assign', requireRole('pemilik'), async (req, res) => {
    try {
      const { pond_id, name } = req.body || {};
      const r = await pool.query(
        `UPDATE water_devices SET pond_id=$1, name=COALESCE($2,name) WHERE device_id=$3 RETURNING *`,
        [pond_id || null, name || null, req.params.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Perangkat tidak ditemukan.' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/water/devices/:id', requireRole('pemilik'), async (req, res) => {
    try { await pool.query(`DELETE FROM water_devices WHERE device_id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Trigger OTA perangkat air (reuse katalog lele_firmware, model 'kualitas_air').
  app.post('/api/water/devices/:id/ota', requireRole('pemilik'), async (req, res) => {
    try {
      const fwId = req.body?.firmware_id;
      const fw = (fwId
        ? (await pool.query(`SELECT * FROM lele_firmware WHERE id=$1`, [fwId])).rows[0]
        : (await pool.query(`SELECT * FROM lele_firmware WHERE model='kualitas_air' AND is_latest=TRUE ORDER BY created_at DESC LIMIT 1`)).rows[0]);
      if (!fw) return res.status(404).json({ error: 'Belum ada firmware air (model "kualitas_air"). Unggah dulu di halaman Firmware.' });
      const manifest = { version: fw.version, url: fileUrl(fw.id), sha256: fw.sha256 };
      const otaTopic = `aquaculture/device/${req.params.id}/ota`;
      mqttClient.publish(otaTopic, JSON.stringify(manifest));
      recordWaterTraffic('out', otaTopic, JSON.stringify(manifest), req.params.id);
      res.json({ success: true, manifest });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Lalu lintas MQTT air (untuk Monitor MQTT tab "Kualitas Air"). afterId>0 = incremental.
  app.get('/api/water/traffic', async (req, res) => {
    try {
      const afterId = parseInt(req.query.afterId) || 0;
      const limit = Math.min(parseInt(req.query.limit) || 150, 500);
      let r;
      if (afterId > 0) {
        r = await pool.query(
          `SELECT id, device_id, direction, topic, payload, is_error, created_at
           FROM water_mqtt_traffic WHERE id > $1 ORDER BY id ASC LIMIT $2`, [afterId, limit]);
        res.json(r.rows);
      } else {
        r = await pool.query(
          `SELECT id, device_id, direction, topic, payload, is_error, created_at
           FROM water_mqtt_traffic ORDER BY id DESC LIMIT $1`, [limit]);
        res.json(r.rows.reverse());
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ Water-device handlers registered');
}

module.exports = { registerWaterDeviceHandlers };
