// ============================
// Smart Aquaculture - Backend Server v2
// Features: dual-mode (ESP32/dummy), feeding, mortality, notifications, auto-control
// ============================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mqtt = require('mqtt');
const { Pool } = require('pg');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.set('trust proxy', 1);   // di belakang nginx/cloudflare → req.ip benar

// Fase 2: gerbang auth global (semua /api wajib login kecuali auth/health/quick-login)
// + kebijakan peran (pengamat read-only, hapus = pemilik+). Scoping tenant di tiap query.
const { authGate, rolePolicy } = require('./auth');
app.use(authGate);
app.use(rolePolicy);

// ============================
// PostgreSQL
// ============================
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'aquaculture',
  password: process.env.DB_PASSWORD || 'aquaculture123',
  database: process.env.DB_NAME || 'aquaculture',
});

pool.on('connect', () => console.log('✓ PostgreSQL terhubung'));
pool.on('error', (err) => console.error('✗ PostgreSQL error:', err));

// ============================
// MQTT Client
// ============================
// ============================
// MQTT Client (over WebSocket Secure - broker server kampus)
// Sebelumnya konek langsung ke Mosquitto lokal (mqtt://mosquitto:1883),
// sekarang lewat WSS ke domain kampus supaya satu jalur dengan ESP32
// dan tidak terganggu masalah IP lokal yang berubah-ubah.
// ============================
// Default: konek ke mosquitto LOKAL (satu jaringan docker, stabil). ESP32 remote
// konek ke broker yang SAMA via WSS/Cloudflare → keduanya bertemu di mosquitto.
// (Bisa dipaksa WSS dgn set MQTT_PROTOCOL=wss + MQTT_HOST domain + MQTT_PORT 443.)
const MQTT_PROTOCOL = process.env.MQTT_PROTOCOL || 'mqtt';
const MQTT_HOST = process.env.MQTT_HOST || 'mosquitto';
const MQTT_PORT = process.env.MQTT_PORT || 1883;
const MQTT_PATH = process.env.MQTT_PATH || '/';
const _isWs = MQTT_PROTOCOL === 'ws' || MQTT_PROTOCOL === 'wss';
const MQTT_URL = _isWs
  ? `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}${MQTT_PATH}`
  : `${MQTT_PROTOCOL}://${MQTT_HOST}:${MQTT_PORT}`;

const mqttClient = mqtt.connect(
  MQTT_URL,
  {
    username: process.env.MQTT_USER || 'aquaculture',
    password: process.env.MQTT_PASSWORD || 'aquaculture123', // password yang sudah dipakai di sistem kita
    clientId: 'backend_' + Math.random().toString(16).substr(2, 8),
    protocolVersion: 4,
    // mqtt.js otomatis kirim header Sec-WebSocket-Protocol: mqtt saat skema ws/wss
  }
);

mqttClient.on('connect', () => {
  console.log(`✓ MQTT terhubung (${MQTT_URL})`);
  mqttClient.subscribe('aquaculture/+/+/sensors');
  mqttClient.subscribe('aquaculture/+/+/status');
});

mqttClient.on('reconnect', () => console.log('… MQTT mencoba reconnect ke broker kampus'));
mqttClient.on('error', (err) => console.error('✗ MQTT error:', err.message));

// ============================
// MQTT khusus device Lele (broker remote, mis. VPS via TLS)
// ----------------------------------------------------------------------
// Device pakan lele ada di lokasi jauh (kolam) dan konek ke broker publik
// (VPS) lewat internet+TLS. Jika LELE_MQTT_HOST/URL diset, backend membuka
// koneksi TERPISAH ke broker itu khusus topik lele/#. Jika tidak diset,
// fallback ke broker utama (mosquitto lokal) — perilaku lama tak berubah.
// ============================
let leleMqttClient = mqttClient;
if (process.env.LELE_MQTT_URL || process.env.LELE_MQTT_HOST) {
  const proto = process.env.LELE_MQTT_PROTOCOL || 'mqtts';
  const host = process.env.LELE_MQTT_HOST;
  const port = process.env.LELE_MQTT_PORT || (proto === 'mqtts' ? 8883 : 1883);
  const url = process.env.LELE_MQTT_URL || `${proto}://${host}:${port}`;
  leleMqttClient = mqtt.connect(url, {
    username: process.env.LELE_MQTT_USER || process.env.MQTT_USER || 'aquaculture',
    password: process.env.LELE_MQTT_PASSWORD || process.env.MQTT_PASSWORD || 'aquaculture123',
    clientId: 'backend_lele_' + Math.random().toString(16).substr(2, 8),
    // Self-signed → set LELE_MQTT_TLS_INSECURE=true. Let's Encrypt → biarkan verifikasi.
    rejectUnauthorized: process.env.LELE_MQTT_TLS_INSECURE === 'true' ? false : true,
  });
  leleMqttClient.on('connect', () => console.log(`✓ MQTT lele (remote) terhubung: ${url}`));
  leleMqttClient.on('error', (err) => console.error('✗ MQTT lele error:', err.message));
}

// ============================
// InfluxDB
// ============================
const influxDB = new InfluxDB({
  url: `http://${process.env.INFLUX_HOST || 'influxdb'}:8086`,
  token: process.env.INFLUX_TOKEN || 'my-super-secret-auth-token',
});
const influxWrite = influxDB.getWriteApi(
  process.env.INFLUX_ORG || 'aquaculture',
  process.env.INFLUX_BUCKET || 'sensor_data',
  'ms'
);

// ============================
// In-memory cache
// ============================
const latestData = {};
const drainStates = {}; // { pond_id: { draining: bool, refilling: bool, startTime: Date } }

// ============================
// MQTT Message Handler
// ============================
mqttClient.on('message', async (topic, message) => {
  try {
    const parts = topic.split('/');
    if (parts.length < 4) return;

    const [, farm_id, pond_id, type] = parts;
    const payload = JSON.parse(message.toString());

    if (type === 'sensors') {
      latestData[pond_id] = { ...payload, farm_id, pond_id, timestamp: new Date() };

      // Tandai device sebagai connected
      await pool.query(
        `UPDATE device_status SET is_connected = TRUE, last_seen = NOW(), updated_at = NOW() WHERE pond_id = $1`,
        [pond_id]
      );

      // Set pond mode jadi ESP32
      await pool.query(
        `UPDATE ponds SET device_mode = 'esp32' WHERE pond_id = $1 AND device_mode != 'esp32'`,
        [pond_id]
      );

      await saveSensorData(farm_id, pond_id, payload, 'esp32');
      await checkSensorRisks(pond_id, payload);
    } else if (type === 'status') {
      await pool.query(
        `UPDATE device_status SET is_connected = $1, last_seen = NOW(), ip_address = $2, rssi = $3, updated_at = NOW() WHERE pond_id = $4`,
        [payload.online !== false, payload.ip || null, payload.rssi || null, pond_id]
      );
    }
  } catch (e) {
    console.error('MQTT handler error:', e.message);
  }
});

async function saveSensorData(farm_id, pond_id, data, source = 'esp32') {
  try {
    await pool.query(
      `INSERT INTO sensor_data (farm_id, pond_id, temperature, depth, dissolved_oxygen, turbidity, ph, source) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [farm_id, pond_id, data.temperature, data.depth, data.dissolved_oxygen, data.turbidity, data.ph, source]
    );

    const point = new Point('aquaculture_sensors')
      .tag('farm_id', farm_id)
      .tag('pond_id', pond_id)
      .tag('source', source)
      .floatField('temperature', data.temperature || 0)
      .floatField('depth', data.depth || 0)
      .floatField('dissolved_oxygen', data.dissolved_oxygen || 0)
      .floatField('turbidity', data.turbidity || 0)
      .floatField('ph', data.ph || 0);
    influxWrite.writePoint(point);
    await influxWrite.flush();
  } catch (e) {
    console.error('Save sensor error:', e.message);
  }
}

// ============================
// Risk Detection & Auto Control
// ============================
async function checkSensorRisks(pond_id, data) {
  try {
    const thr = await pool.query(`SELECT * FROM sensor_thresholds WHERE pond_id = $1`, [pond_id]);
    if (!thr.rows.length) return;
    const t = thr.rows[0];

    const risks = [];

    if (data.temperature > parseFloat(t.temp_max)) {
      risks.push({
        field: 'temperature',
        value: data.temperature,
        title: 'Suhu Air Terlalu Tinggi',
        message: `Suhu mencapai ${data.temperature}°C, melebihi batas ${t.temp_max}°C. Tindakan: kuras + isi ulang otomatis.`,
        severity: 'critical',
      });
    } else if (data.temperature < parseFloat(t.temp_min)) {
      risks.push({
        field: 'temperature',
        value: data.temperature,
        title: 'Suhu Air Terlalu Rendah',
        message: `Suhu hanya ${data.temperature}°C, di bawah batas ${t.temp_min}°C.`,
        severity: 'risk',
      });
    }

    if (data.dissolved_oxygen < parseFloat(t.do_min)) {
      risks.push({
        field: 'dissolved_oxygen',
        value: data.dissolved_oxygen,
        title: 'Oksigen Terlarut Rendah',
        message: `DO hanya ${data.dissolved_oxygen} mg/L, di bawah batas ${t.do_min} mg/L. Risiko ikan mati!`,
        severity: 'critical',
      });
    }

    if (data.turbidity > parseFloat(t.turbidity_max)) {
      risks.push({
        field: 'turbidity',
        value: data.turbidity,
        title: 'Air Terlalu Keruh',
        message: `Kekeruhan ${data.turbidity} NTU melebihi ${t.turbidity_max} NTU. Air perlu diganti.`,
        severity: 'critical',
      });
    }

    if (data.ph < parseFloat(t.ph_min)) {
      risks.push({
        field: 'ph',
        value: data.ph,
        title: 'pH Air Terlalu Asam',
        message: `pH ${data.ph} di bawah ${t.ph_min}. Air perlu ditreatment.`,
        severity: 'risk',
      });
    } else if (data.ph > parseFloat(t.ph_max)) {
      risks.push({
        field: 'ph',
        value: data.ph,
        title: 'pH Air Terlalu Basa',
        message: `pH ${data.ph} melebihi ${t.ph_max}.`,
        severity: 'risk',
      });
    }

    if (data.depth < parseFloat(t.depth_min)) {
      risks.push({
        field: 'depth',
        value: data.depth,
        title: 'Kedalaman Air Rendah',
        message: `Kedalaman hanya ${data.depth} cm. Aktifkan pengisian air.`,
        severity: 'risk',
      });
    }

    for (const risk of risks) {
      // Cek apakah sudah ada notifikasi serupa dalam 5 menit terakhir
      const recent = await pool.query(
        `SELECT id FROM notifications 
         WHERE pond_id = $1 AND sensor_field = $2 
         AND created_at > NOW() - INTERVAL '5 minutes'
         LIMIT 1`,
        [pond_id, risk.field]
      );
      if (recent.rows.length) continue;

      let actionTaken = 'none';

      // Auto-drain untuk severity critical
      if (risk.severity === 'critical' && t.auto_drain_enabled) {
        await triggerAutoDrainCycle(pond_id, risk.title);
        actionTaken = 'auto_drain_and_refill';
      }

      await pool.query(
        `INSERT INTO notifications (pond_id, type, category, title, message, sensor_field, sensor_value, action_taken)
         VALUES ($1, $2, 'sensor', $3, $4, $5, $6, $7)`,
        [pond_id, risk.severity, risk.title, risk.message, risk.field, risk.value, actionTaken]
      );
    }
  } catch (e) {
    console.error('Risk check error:', e.message);
  }
}

async function triggerAutoDrainCycle(pond_id, reason) {
  // Cegah multiple trigger
  if (drainStates[pond_id]?.draining || drainStates[pond_id]?.refilling) {
    return;
  }

  drainStates[pond_id] = { draining: true, refilling: false, startTime: new Date() };

  console.log(`🚰 Auto-drain dimulai untuk ${pond_id}: ${reason}`);

  // Cari farm_id
  const r = await pool.query(`SELECT farm_id FROM ponds WHERE pond_id = $1`, [pond_id]);
  const farm_id = r.rows[0]?.farm_id;

  // Publish perintah drain
  if (farm_id) {
    mqttClient.publish(
      `aquaculture/${farm_id}/${pond_id}/control`,
      JSON.stringify({ command: 'open_valve', source: 'auto' })
    );
  }

  await pool.query(
    `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, 'valve_open', 'auto', $2)`,
    [pond_id, reason]
  );

  // Setelah 30 detik (simulasi), mulai isi ulang
  setTimeout(async () => {
    drainStates[pond_id] = { draining: false, refilling: true, startTime: new Date() };

    if (farm_id) {
      mqttClient.publish(
        `aquaculture/${farm_id}/${pond_id}/control`,
        JSON.stringify({ command: 'close_valve', source: 'auto' })
      );
      mqttClient.publish(
        `aquaculture/${farm_id}/${pond_id}/control`,
        JSON.stringify({ command: 'open_inlet', source: 'auto' })
      );
    }

    await pool.query(
      `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, 'inlet_open', 'auto', $2)`,
      [pond_id, 'Auto-refill setelah drain']
    );

    await pool.query(
      `INSERT INTO notifications (pond_id, type, category, title, message, action_taken)
       VALUES ($1, 'info', 'system', 'Pengisian Air Otomatis Dimulai', 'Pengurasan selesai, pengisian air bersih dimulai.', 'inlet_opened')`,
      [pond_id]
    );

    // Setelah 60 detik isi ulang, tutup inlet
    setTimeout(async () => {
      drainStates[pond_id] = { draining: false, refilling: false };

      if (farm_id) {
        mqttClient.publish(
          `aquaculture/${farm_id}/${pond_id}/control`,
          JSON.stringify({ command: 'close_inlet', source: 'auto' })
        );
      }

      await pool.query(
        `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, 'inlet_close', 'auto', 'Pengisian air selesai')`,
        [pond_id]
      );

      await pool.query(
        `INSERT INTO notifications (pond_id, type, category, title, message, action_taken)
         VALUES ($1, 'success', 'system', 'Siklus Drain-Refill Selesai', 'Kolam berhasil dikuras dan diisi ulang. Suhu kembali normal.', 'cycle_complete')`,
        [pond_id]
      );
    }, 60000);
  }, 30000);
}

// ============================
// Cek koneksi ESP32 (timeout setelah 30 detik tidak ada data)
// ============================
setInterval(async () => {
  try {
    await pool.query(
      `UPDATE device_status 
       SET is_connected = FALSE 
       WHERE is_connected = TRUE AND last_seen < NOW() - INTERVAL '30 seconds'`
    );
  } catch (e) {
    console.error('Device timeout check error:', e.message);
  }
}, 15000);

// ============================
// CRON: Jadwal pengurasan
// ============================
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const today = now.getDay() === 0 ? 7 : now.getDay();
    const currentTime = `${hh}:${mm}:00`;

    // Drain schedule
    const drains = await pool.query(
      `SELECT ds.*, p.farm_id FROM drain_schedules ds
       JOIN ponds p ON ds.pond_id = p.pond_id
       WHERE ds.is_active = TRUE AND ds.schedule_time = $1`,
      [currentTime]
    );

    for (const s of drains.rows) {
      const days = s.schedule_days.split(',').map(Number);
      if (!days.includes(today)) continue;

      mqttClient.publish(
        `aquaculture/${s.farm_id}/${s.pond_id}/control`,
        JSON.stringify({ command: 'open_valve', source: 'schedule', duration: s.duration_minutes })
      );

      await pool.query(`UPDATE drain_schedules SET last_executed = NOW() WHERE id = $1`, [s.id]);
      await pool.query(
        `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, 'valve_open', 'schedule', 'Jadwal otomatis')`,
        [s.pond_id]
      );
    }

    // Feeding schedule
    const feeds = await pool.query(
      `SELECT fs.*, p.farm_id FROM feeding_schedules fs
       JOIN ponds p ON fs.pond_id = p.pond_id
       WHERE fs.is_active = TRUE AND fs.schedule_time = $1`,
      [currentTime]
    );

    for (const f of feeds.rows) {
      const days = f.schedule_days.split(',').map(Number);
      if (!days.includes(today)) continue;

      mqttClient.publish(
        `aquaculture/${f.farm_id}/${f.pond_id}/control`,
        JSON.stringify({ command: 'feed', amount: f.feed_amount_kg, source: 'schedule' })
      );

      await pool.query(`UPDATE feeding_schedules SET last_executed = NOW() WHERE id = $1`, [f.id]);
      await pool.query(
        `INSERT INTO feeding_logs (pond_id, feed_amount_kg, feed_type, triggered_by, note) VALUES ($1, $2, $3, 'schedule', $4)`,
        [f.pond_id, f.feed_amount_kg, f.feed_type, f.note]
      );

      await pool.query(
        `INSERT INTO notifications (pond_id, type, category, title, message)
         VALUES ($1, 'info', 'feeding', $2, $3)`,
        [f.pond_id, `Pakan Diberikan: ${f.feed_amount_kg} kg`, `${f.feed_type || 'Pakan'} telah diberikan sesuai jadwal.`]
      );
    }
  } catch (e) {
    console.error('Cron error:', e.message);
  }
});

// ============================
// ROUTES
// ============================

// ----- Farms -----
app.get('/api/farms', async (req, res) => {
  try {
    const org = req.auth?.org || null;   // null = superadmin → semua organisasi
    const params = [];
    let where = '';
    if (org) { params.push(org); where = `WHERE f.org_id = $1`; }
    const r = await pool.query(`
      SELECT f.*,
        (SELECT COUNT(*) FROM ponds WHERE farm_id = f.farm_id) as pond_count
      FROM farms f ${where} ORDER BY f.created_at DESC`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/farms/:id', async (req, res) => {
  try {
    const org = req.auth?.org || null;
    const r = await pool.query(
      `SELECT * FROM farms WHERE farm_id = $1 AND ($2::text IS NULL OR org_id = $2)`,
      [req.params.id, org]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/farms', async (req, res) => {
  try {
    const { name, location, owner, description } = req.body;
    const org = req.auth?.org || req.body?.org_id || 'org_default';
    const farm_id = 'farm_' + Date.now().toString(36);
    const r = await pool.query(
      `INSERT INTO farms (farm_id, name, location, owner, description, org_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [farm_id, name, location, owner, description, org]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/farms/:id', async (req, res) => {
  try {
    const org = req.auth?.org || null;
    const r = await pool.query(
      `DELETE FROM farms WHERE farm_id = $1 AND ($2::text IS NULL OR org_id = $2)`,
      [req.params.id, org]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found / bukan milik organisasi Anda' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Ponds -----
app.get('/api/ponds', async (req, res) => {
  try {
    const { farm_id, include_archived } = req.query;
    let q = `SELECT p.*, ds.is_connected, ds.last_seen
             FROM ponds p
             LEFT JOIN device_status ds ON p.pond_id = ds.pond_id
             LEFT JOIN farms fa ON p.farm_id = fa.farm_id`;
    const params = [];
    const where = [];
    if (farm_id) { params.push(farm_id); where.push(`p.farm_id = $${params.length}`); }
    if (req.auth?.org) { params.push(req.auth.org); where.push(`fa.org_id = $${params.length}`); }  // scoping tenant
    if (include_archived !== '1') where.push(`(p.is_active IS DISTINCT FROM FALSE)`);  // sembunyikan arsip
    if (where.length) q += ` WHERE ` + where.join(' AND ');
    q += ` ORDER BY p.created_at DESC`;
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ponds/:id', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, ds.is_connected, ds.last_seen, ds.device_id,
        (SELECT row_to_json(s) FROM (
           SELECT * FROM sensor_data WHERE pond_id = p.pond_id ORDER BY timestamp DESC LIMIT 1
        ) s) as latest_sensor,
        (SELECT row_to_json(t) FROM sensor_thresholds t WHERE t.pond_id = p.pond_id) as threshold
      FROM ponds p
      LEFT JOIN device_status ds ON p.pond_id = ds.pond_id
      LEFT JOIN farms fa ON p.farm_id = fa.farm_id
      WHERE p.pond_id = $1 AND ($2::text IS NULL OR fa.org_id = $2)`, [req.params.id, req.auth?.org || null]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ponds', async (req, res) => {
  try {
    const { farm_id, name, fish_type, size_m2, max_depth, fish_count, stocking_date } = req.body;
    const pond_id = 'pond_' + Date.now().toString(36);
    const r = await pool.query(
      `INSERT INTO ponds (pond_id, farm_id, name, fish_type, size_m2, max_depth, fish_count, initial_fish_count, stocking_date) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING *`,
      [pond_id, farm_id, name, fish_type, size_m2, max_depth, fish_count, stocking_date || new Date()]
    );
    await pool.query(`INSERT INTO sensor_thresholds (pond_id) VALUES ($1)`, [pond_id]);
    await pool.query(`INSERT INTO device_status (pond_id, device_id, is_connected) VALUES ($1, $2, FALSE)`, [pond_id, 'ESP32-' + pond_id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ponds/:id', async (req, res) => {
  try {
    const { name, fish_type, size_m2, max_depth, fish_count } = req.body;
    const r = await pool.query(
      `UPDATE ponds SET name=$1, fish_type=$2, size_m2=$3, max_depth=$4, fish_count=$5, updated_at=NOW() WHERE pond_id=$6 RETURNING *`,
      [name, fish_type, size_m2, max_depth, fish_count, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ponds/:id', async (req, res) => {
  try {
    const org = req.auth?.org || null;
    const r = await pool.query(
      `DELETE FROM ponds WHERE pond_id = $1
         AND ($2::text IS NULL OR farm_id IN (SELECT farm_id FROM farms WHERE org_id = $2))`,
      [req.params.id, org]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found / bukan milik organisasi Anda' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Sensors -----
app.get('/api/sensors/:pondId/latest', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM sensor_data WHERE pond_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [req.params.pondId]
    );
    res.json(r.rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sensors/:pondId/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const r = await pool.query(
      `SELECT * FROM sensor_data WHERE pond_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [req.params.pondId, limit]
    );
    res.json(r.rows.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Control -----
app.post('/api/control/:pondId/valve', async (req, res) => {
  try {
    const { command, source = 'manual' } = req.body;
    const p = await pool.query(`SELECT farm_id FROM ponds WHERE pond_id = $1`, [req.params.pondId]);
    if (!p.rows.length) return res.status(404).json({ error: 'Pond not found' });

    mqttClient.publish(
      `aquaculture/${p.rows[0].farm_id}/${req.params.pondId}/control`,
      JSON.stringify({ command, source })
    );

    const action = command === 'open_valve' ? 'valve_open' :
                   command === 'close_valve' ? 'valve_close' :
                   command === 'open_inlet' ? 'inlet_open' :
                   command === 'close_inlet' ? 'inlet_close' : command;

    await pool.query(
      `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, $2, $3, 'Kontrol manual')`,
      [req.params.pondId, action, source]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/control/:pondId/drain-cycle', async (req, res) => {
  try {
    await triggerAutoDrainCycle(req.params.pondId, 'Trigger manual oleh user');
    res.json({ success: true, message: 'Siklus drain-refill dimulai' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Daftar perangkat kualitas air (per kolam) + status koneksi + nilai terbaru.
app.get('/api/water-devices', async (req, res) => {
  try {
    const org = req.auth?.org || null;   // null = superadmin
    const params = [];
    let where = `WHERE (p.is_active IS DISTINCT FROM FALSE)`;
    if (org) { params.push(org); where += ` AND fa.org_id = $1`; }
    const r = await pool.query(`
      SELECT p.pond_id, p.name, p.fish_type, p.device_mode, p.farm_id, fa.name AS farm_name,
             ds.device_id, ds.is_connected, ds.last_seen, ds.ip_address, ds.rssi,
             (SELECT row_to_json(s) FROM (
                SELECT temperature, depth, dissolved_oxygen, turbidity, ph, created_at
                FROM sensor_data WHERE pond_id = p.pond_id ORDER BY created_at DESC LIMIT 1
             ) s) AS latest,
             (SELECT row_to_json(t) FROM sensor_thresholds t WHERE t.pond_id = p.pond_id) AS threshold
      FROM ponds p
      LEFT JOIN device_status ds ON p.pond_id = ds.pond_id
      LEFT JOIN farms fa ON p.farm_id = fa.farm_id
      ${where}
      ORDER BY ds.is_connected DESC NULLS LAST, p.name`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Simulasi - khusus untuk dummy mode
app.post('/api/control/:pondId/simulate', async (req, res) => {
  try {
    const { temperature, depth, dissolved_oxygen, turbidity, ph } = req.body;
    const p = await pool.query(`SELECT farm_id FROM ponds WHERE pond_id = $1`, [req.params.pondId]);
    if (!p.rows.length) return res.status(404).json({ error: 'Pond not found' });

    const farm_id = p.rows[0].farm_id;
    const data = { temperature, depth, dissolved_oxygen, turbidity, ph, timestamp: Date.now() };

    latestData[req.params.pondId] = { ...data, farm_id, pond_id: req.params.pondId, timestamp: new Date() };
    await saveSensorData(farm_id, req.params.pondId, data, 'dummy');
    await checkSensorRisks(req.params.pondId, data);

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set mode dummy/esp32
app.put('/api/ponds/:id/mode', async (req, res) => {
  try {
    const { mode } = req.body; // 'dummy' atau 'esp32'
    await pool.query(`UPDATE ponds SET device_mode = $1 WHERE pond_id = $2`, [mode, req.params.id]);
    res.json({ success: true, mode });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Thresholds -----
app.get('/api/thresholds/:pondId', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM sensor_thresholds WHERE pond_id = $1`, [req.params.pondId]);
    res.json(r.rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/thresholds/:pondId', async (req, res) => {
  try {
    const { temp_min, temp_max, depth_min, depth_max, do_min, do_max, turbidity_max, ph_min, ph_max, auto_drain_enabled, auto_refill_enabled } = req.body;
    const r = await pool.query(
      `UPDATE sensor_thresholds SET 
        temp_min=$1, temp_max=$2, depth_min=$3, depth_max=$4, do_min=$5, do_max=$6, 
        turbidity_max=$7, ph_min=$8, ph_max=$9, auto_drain_enabled=$10, auto_refill_enabled=$11, updated_at=NOW()
       WHERE pond_id=$12 RETURNING *`,
      [temp_min, temp_max, depth_min, depth_max, do_min, do_max, turbidity_max, ph_min, ph_max, auto_drain_enabled, auto_refill_enabled, req.params.pondId]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Drain Schedules -----
app.get('/api/schedules', async (req, res) => {
  try {
    const { pond_id } = req.query;
    const q = pond_id 
      ? `SELECT * FROM drain_schedules WHERE pond_id = $1 ORDER BY schedule_time`
      : `SELECT * FROM drain_schedules ORDER BY schedule_time`;
    const r = await pool.query(q, pond_id ? [pond_id] : []);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const { pond_id, schedule_time, schedule_days, duration_minutes } = req.body;
    const r = await pool.query(
      `INSERT INTO drain_schedules (pond_id, schedule_time, schedule_days, duration_minutes) 
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [pond_id, schedule_time, schedule_days, duration_minutes]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM drain_schedules WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Feeding Schedules -----
app.get('/api/feeding-schedules', async (req, res) => {
  try {
    const { pond_id } = req.query;
    const q = pond_id
      ? `SELECT * FROM feeding_schedules WHERE pond_id = $1 ORDER BY schedule_time`
      : `SELECT * FROM feeding_schedules ORDER BY schedule_time`;
    const r = await pool.query(q, pond_id ? [pond_id] : []);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/feeding-schedules', async (req, res) => {
  try {
    const { pond_id, schedule_time, schedule_days, feed_amount_kg, feed_type, note } = req.body;
    const r = await pool.query(
      `INSERT INTO feeding_schedules (pond_id, schedule_time, schedule_days, feed_amount_kg, feed_type, note) 
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [pond_id, schedule_time, schedule_days, feed_amount_kg, feed_type, note]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/feeding-schedules/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM feeding_schedules WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/feeding-logs/:pondId', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM feeding_logs WHERE pond_id = $1 ORDER BY timestamp DESC LIMIT 50`,
      [req.params.pondId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/feeding-logs', async (req, res) => {
  try {
    const { pond_id, feed_amount_kg, feed_type, note } = req.body;
    const r = await pool.query(
      `INSERT INTO feeding_logs (pond_id, feed_amount_kg, feed_type, triggered_by, note) 
       VALUES ($1,$2,$3,'manual',$4) RETURNING *`,
      [pond_id, feed_amount_kg, feed_type, note]
    );

    await pool.query(
      `INSERT INTO notifications (pond_id, type, category, title, message)
       VALUES ($1, 'info', 'feeding', $2, $3)`,
      [pond_id, `Pakan Diberikan: ${feed_amount_kg} kg`, `Pemberian pakan manual berhasil dicatat.`]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Mortality -----
app.get('/api/mortality/:pondId', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM mortality_records WHERE pond_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
      [req.params.pondId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/mortality/:pondId/summary', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        p.fish_count, p.initial_fish_count, p.stocking_date,
        COALESCE(SUM(m.death_count), 0) AS total_deaths,
        COUNT(m.id) AS death_events,
        p.initial_fish_count - COALESCE(SUM(m.death_count), 0) AS estimated_harvest
      FROM ponds p
      LEFT JOIN mortality_records m ON p.pond_id = m.pond_id
      WHERE p.pond_id = $1
      GROUP BY p.pond_id, p.fish_count, p.initial_fish_count, p.stocking_date`,
      [req.params.pondId]
    );
    res.json(r.rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mortality', async (req, res) => {
  try {
    const { pond_id, death_count, cause, note } = req.body;
    const r = await pool.query(
      `INSERT INTO mortality_records (pond_id, death_count, cause, note) 
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [pond_id, death_count, cause, note]
    );

    // Kurangi fish_count
    await pool.query(
      `UPDATE ponds SET fish_count = GREATEST(0, fish_count - $1) WHERE pond_id = $2`,
      [death_count, pond_id]
    );

    await pool.query(
      `INSERT INTO notifications (pond_id, type, category, title, message)
       VALUES ($1, 'risk', 'mortality', $2, $3)`,
      [pond_id, `${death_count} Ikan Mati Dicatat`, `Penyebab: ${cause || 'tidak diketahui'}. ${note || ''}`]
    );

    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/mortality/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM mortality_records WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Notifications -----
app.get('/api/notifications', async (req, res) => {
  try {
    const { pond_id, unread_only, limit = 50 } = req.query;
    let q = `SELECT n.*, p.name as pond_name FROM notifications n 
             LEFT JOIN ponds p ON n.pond_id = p.pond_id WHERE 1=1`;
    const params = [];
    if (pond_id) { params.push(pond_id); q += ` AND n.pond_id = $${params.length}`; }
    if (unread_only === 'true') q += ` AND n.is_read = FALSE`;
    q += ` ORDER BY n.created_at DESC LIMIT ${parseInt(limit)}`;
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const r = await pool.query(`SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE`);
    res.json({ count: parseInt(r.rows[0].count) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/read-all', async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Logs -----
app.get('/api/logs/:pondId', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM control_logs WHERE pond_id = $1 ORDER BY timestamp DESC LIMIT 100`,
      [req.params.pondId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Dashboard summary -----
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const [farms, ponds, devices, mortality, notifications, feeding] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM farms`),
      pool.query(`SELECT COUNT(*) as count FROM ponds`),
      pool.query(`SELECT COUNT(*) as connected FROM device_status WHERE is_connected = TRUE`),
      pool.query(`SELECT COALESCE(SUM(death_count), 0) as total FROM mortality_records WHERE recorded_at > NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE`),
      pool.query(`SELECT COUNT(*) as count FROM feeding_logs WHERE timestamp > NOW() - INTERVAL '24 hours'`),
    ]);

    res.json({
      total_farms: parseInt(farms.rows[0].count),
      total_ponds: parseInt(ponds.rows[0].count),
      connected_devices: parseInt(devices.rows[0].connected),
      deaths_30d: parseInt(mortality.rows[0].total),
      unread_notifications: parseInt(notifications.rows[0].count),
      feedings_24h: parseInt(feeding.rows[0].count),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Health check ringan (ping DB). Diekspos juga di /api/health agar bisa dicek
// dari domain publik via proxy nginx (location /api/).
async function healthHandler(req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down', error: e.message });
  }
}
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ============================
// Lele Feeder Integration
// ============================
const { registerLeleHandlers } = require('./lele-integration');
registerLeleHandlers({ app, pool, mqttClient: leleMqttClient });

const { registerLeleOtaHandlers } = require('./lele-ota');
registerLeleOtaHandlers({ app, pool, mqttClient: leleMqttClient });

const { registerWaHandlers } = require('./wa-notify');
registerWaHandlers({ app, pool });

// Pengelolaan siklus budidaya (tebar→panen) — lihat docs/RENCANA-PENGELOLAAN-KOLAM.md
const { registerCycleHandlers } = require('./cycle-management');
registerCycleHandlers({ app, pool });

const { registerAuthHandlers } = require('./auth');
registerAuthHandlers({ app, pool });

const { registerUserHandlers } = require('./user-management');
registerUserHandlers({ app, pool });

const { registerQuickLoginHandlers } = require('./quick-login');
registerQuickLoginHandlers({ app, pool });

// Seed DEMO hanya bila diminta (mode `./run.sh demo`). Tak pernah di produksi.
if (process.env.SEED_DEMO === 'true') {
  require('./seed-demo').ensureDemoSeed(pool).catch((e) => console.error('⚠ Demo seed error:', e.message));
}

app.listen(PORT, () => {
  console.log(`🐟 Backend Smart Aquaculture berjalan di port ${PORT}`);
});
