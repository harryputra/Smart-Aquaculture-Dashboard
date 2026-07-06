// ============================
// Lele Feeder V3.2 - Hybrid Dual Control
// Sesuai firmware esp32_pakan_lele_v3_2.ino
// ============================

function registerLeleHandlers({ app, pool, mqttClient }) {
  mqttClient.subscribe('lele/device/status');
  mqttClient.subscribe('lele/biomass/sample');
  mqttClient.subscribe('lele/biomass/summary');
  mqttClient.subscribe('lele/feed/session');
  mqttClient.subscribe('lele/feed/batch');
  mqttClient.subscribe('lele/feed/summary');
  mqttClient.subscribe('lele/feed/progress');   // telemetri live penimbangan
  mqttClient.subscribe('lele/device/error');
  mqttClient.subscribe('lele/device/ack');
  mqttClient.subscribe('lele/device/ota_status');   // progres OTA dari device

  console.log('✓ Lele V3.2 MQTT handlers subscribed');

  const ackCache = {};
  const liveDataCache = {};
  const feedProgressCache = {};   // progress penimbangan live per device (in-memory)

  // Rekam lalu lintas MQTT (untuk monitor/diagnostik). Fire-and-forget.
  function recordTraffic(direction, topic, payloadStr, deviceId) {
    let isError = false;
    if (direction === 'in') {
      if (topic.endsWith('/error')) isError = true;
      else if (topic.endsWith('/ack')) {
        try { const p = JSON.parse(payloadStr); if (p && p.success === false) isError = true; } catch (_) {}
      }
    }
    pool.query(
      `INSERT INTO lele_mqtt_traffic (device_id, direction, topic, payload, is_error)
       VALUES ($1,$2,$3,$4,$5)`,
      [deviceId || null, direction, topic, payloadStr, isError]
    ).catch(() => {});
  }

  mqttClient.on('message', async (topic, message) => {
    if (!topic.startsWith('lele/')) return;
    const _raw = message.toString();
    // Rekam inbound lebih dulu (termasuk bila payload bukan JSON valid).
    let _did = null;
    try { _did = JSON.parse(_raw).device_id || null; } catch (_) {}
    // Progress penimbangan high-frequency: cache di memori, JANGAN spam DB/log.
    if (topic === 'lele/feed/progress') {
      try { const p = JSON.parse(_raw); if (p.device_id) feedProgressCache[p.device_id] = { ...p, received_at: Date.now() }; } catch (_) {}
      return;
    }
    recordTraffic('in', topic, _raw, _did);
    try {
      const payload = JSON.parse(_raw);
      const deviceId = payload.device_id || 'unknown';
      const pondR = await pool.query(`SELECT pond_id, is_online FROM lele_devices WHERE device_id = $1`, [deviceId]);
      const pondId = pondR.rows[0]?.pond_id || null;
      const wasOffline = pondR.rows[0]?.is_online === false;   // untuk deteksi "kembali online"

      if (topic === 'lele/device/status') {
        liveDataCache[deviceId] = { ...payload, received_at: new Date() };

        // Transisi OFFLINE → ONLINE = perangkat pulih (internet/listrik kembali).
        if (wasOffline && pondId) {
          await pool.query(
            `INSERT INTO notifications (pond_id, type, category, title, message)
             VALUES ($1,'success','offline','Perangkat Kembali Online',$2)`,
            [pondId, `Feeder ${payload.device_id} kembali terhubung (internet & listrik pulih).`]
          ).catch(() => {});
        }

        await pool.query(`
          INSERT INTO lele_devices (
            device_id, is_online, wifi_connected, mqtt_connected, rtc_ok,
            auto_feed_enabled, feeding_in_progress, current_screen,
            hx_chamber_ok, hx_sampling_ok, fish_count, sample_ready, avg_fish_g,
            seconds_to_next_feed, last_seen,
            feeding_rate_percent, feeding_per_day, target_sample_count,
            saved_sample_count, current_sample_index, chamber_g, sampling_g,
            servo_angle, stepper_enabled, spinner_state, next_schedule_hhmm,
            last_feed_success, last_feed_target_g, last_feed_actual_g,
            last_feed_batch_count, last_feed_time,
            last_error_code, last_error_msg, last_error_time,
            sample_is_manual, spinner_pwm
          ) VALUES ($1, TRUE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(),
            $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
          ON CONFLICT (device_id) DO UPDATE SET
            is_online = TRUE,
            wifi_connected = EXCLUDED.wifi_connected,
            mqtt_connected = EXCLUDED.mqtt_connected,
            rtc_ok = EXCLUDED.rtc_ok,
            auto_feed_enabled = EXCLUDED.auto_feed_enabled,
            feeding_in_progress = EXCLUDED.feeding_in_progress,
            current_screen = EXCLUDED.current_screen,
            hx_chamber_ok = EXCLUDED.hx_chamber_ok,
            hx_sampling_ok = EXCLUDED.hx_sampling_ok,
            fish_count = EXCLUDED.fish_count,
            sample_ready = EXCLUDED.sample_ready,
            avg_fish_g = EXCLUDED.avg_fish_g,
            seconds_to_next_feed = EXCLUDED.seconds_to_next_feed,
            last_seen = NOW(),
            feeding_rate_percent = EXCLUDED.feeding_rate_percent,
            feeding_per_day = EXCLUDED.feeding_per_day,
            target_sample_count = EXCLUDED.target_sample_count,
            saved_sample_count = EXCLUDED.saved_sample_count,
            current_sample_index = EXCLUDED.current_sample_index,
            chamber_g = EXCLUDED.chamber_g,
            sampling_g = EXCLUDED.sampling_g,
            servo_angle = EXCLUDED.servo_angle,
            stepper_enabled = EXCLUDED.stepper_enabled,
            spinner_state = EXCLUDED.spinner_state,
            next_schedule_hhmm = EXCLUDED.next_schedule_hhmm,
            last_feed_success = EXCLUDED.last_feed_success,
            last_feed_target_g = EXCLUDED.last_feed_target_g,
            last_feed_actual_g = EXCLUDED.last_feed_actual_g,
            last_feed_batch_count = EXCLUDED.last_feed_batch_count,
            last_feed_time = EXCLUDED.last_feed_time,
            last_error_code = EXCLUDED.last_error_code,
            last_error_msg = EXCLUDED.last_error_msg,
            last_error_time = EXCLUDED.last_error_time,
            sample_is_manual = EXCLUDED.sample_is_manual,
            spinner_pwm = EXCLUDED.spinner_pwm
        `, [
          deviceId,
          payload.wifi_connected || false,
          payload.mqtt_connected || false,
          payload.rtc_ok || false,
          payload.auto_feed_enabled || false,
          payload.feeding_in_progress || false,
          payload.screen || '',
          payload.hx_chamber_ok || false,
          payload.hx_sampling_ok || false,
          payload.fish_count || 0,
          payload.sample_ready || false,
          payload.avg_fish_g || 0,
          payload.seconds_to_next_feed != null ? payload.seconds_to_next_feed : -1,
          payload.feeding_rate_percent || 0,
          payload.feeding_per_day || 2,
          payload.target_sample_count || 10,
          payload.saved_sample_count || 0,
          payload.current_sample_index || 0,
          payload.chamber_g || 0,
          payload.sampling_g || 0,
          payload.servo_angle || 0,
          payload.stepper_enabled || false,
          payload.spinner_state || 0,
          payload.next_schedule_hhmm || '',
          payload.last_feed_success || false,
          payload.last_feed_target_g || 0,
          payload.last_feed_actual_g || 0,
          payload.last_feed_batch_count || 0,
          payload.last_feed_time || '-',
          payload.last_error_code || 'NONE',
          payload.last_error_msg || '',
          payload.last_error_time || '-',
          payload.sample_is_manual || false,
          payload.spinner_pwm || 0,
        ]);

        // Sync schedules array
        if (Array.isArray(payload.schedules)) {
          for (const sch of payload.schedules) {
            await pool.query(
              `INSERT INTO lele_device_schedules (device_id, schedule_index, hour, minute, enabled, last_synced)
               VALUES ($1, $2, $3, $4, $5, NOW())
               ON CONFLICT (device_id, schedule_index) DO UPDATE SET
                 hour = EXCLUDED.hour, minute = EXCLUDED.minute,
                 enabled = EXCLUDED.enabled, last_synced = NOW()`,
              [deviceId, sch.index, sch.hour, sch.minute, sch.enabled]
            );
          }
        }

        if (payload.firmware_version) {
          await pool.query(`UPDATE lele_devices SET firmware_version = $2 WHERE device_id = $1`,
            [deviceId, payload.firmware_version]);
        }
      }

      else if (topic === 'lele/device/ota_status') {
        await pool.query(
          `UPDATE lele_devices SET ota_state=$2, ota_progress=$3, ota_target_version=$4, ota_at=NOW()
           WHERE device_id=$1`,
          [deviceId, payload.state || null,
           payload.progress != null ? payload.progress : null,
           payload.target_version || null]);
        if (payload.state === 'success' || payload.state === 'fail') {
          await pool.query(
            `INSERT INTO lele_ota_log (device_id, event, to_version, detail) VALUES ($1,$2,$3,$4)`,
            [deviceId, payload.state, payload.target_version || null, payload.detail || null]).catch(() => {});
        }
      }

      else if (topic === 'lele/biomass/sample') {
        await pool.query(
          `INSERT INTO lele_biomass_samples (device_id, pond_id, fish_no, fish_weight_g, sampled_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [deviceId, pondId, payload.fish_no, payload.fish_weight_g]
        );
      }

      else if (topic === 'lele/biomass/summary') {
        await pool.query(
          `INSERT INTO lele_biomass_summary (
            device_id, pond_id, sample_count, average_fish_weight_g, fish_count,
            estimated_biomass_kg, feeding_rate_percent, feeding_per_day,
            estimated_daily_feed_g, estimated_feed_per_schedule_g
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            deviceId, pondId,
            payload.sample_count, payload.average_fish_weight_g, payload.fish_count,
            payload.estimated_biomass_kg, payload.feeding_rate_percent, payload.feeding_per_day,
            payload.estimated_daily_feed_g, payload.estimated_feed_per_schedule_g,
          ]
        );
        if (pondId && payload.fish_count) {
          await pool.query(`UPDATE ponds SET fish_count = $1 WHERE pond_id = $2`, [payload.fish_count, pondId]);
        }
        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1, 'success', 'feeding', $2, $3)`,
          [pondId, 'Biomassa Dihitung',
           `Avg ${payload.average_fish_weight_g}g × ${payload.fish_count} = ${payload.estimated_biomass_kg} kg`]
        );
      }

      else if (topic === 'lele/feed/session' && payload.event === 'start') {
        await pool.query(
          `INSERT INTO lele_feed_sessions (
            feed_session_id, device_id, pond_id, session_name,
            target_total_g, planned_batch_count, max_batch_g, started_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (feed_session_id) DO NOTHING`,
          [payload.feed_session_id, deviceId, pondId, payload.session_name,
           payload.target_total_g, payload.planned_batch_count, payload.max_batch_g]
        );
        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1, 'info', 'feeding', $2, $3)`,
          [pondId, '🍽️ Sesi Pakan Dimulai',
           `${payload.session_name} - target ${payload.target_total_g}g`]
        );
      }

      else if (topic === 'lele/feed/batch') {
        await pool.query(
          `INSERT INTO lele_feed_batches (
            feed_session_id, device_id, batch_no, total_batches,
            target_g, actual_g, spinner_direction, success
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [payload.feed_session_id, deviceId, payload.batch_no, payload.total_batches,
           payload.target_g, payload.actual_g, payload.spinner_direction, payload.success]
        );
      }

      else if (topic === 'lele/feed/summary') {
        await pool.query(
          `UPDATE lele_feed_sessions SET
            actual_total_g = $1, actual_batch_count = $2, success = $3, completed_at = NOW()
           WHERE feed_session_id = $4`,
          [payload.actual_total_g, payload.batch_count, payload.success, payload.feed_session_id]
        );
        if (pondId) {
          await pool.query(
            `INSERT INTO feeding_logs (pond_id, feed_amount_kg, feed_type, triggered_by, note)
             VALUES ($1, $2, $3, $4, $5)`,
            [pondId, (payload.actual_total_g || 0) / 1000, 'Pelet Lele',
             payload.session_name?.includes('AUTO') ? 'schedule' :
             payload.session_name?.includes('WEB') ? 'remote' : 'manual',
             `${payload.session_name} - ${payload.batch_count} batch`]
          );
        }
        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1, $2, 'feeding', $3, $4)`,
          [pondId, payload.success ? 'success' : 'critical',
           payload.success ? '✅ Sesi Pakan Selesai' : '❌ Sesi Pakan Gagal',
           `${payload.session_name}: ${payload.actual_total_g}g dalam ${payload.batch_count} batch`]
        );
      }

      else if (topic === 'lele/device/error') {
        await pool.query(
          `INSERT INTO lele_errors (device_id, pond_id, code, message) VALUES ($1, $2, $3, $4)`,
          [deviceId, pondId, payload.code, payload.message]
        );
        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1, 'critical', 'system', $2, $3)`,
          [pondId, `⚠️ Error: ${payload.code}`, payload.message]
        );
      }

      else if (topic === 'lele/device/ack') {
        ackCache[deviceId] = {
          command: payload.command,
          success: payload.success,
          reason: payload.reason,
          timestamp: payload.timestamp,
          received_at: new Date(),
        };
        console.log(`[ACK] ${deviceId}: ${payload.command} = ${payload.success ? '✓' : '✗'} (${payload.reason})`);
      }
    } catch (e) {
      console.error('Lele MQTT handler error:', e.message);
    }
  });

  // Mark offline after 30s tanpa status
  setInterval(async () => {
    try {
      const off = await pool.query(
        `UPDATE lele_devices SET is_online = FALSE
         WHERE is_online = TRUE AND last_seen < NOW() - INTERVAL '30 seconds'
         RETURNING device_id, pond_id, name`
      );
      for (const d of off.rows) {
        if (!d.pond_id) continue;   // tanpa kolam → tak bisa dipetakan ke notifikasi
        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1,'risk','offline','Perangkat Offline',$2)`,
          [d.pond_id, `Feeder ${d.name || d.device_id} tidak melapor > 30 detik — kemungkinan INTERNET atau LISTRIK terputus. (Jadwal pakan tetap jalan lokal via RTC.)`]
        ).catch(() => {});
      }
      // Bersihkan log traffic lama (retensi 2 hari) agar DB tidak membengkak.
      await pool.query(`DELETE FROM lele_mqtt_traffic WHERE created_at < NOW() - INTERVAL '2 days'`);
    } catch (e) { /* */ }
  }, 15000);

  function sendCommand(deviceId, command, extra = {}) {
    const topic = `lele/device/${deviceId}/command`;
    const payload = { command, source: 'dashboard', timestamp: Date.now(), ...extra };
    const json = JSON.stringify(payload);
    mqttClient.publish(topic, json);
    recordTraffic('out', topic, json, deviceId);
    console.log(`📤 CMD → ${topic}: ${command}`);
  }

  function sendConfig(deviceId, config) {
    const topic = `lele/device/${deviceId}/config`;
    const json = JSON.stringify(config);
    mqttClient.publish(topic, json);
    recordTraffic('out', topic, json, deviceId);
    console.log(`📤 CONFIG → ${topic}`);
  }

  // ============================
  // REST API
  // ============================
  app.get('/api/lele/devices', async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT d.*, p.name as pond_name, p.fish_type
        FROM lele_devices d
        LEFT JOIN ponds p ON d.pond_id = p.pond_id
        ORDER BY d.created_at DESC`);
      const rows = r.rows.map(d => ({
        ...d,
        live_data: liveDataCache[d.device_id] || null,
      }));
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/devices/:deviceId', async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT d.*, p.name as pond_name, p.fish_type
        FROM lele_devices d
        LEFT JOIN ponds p ON d.pond_id = p.pond_id
        WHERE d.device_id = $1`, [req.params.deviceId]);
      if (!r.rows.length) return res.status(404).json(null);
      res.json({ ...r.rows[0], live_data: liveDataCache[req.params.deviceId] || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/lele/devices/:deviceId/assign', async (req, res) => {
    try {
      const { pond_id, name } = req.body;
      const r = await pool.query(
        `UPDATE lele_devices SET pond_id = $1, name = COALESCE($2, name) WHERE device_id = $3 RETURNING *`,
        [pond_id, name, req.params.deviceId]
      );
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================
  // MONITOR / DIAGNOSTIK — lalu lintas MQTT 2 arah
  // ============================
  // Traffic per device. afterId>0 = incremental (live); afterId=0 = N terakhir.
  app.get('/api/lele/devices/:deviceId/traffic', async (req, res) => {
    try {
      const afterId = parseInt(req.query.afterId) || 0;
      const limit = Math.min(parseInt(req.query.limit) || 120, 500);
      let r;
      if (afterId > 0) {
        r = await pool.query(
          `SELECT id, device_id, direction, topic, payload, is_error, created_at
           FROM lele_mqtt_traffic WHERE device_id = $1 AND id > $2
           ORDER BY id ASC LIMIT $3`, [req.params.deviceId, afterId, limit]);
        res.json(r.rows);
      } else {
        r = await pool.query(
          `SELECT id, device_id, direction, topic, payload, is_error, created_at
           FROM lele_mqtt_traffic WHERE device_id = $1
           ORDER BY id DESC LIMIT $2`, [req.params.deviceId, limit]);
        res.json(r.rows.reverse());
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Traffic global (semua device sekaligus).
  app.get('/api/lele/traffic', async (req, res) => {
    try {
      const afterId = parseInt(req.query.afterId) || 0;
      const limit = Math.min(parseInt(req.query.limit) || 150, 500);
      let r;
      if (afterId > 0) {
        r = await pool.query(
          `SELECT id, device_id, direction, topic, payload, is_error, created_at
           FROM lele_mqtt_traffic WHERE id > $1 ORDER BY id ASC LIMIT $2`, [afterId, limit]);
        res.json(r.rows);
      } else {
        r = await pool.query(
          `SELECT id, device_id, direction, topic, payload, is_error, created_at
           FROM lele_mqtt_traffic ORDER BY id DESC LIMIT $1`, [limit]);
        res.json(r.rows.reverse());
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Test koneksi end-to-end: kirim ping → device balas ACK (firmware: "pong").
  app.post('/api/lele/devices/:deviceId/ping', async (req, res) => {
    try {
      sendCommand(req.params.deviceId, 'ping');
      res.json({ success: true, sentAt: Date.now() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Progress penimbangan pakan LIVE (in-memory). null bila tak sedang feeding (>5s basi).
  app.get('/api/lele/devices/:deviceId/feed-progress', (req, res) => {
    const p = feedProgressCache[req.params.deviceId] || null;
    if (p && Date.now() - p.received_at > 5000) return res.json(null);
    res.json(p);
  });

  // Set mode pakan: manual | jadwal | auto (sinkron ke hardware via MQTT).
  app.post('/api/lele/devices/:deviceId/control/feed-mode', (req, res) => {
    const mode = String(req.body?.mode || '').toLowerCase();
    if (!['manual', 'jadwal', 'auto'].includes(mode)) {
      return res.status(400).json({ error: 'mode harus manual|jadwal|auto' });
    }
    sendCommand(req.params.deviceId, 'set_feed_mode', { mode });
    res.json({ success: true, mode });
  });

  // Pengaturan spinner/sebaran: kecepatan tinggi/rendah + arah (0=bolak-balik,1=kanan,2=kiri).
  app.post('/api/lele/devices/:deviceId/control/spinner', (req, res) => {
    const cfg = {};
    const b = req.body || {};
    const clamp = (v) => Math.max(120, Math.min(255, parseInt(v)));
    if (b.pwm_high != null) cfg.spinner_pwm_high = clamp(b.pwm_high);
    if (b.pwm_low != null) cfg.spinner_pwm_low = clamp(b.pwm_low);
    if (b.dir != null) { const d = parseInt(b.dir); if (d >= 0 && d <= 2) cfg.spinner_dir = d; }
    if (!Object.keys(cfg).length) return res.status(400).json({ error: 'Tidak ada parameter spinner.' });
    sendConfig(req.params.deviceId, cfg);
    res.json({ success: true, ...cfg });
  });

  // Mode buka trapdoor: instan vs bertahap (metered) + ambang anti-macet (ms).
  app.post('/api/lele/devices/:deviceId/control/servo', (req, res) => {
    const cfg = {};
    const b = req.body || {};
    if (b.mode != null) { const m = parseInt(b.mode); if (m === 0 || m === 1) cfg.servo_open_mode = m; }
    if (b.stall_ms != null) cfg.servo_stall_ms = Math.max(300, Math.min(8000, parseInt(b.stall_ms)));
    if (!Object.keys(cfg).length) return res.status(400).json({ error: 'Tidak ada parameter servo.' });
    sendConfig(req.params.deviceId, cfg);
    res.json({ success: true, ...cfg });
  });

  // Test spinner: putar X detik tanpa pakan. Opsional pwm (120-255) & dir (1=kanan,2=kiri).
  app.post('/api/lele/devices/:deviceId/control/test-spread', (req, res) => {
    const b = req.body || {};
    const payload = { seconds: Math.max(1, Math.min(15, parseInt(b.seconds) || 5)) };
    if (b.pwm != null) payload.pwm = Math.max(120, Math.min(255, parseInt(b.pwm)));
    if (b.dir != null) { const d = parseInt(b.dir); if (d === 1 || d === 2) payload.dir = d; }
    sendCommand(req.params.deviceId, 'test_spread', payload);
    res.json({ success: true, ...payload });
  });

  // Test trapdoor servo: action = open | close | sweep.
  app.post('/api/lele/devices/:deviceId/control/test-servo', (req, res) => {
    const action = ['open', 'close', 'sweep'].includes(req.body?.action) ? req.body.action : 'sweep';
    sendCommand(req.params.deviceId, 'test_servo', { action });
    res.json({ success: true, action });
  });

  // Test auger/stepper: jog maju/mundur beberapa detik.
  app.post('/api/lele/devices/:deviceId/control/test-auger', (req, res) => {
    const seconds = Math.max(1, Math.min(8, parseInt(req.body?.seconds) || 3));
    const dir = req.body?.dir === 'mundur' ? 'mundur' : 'maju';
    sendCommand(req.params.deviceId, 'test_auger', { seconds, dir });
    res.json({ success: true, seconds, dir });
  });

  // STOP DARURAT: hentikan semua aktuator.
  app.post('/api/lele/devices/:deviceId/control/stop', (req, res) => {
    sendCommand(req.params.deviceId, 'stop_all');
    res.json({ success: true });
  });

  // ---- Laporan commissioning (hasil uji hardware) ----
  app.get('/api/lele/devices/:deviceId/commissioning', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT DISTINCT ON (test_key) test_key, result, note, tested_at
         FROM lele_commissioning WHERE device_id=$1 ORDER BY test_key, tested_at DESC`,
        [req.params.deviceId]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/lele/devices/:deviceId/commissioning', async (req, res) => {
    try {
      const { test_key, result, note = null } = req.body || {};
      if (!test_key || !['pass', 'fail'].includes(result)) return res.status(400).json({ error: 'test_key & result (pass|fail) wajib.' });
      const r = await pool.query(
        `INSERT INTO lele_commissioning (device_id, test_key, result, note) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.deviceId, test_key, result, note]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================
  // REMOTE CONTROL
  // ============================
  app.post('/api/lele/devices/:deviceId/control/manual-feed', async (req, res) => {
    try {
      sendCommand(req.params.deviceId, 'manual_feed_adaptive');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/feed-gram', async (req, res) => {
    try {
      const { target_g } = req.body;
      if (!target_g || target_g < 10 || target_g > 5000) {
        return res.status(400).json({ error: 'target_g harus 10-5000' });
      }
      sendCommand(req.params.deviceId, 'manual_feed_gram', { target_g });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/auto-feed', async (req, res) => {
    try {
      const { enabled } = req.body;
      sendCommand(req.params.deviceId, 'set_auto_feed', { enabled });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/tare', async (req, res) => {
    try {
      const { scale_type } = req.body;
      sendCommand(req.params.deviceId, 'tare', { scale_type });
      await pool.query(
        `INSERT INTO lele_tare_history (device_id, scale_type, triggered_by) VALUES ($1, $2, 'dashboard')`,
        [req.params.deviceId, scale_type]
      );
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/reset-samples', async (req, res) => {
    try { sendCommand(req.params.deviceId, 'reset_samples'); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/start-sampling', async (req, res) => {
    try { sendCommand(req.params.deviceId, 'start_sampling'); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/auto-gen-schedule', async (req, res) => {
    try { sendCommand(req.params.deviceId, 'auto_gen_schedule'); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/valve', async (req, res) => {
    try {
      const { action } = req.body;
      sendCommand(req.params.deviceId, action === 'open' ? 'open_valve' : 'close_valve');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/lele/devices/:deviceId/control/button', async (req, res) => {
    try {
      const { button } = req.body;
      if (!['up', 'down', 'ok', 'back'].includes(button)) {
        return res.status(400).json({ error: 'button harus up/down/ok/back' });
      }
      sendCommand(req.params.deviceId, 'btn', { button });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Update config via MQTT (langsung ke ESP32)
  app.put('/api/lele/devices/:deviceId/config-mqtt', async (req, res) => {
    try {
      const { fish_count, feeding_per_day, target_sample_count, avg_fish_g } = req.body;
      const config = {};
      if (fish_count != null) config.fish_count = +fish_count;
      if (feeding_per_day != null) config.feeding_per_day = +feeding_per_day;
      if (target_sample_count != null) config.target_sample_count = +target_sample_count;
      if (avg_fish_g != null) {
        const avg = +avg_fish_g;
        if (avg <= 0 || avg > 999) {
          return res.status(400).json({ error: 'avg_fish_g harus antara 0.1 - 999 gram' });
        }
        config.avg_fish_g = avg;
      }
      sendConfig(req.params.deviceId, config);
      res.json({ success: true, message: 'Config dikirim ke device' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Update jadwal individual
  app.put('/api/lele/devices/:deviceId/schedule/:idx', async (req, res) => {
    try {
      const idx = parseInt(req.params.idx);
      const { hour, minute, enabled } = req.body;
      const config = { schedule_index: idx };
      if (hour != null) config.hour = +hour;
      if (minute != null) config.minute = +minute;
      if (enabled != null) config.enabled = !!enabled;
      sendConfig(req.params.deviceId, config);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/devices/:deviceId/last-ack', async (req, res) => {
    res.json(ackCache[req.params.deviceId] || null);
  });

  app.get('/api/lele/devices/:deviceId/schedules-synced', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM lele_device_schedules WHERE device_id = $1 ORDER BY schedule_index`,
        [req.params.deviceId]
      );
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================
  // DATA QUERIES
  // ============================
  app.get('/api/lele/devices/:deviceId/biomass-samples', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM lele_biomass_samples WHERE device_id = $1 ORDER BY sampled_at DESC LIMIT 100`,
        [req.params.deviceId]
      );
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/devices/:deviceId/biomass-summary', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM lele_biomass_summary WHERE device_id = $1 ORDER BY summarized_at DESC LIMIT 20`,
        [req.params.deviceId]
      );
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/devices/:deviceId/growth', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT summarized_at as recorded_at, average_fish_weight_g, estimated_biomass_kg, fish_count
         FROM lele_biomass_summary WHERE device_id = $1 ORDER BY summarized_at DESC LIMIT 30`,
        [req.params.deviceId]
      );
      res.json(r.rows.reverse());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/devices/:deviceId/sessions', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT s.*,
          (SELECT json_agg(b.*) FROM lele_feed_batches b WHERE b.feed_session_id = s.feed_session_id) as batches
         FROM lele_feed_sessions s
         WHERE s.device_id = $1 ORDER BY s.started_at DESC LIMIT 50`,
        [req.params.deviceId]
      );
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/devices/:deviceId/errors', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM lele_errors WHERE device_id = $1 ORDER BY occurred_at DESC LIMIT 50`,
        [req.params.deviceId]
      );
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/lele/devices/:deviceId/tare-history', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM lele_tare_history WHERE device_id = $1 ORDER BY occurred_at DESC LIMIT 20`,
        [req.params.deviceId]
      );
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ Lele V3.2 API routes registered');
}

module.exports = { registerLeleHandlers };
