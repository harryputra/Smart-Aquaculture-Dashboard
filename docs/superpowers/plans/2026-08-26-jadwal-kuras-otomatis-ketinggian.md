# Jadwal Kuras Otomatis Berbasis Ketinggian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah mode "Berdasarkan Ketinggian" di jadwal kuras — buka katup kuras terjadwal, tutup otomatis saat ketinggian target tercapai, lanjut isi ulang otomatis sampai ketinggian target kedua, berulang tiap hari — plus perbaiki bug lama (mode durasi tak pernah auto-close) dan gap otorisasi lintas-organisasi di endpoint jadwal.

**Architecture:** Reuse mekanisme `valveAutoStop`/`forceCloseValve`/`checkValveAutoStop` yang sudah ada dari fitur Kontrol Air (`backend/server.js`) dengan menambah satu hook opsional `onClosed(reasonCode)` pada watch — dipakai untuk mengantai (chain) tahap kuras→isi ulang dan mengirim notifikasi, tanpa mengubah perilaku watch manual yang sudah ada. Cron kuras (`node-cron`, sudah ada) dialihkan memanggil fungsi baru `runScheduledDrainCycle()` yang menangani kedua mode (`duration` dan `depth`).

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), MQTT (`mqtt`), `node-cron`, React (Vite), tanpa framework test otomatis (codebase ini tidak punya test suite — verifikasi lewat `node --check` untuk sintaks dan verifikasi manual/curl untuk perilaku, mengikuti pola yang sudah dipakai di fitur Kontrol Air sebelumnya).

Spec lengkap: `docs/superpowers/specs/2026-08-26-jadwal-kuras-otomatis-ketinggian-design.md`

---

### Task 1: Migrasi database + wiring run.sh/run.bat

**Files:**
- Create: `database/migration-drain-schedule-depth.sql`
- Modify: `run.sh` (array `MIGRATIONS=(...)`)
- Modify: `run.bat` (daftar `call :runsql`)

- [ ] **Step 1: Buat file migrasi**

```sql
-- ============================
-- Smart Aquaculture - MIGRATION JADWAL KURAS BERBASIS KETINGGIAN
-- Menambahkan mode "depth" pada drain_schedules: kuras otomatis sampai
-- ketinggian target, lalu isi ulang otomatis sampai ketinggian target kedua.
-- Aman dijalankan berkali-kali (idempotent)
-- ============================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='mode') THEN
        ALTER TABLE drain_schedules ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'duration';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='drain_target_cm') THEN
        ALTER TABLE drain_schedules ADD COLUMN drain_target_cm NUMERIC(6,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='refill_target_cm') THEN
        ALTER TABLE drain_schedules ADD COLUMN refill_target_cm NUMERIC(6,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='safety_cap_minutes') THEN
        ALTER TABLE drain_schedules ADD COLUMN safety_cap_minutes INTEGER DEFAULT 30;
    END IF;
END
$$;

SELECT 'Migration jadwal kuras berbasis ketinggian selesai!' as status;
```

- [ ] **Step 2: Tambahkan ke `run.sh`**

Cari array `MIGRATIONS=(...)` (berisi baris `database/migration-water-devices.sql` dan `database/migration-rtc-lostpower.sql`), tambahkan baris baru setelah `migration-rtc-lostpower.sql`:

```
  database/migration-drain-schedule-depth.sql
```

- [ ] **Step 3: Tambahkan ke `run.bat`**

Cari baris `call :runsql migration-rtc-lostpower.sql`, tambahkan setelahnya:

```
call :runsql migration-drain-schedule-depth.sql
```

- [ ] **Step 4: Verifikasi sintaks SQL**

Run: `node -e "require('fs').readFileSync('database/migration-drain-schedule-depth.sql','utf8')"` (memastikan file terbaca tanpa error encoding)
Expected: tidak ada output/error

- [ ] **Step 5: Commit**

```bash
git add database/migration-drain-schedule-depth.sql run.sh run.bat
git commit -m "feat(kuras): migrasi kolom mode ketinggian di drain_schedules"
```

---

### Task 2: Backend — perluas `valveAutoStop` watch dengan hook `onClosed` + `safetyCapMinutes`

**Files:**
- Modify: `backend/server.js` (fungsi `forceCloseValve`, ~line 150-175)
- Modify: `backend/server.js` (dua tempat pembuatan watch manual di `POST /api/control/:pondId/valve`, ~line 793-812 dan ~line 826-839)

Tujuan task ini: siapkan mekanisme chaining TANPA mengubah perilaku watch manual (Kontrol Air) yang sudah teruji — watch manual tidak akan pernah set `onClosed`, jadi hook baru ini no-op untuk semua path yang sudah ada.

- [ ] **Step 1: Tambah hook `onClosed` + perbaiki teks `safety_cap` supaya dinamis (bukan hardcode "15 menit")**

Di `backend/server.js`, cari fungsi `forceCloseValve`:

```js
async function forceCloseValve(pond_id, valveKind, reasonCode) {
  const key = `${pond_id}:${valveKind}`;
  const watch = valveAutoStop[key];
  if (!watch) return; // sudah ditutup oleh timer lain (mis. safetyTimer & durationTimer barengan di 15 menit)
  clearValveWatch(pond_id, valveKind);

  const p = await pool.query(`SELECT farm_id FROM ponds WHERE pond_id = $1`, [pond_id]);
  const farm_id = p.rows[0]?.farm_id;
  if (!farm_id) { console.error(`forceCloseValve: farm_id not found for pond ${pond_id}`); return; }

  const command = valveKind === 'drain' ? 'close_valve' : 'close_inlet';
  mqttClient.publish(valveTopic(farm_id, pond_id), JSON.stringify({ command, source: 'auto' }));

  const REASON_TEXT = {
    depth_reached: () => `Auto-stop: ketinggian target ${Number(watch?.targetDepth).toFixed(1)}cm tercapai`,
    duration: () => `Auto-stop: durasi ${watch?.durationMinutes} menit habis`,
    safety_cap: () => `Auto-stop: batas pengaman 15 menit tercapai (kondisi target tak tercapai)`,
  };
  const reason = (REASON_TEXT[reasonCode] || (() => 'Auto-stop'))();
  const action = valveKind === 'drain' ? 'valve_close' : 'inlet_close';

  await pool.query(
    `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, $2, 'auto', $3)`,
    [pond_id, action, reason]
  );
}
```

Ganti jadi:

```js
async function forceCloseValve(pond_id, valveKind, reasonCode) {
  const key = `${pond_id}:${valveKind}`;
  const watch = valveAutoStop[key];
  if (!watch) return; // sudah ditutup oleh timer lain (mis. safetyTimer & durationTimer barengan)
  clearValveWatch(pond_id, valveKind);

  const p = await pool.query(`SELECT farm_id FROM ponds WHERE pond_id = $1`, [pond_id]);
  const farm_id = p.rows[0]?.farm_id;
  if (!farm_id) { console.error(`forceCloseValve: farm_id not found for pond ${pond_id}`); return; }

  const command = valveKind === 'drain' ? 'close_valve' : 'close_inlet';
  mqttClient.publish(valveTopic(farm_id, pond_id), JSON.stringify({ command, source: 'auto' }));

  const REASON_TEXT = {
    depth_reached: () => `Auto-stop: ketinggian target ${Number(watch?.targetDepth).toFixed(1)}cm tercapai`,
    duration: () => `Auto-stop: durasi ${watch?.durationMinutes} menit habis`,
    safety_cap: () => `Auto-stop: batas pengaman ${Number(watch?.safetyCapMinutes ?? 15)} menit tercapai (kondisi target tak tercapai)`,
  };
  const reason = (REASON_TEXT[reasonCode] || (() => 'Auto-stop'))();
  const action = valveKind === 'drain' ? 'valve_close' : 'inlet_close';

  await pool.query(
    `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, $2, 'auto', $3)`,
    [pond_id, action, reason]
  );

  // Hook opsional dipakai siklus terjadwal (chaining kuras->isi ulang, notifikasi).
  // Watch manual (Kontrol Air) tidak pernah set ini -> no-op, perilaku lama tak berubah.
  if (watch.onClosed) {
    await watch.onClosed(reasonCode).catch(err => console.error('valve onClosed hook failed:', err.message));
  }
}
```

- [ ] **Step 2: Tambah `safetyCapMinutes` di dua tempat pembuatan watch manual**

Cari (di `POST /api/control/:pondId/valve`):

```js
        const watch = {
          mode: plan.mode,
          targetDepth: plan.targetDepth,
          durationMinutes: plan.durationMinutes,
          startedAt: new Date(),
          safetyTimer: setTimeout(
            () => forceCloseValve(pond_id, valveKind, 'safety_cap')
              .catch(err => console.error('forceCloseValve (safety_cap) failed:', err.message)),
            VALVE_SAFETY_CAP_MS
          ),
          durationTimer: null,
        };
```

Ganti jadi (tambah satu baris `safetyCapMinutes`):

```js
        const watch = {
          mode: plan.mode,
          targetDepth: plan.targetDepth,
          durationMinutes: plan.durationMinutes,
          startedAt: new Date(),
          safetyCapMinutes: VALVE_SAFETY_CAP_MS / 60000,
          safetyTimer: setTimeout(
            () => forceCloseValve(pond_id, valveKind, 'safety_cap')
              .catch(err => console.error('forceCloseValve (safety_cap) failed:', err.message)),
            VALVE_SAFETY_CAP_MS
          ),
          durationTimer: null,
        };
```

Lalu cari (watch fallback "safety-only" tepat di bawahnya):

```js
        if (!valveAutoStop[`${pond_id}:${valveKind}`]) {
          valveAutoStop[`${pond_id}:${valveKind}`] = {
            mode: 'safety_only',
            targetDepth: null,
            durationMinutes: null,
            startedAt: new Date(),
            safetyTimer: setTimeout(
              () => forceCloseValve(pond_id, valveKind, 'safety_cap')
                .catch(err => console.error('forceCloseValve (safety_cap) failed:', err.message)),
              VALVE_SAFETY_CAP_MS
            ),
            durationTimer: null,
          };
        }
```

Ganti jadi:

```js
        if (!valveAutoStop[`${pond_id}:${valveKind}`]) {
          valveAutoStop[`${pond_id}:${valveKind}`] = {
            mode: 'safety_only',
            targetDepth: null,
            durationMinutes: null,
            startedAt: new Date(),
            safetyCapMinutes: VALVE_SAFETY_CAP_MS / 60000,
            safetyTimer: setTimeout(
              () => forceCloseValve(pond_id, valveKind, 'safety_cap')
                .catch(err => console.error('forceCloseValve (safety_cap) failed:', err.message)),
              VALVE_SAFETY_CAP_MS
            ),
            durationTimer: null,
          };
        }
```

- [ ] **Step 3: Verifikasi sintaks**

Run: `node --check backend/server.js`
Expected: tidak ada output (exit code 0)

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "refactor(kuras): tambah hook onClosed pada valveAutoStop untuk chaining"
```

---

### Task 3: Backend — `runScheduledDrainCycle()` + wire ke cron (fitur ketinggian + fix bug durasi)

**Files:**
- Modify: `backend/server.js` (tambah fungsi baru setelah `checkValveAutoStop`, ~line 190)
- Modify: `backend/server.js` (loop drain di `cron.schedule('* * * * *', ...)`, ~line 500-513)

- [ ] **Step 1: Tambah fungsi `runScheduledDrainCycle`**

Cari fungsi `checkValveAutoStop` (diakhiri dengan `}` sebelum komentar `// MQTT Message Handler`):

```js
async function checkValveAutoStop(pond_id, currentDepth) {
  try {
    if (currentDepth == null || isNaN(parseFloat(currentDepth))) return;
    const depth = parseFloat(currentDepth);
    for (const valveKind of ['drain', 'inlet']) {
      const watch = valveAutoStop[`${pond_id}:${valveKind}`];
      if (!watch || (watch.mode !== 'depth_target' && watch.mode !== 'depth_percent')) continue;
      const reached = valveKind === 'drain' ? depth <= watch.targetDepth : depth >= watch.targetDepth;
      if (reached) await forceCloseValve(pond_id, valveKind, 'depth_reached');
    }
  } catch (e) {
    console.error('Valve auto-stop check error:', e.message);
  }
}

// ============================
// MQTT Message Handler
// ============================
```

Sisipkan fungsi baru di antara keduanya (setelah `checkValveAutoStop`, sebelum komentar MQTT Message Handler):

```js
async function checkValveAutoStop(pond_id, currentDepth) {
  try {
    if (currentDepth == null || isNaN(parseFloat(currentDepth))) return;
    const depth = parseFloat(currentDepth);
    for (const valveKind of ['drain', 'inlet']) {
      const watch = valveAutoStop[`${pond_id}:${valveKind}`];
      if (!watch || (watch.mode !== 'depth_target' && watch.mode !== 'depth_percent')) continue;
      const reached = valveKind === 'drain' ? depth <= watch.targetDepth : depth >= watch.targetDepth;
      if (reached) await forceCloseValve(pond_id, valveKind, 'depth_reached');
    }
  } catch (e) {
    console.error('Valve auto-stop check error:', e.message);
  }
}

// ============================
// Jadwal kuras terjadwal: mode 'duration' (fix auto-close) & 'depth'
// (kuras->isi ulang otomatis berbasis ketinggian, chaining lewat onClosed)
// ============================
async function runScheduledDrainCycle(schedule) {
  const { id: scheduleId, pond_id, farm_id, mode } = schedule;

  if (mode === 'depth') {
    const latest = latestData[pond_id];
    const freshMs = latest ? Date.now() - new Date(latest.timestamp).getTime() : Infinity;
    if (!latest || latest.depth == null || isNaN(parseFloat(latest.depth)) || freshMs > 30000) {
      await pool.query(
        `INSERT INTO notifications (pond_id, type, category, title, message)
         VALUES ($1,'risk','system',$2,$3)`,
        [pond_id, '🚱 Jadwal Kuras Gagal Dijalankan',
         `Jadwal kuras berbasis ketinggian pukul ${schedule.schedule_time.toString().slice(0, 5)} tidak bisa dijalankan: ` +
         `data ketinggian air tidak tersedia atau sudah usang. Katup TIDAK dibuka. Cek koneksi sensor kolam.`]
      ).catch(() => {});
      return;
    }

    clearValveWatch(pond_id, 'drain');
    clearValveWatch(pond_id, 'inlet');

    const drainTarget = parseFloat(schedule.drain_target_cm);
    const refillTarget = parseFloat(schedule.refill_target_cm);
    const capMinutes = Math.max(1, schedule.safety_cap_minutes || 30);
    const capMs = capMinutes * 60 * 1000;

    mqttClient.publish(valveTopic(farm_id, pond_id), JSON.stringify({ command: 'open_valve', source: 'schedule' }));
    await pool.query(
      `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1,'valve_open','schedule',$2)`,
      [pond_id, `Jadwal kuras: target ketinggian ${drainTarget.toFixed(1)}cm`]
    );

    valveAutoStop[`${pond_id}:drain`] = {
      mode: 'depth_target',
      targetDepth: drainTarget,
      durationMinutes: null,
      startedAt: new Date(),
      safetyCapMinutes: capMinutes,
      safetyTimer: setTimeout(
        () => forceCloseValve(pond_id, 'drain', 'safety_cap')
          .catch(err => console.error('forceCloseValve (schedule drain safety_cap) failed:', err.message)),
        capMs
      ),
      durationTimer: null,
      onClosed: async (reasonCode) => {
        await pool.query(`UPDATE drain_schedules SET last_executed = NOW() WHERE id = $1`, [scheduleId]).catch(() => {});

        if (reasonCode !== 'depth_reached') {
          await pool.query(
            `INSERT INTO notifications (pond_id, type, category, title, message)
             VALUES ($1,'risk','system',$2,$3)`,
            [pond_id, '⚠️ Kuras Terjadwal Terhenti (Batas Waktu)',
             `Katup kuras ditutup paksa setelah ${capMinutes} menit karena target ${drainTarget.toFixed(1)}cm belum tercapai. ` +
             `Isi ulang TIDAK dilanjutkan otomatis — periksa katup/sensor kolam.`]
          ).catch(() => {});
          return;
        }

        await pool.query(
          `INSERT INTO notifications (pond_id, type, category, title, message)
           VALUES ($1,'info','system',$2,$3)`,
          [pond_id, '🚰 Kuras Terjadwal: Target Tercapai',
           `Ketinggian ${drainTarget.toFixed(1)}cm tercapai, katup kuras ditutup otomatis. Lanjut isi ulang ke ${refillTarget.toFixed(1)}cm.`]
        ).catch(() => {});

        mqttClient.publish(valveTopic(farm_id, pond_id), JSON.stringify({ command: 'open_inlet', source: 'schedule' }));
        await pool.query(
          `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1,'inlet_open','schedule',$2)`,
          [pond_id, `Jadwal kuras: lanjut isi ulang ke ${refillTarget.toFixed(1)}cm`]
        ).catch(() => {});

        valveAutoStop[`${pond_id}:inlet`] = {
          mode: 'depth_target',
          targetDepth: refillTarget,
          durationMinutes: null,
          startedAt: new Date(),
          safetyCapMinutes: capMinutes,
          safetyTimer: setTimeout(
            () => forceCloseValve(pond_id, 'inlet', 'safety_cap')
              .catch(err => console.error('forceCloseValve (schedule inlet safety_cap) failed:', err.message)),
            capMs
          ),
          durationTimer: null,
          onClosed: async (reasonCode2) => {
            await pool.query(`UPDATE drain_schedules SET last_executed = NOW() WHERE id = $1`, [scheduleId]).catch(() => {});

            if (reasonCode2 !== 'depth_reached') {
              await pool.query(
                `INSERT INTO notifications (pond_id, type, category, title, message)
                 VALUES ($1,'risk','system',$2,$3)`,
                [pond_id, '⚠️ Isi Ulang Terjadwal Terhenti (Batas Waktu)',
                 `Katup isi ditutup paksa setelah ${capMinutes} menit karena target ${refillTarget.toFixed(1)}cm belum tercapai. Periksa katup/sensor kolam.`]
              ).catch(() => {});
              return;
            }

            await pool.query(
              `INSERT INTO notifications (pond_id, type, category, title, message)
               VALUES ($1,'success','system',$2,$3)`,
              [pond_id, '✅ Siklus Kuras Terjadwal Selesai',
               `Kolam berhasil dikuras ke ${drainTarget.toFixed(1)}cm lalu diisi ulang ke ${refillTarget.toFixed(1)}cm sesuai jadwal.`]
            ).catch(() => {});
          },
        };
      },
    };
    return;
  }

  // mode 'duration' (default/lama) -- diperbaiki agar benar-benar auto-close,
  // memakai nilai duration_minutes asli (bukan dipotong ke 15 menit seperti
  // kontrol manual sekali klik -- ini jadwal rutin yang sengaja diatur user).
  clearValveWatch(pond_id, 'drain');
  mqttClient.publish(valveTopic(farm_id, pond_id), JSON.stringify({ command: 'open_valve', source: 'schedule' }));
  await pool.query(
    `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, 'valve_open', 'schedule', 'Jadwal otomatis')`,
    [pond_id]
  );

  const durationMinutes = Math.max(1, schedule.duration_minutes || 30);
  valveAutoStop[`${pond_id}:drain`] = {
    mode: 'duration',
    targetDepth: null,
    durationMinutes,
    startedAt: new Date(),
    safetyTimer: setTimeout(
      () => forceCloseValve(pond_id, 'drain', 'duration')
        .catch(err => console.error('forceCloseValve (schedule duration) failed:', err.message)),
      durationMinutes * 60 * 1000
    ),
    durationTimer: null,
    onClosed: async () => {
      await pool.query(`UPDATE drain_schedules SET last_executed = NOW() WHERE id = $1`, [scheduleId]).catch(() => {});
    },
  };
}

// ============================
// MQTT Message Handler
// ============================
```

- [ ] **Step 2: Ganti isi loop drain di cron supaya memanggil fungsi baru**

Cari (di dalam `cron.schedule('* * * * *', async () => { ... })`):

```js
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
```

Ganti jadi:

```js
    for (const s of drains.rows) {
      const days = s.schedule_days.split(',').map(Number);
      if (!days.includes(today)) continue;

      await runScheduledDrainCycle(s).catch(err => console.error('runScheduledDrainCycle error:', err.message));
    }
```

- [ ] **Step 3: Verifikasi sintaks**

Run: `node --check backend/server.js`
Expected: tidak ada output (exit code 0)

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(kuras): jadwal kuras otomatis berbasis ketinggian + fix auto-close mode durasi"
```

---

### Task 4: Backend — perbaiki otorisasi & validasi `/api/schedules`

**Files:**
- Modify: `backend/server.js` (`GET /api/schedules`, `POST /api/schedules`, `DELETE /api/schedules/:id`, ~line 1013-1042)

- [ ] **Step 1: Ganti ketiga handler**

Cari:

```js
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
```

Ganti jadi:

```js
// ----- Drain Schedules -----
const SCHEDULE_MODES = ['duration', 'depth'];

app.get('/api/schedules', async (req, res) => {
  try {
    const { pond_id } = req.query;
    const conditions = [];
    const params = [];
    if (pond_id) { params.push(pond_id); conditions.push(`ds.pond_id = $${params.length}`); }
    if (req.auth?.org) { params.push(req.auth.org); conditions.push(`f.org_id = $${params.length}`); }
    const q = `SELECT ds.* FROM drain_schedules ds
               JOIN ponds p ON ds.pond_id = p.pond_id
               JOIN farms f ON p.farm_id = f.farm_id
               ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
               ORDER BY ds.schedule_time`;
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const {
      pond_id, schedule_time, schedule_days,
      mode = 'duration', duration_minutes,
      drain_target_cm, refill_target_cm, safety_cap_minutes,
    } = req.body;

    if (!pond_id || !schedule_time || !schedule_days) {
      return res.status(400).json({ error: 'pond_id, schedule_time, dan schedule_days wajib diisi.' });
    }
    if (!SCHEDULE_MODES.includes(mode)) {
      return res.status(400).json({ error: 'mode harus "duration" atau "depth".' });
    }

    if (req.auth?.role !== 'superadmin') {
      const own = await pool.query(
        `SELECT 1 FROM ponds p JOIN farms f ON p.farm_id = f.farm_id
         WHERE p.pond_id = $1 AND f.org_id = $2`, [pond_id, req.auth.org]);
      if (!own.rows.length) return res.status(404).json({ error: 'Kolam tidak ditemukan atau bukan milik organisasi Anda.' });
    }

    let finalDurationMinutes = null;
    let finalDrainTarget = null;
    let finalRefillTarget = null;
    let finalSafetyCap = null;

    if (mode === 'depth') {
      finalDrainTarget = parseFloat(drain_target_cm);
      finalRefillTarget = parseFloat(refill_target_cm);
      finalSafetyCap = Math.min(120, Math.max(1, parseInt(safety_cap_minutes, 10) || 30));
      if (isNaN(finalDrainTarget) || isNaN(finalRefillTarget) || finalDrainTarget <= 0 || finalRefillTarget <= 0) {
        return res.status(400).json({ error: 'drain_target_cm dan refill_target_cm wajib angka positif.' });
      }
      if (finalDrainTarget >= finalRefillTarget) {
        return res.status(400).json({ error: 'Target kuras harus lebih kecil dari target isi ulang.' });
      }
    } else {
      finalDurationMinutes = Math.min(120, Math.max(1, parseInt(duration_minutes, 10) || 30));
    }

    const r = await pool.query(
      `INSERT INTO drain_schedules
         (pond_id, schedule_time, schedule_days, duration_minutes, mode, drain_target_cm, refill_target_cm, safety_cap_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [pond_id, schedule_time, schedule_days, finalDurationMinutes, mode, finalDrainTarget, finalRefillTarget, finalSafetyCap]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    if (req.auth?.role !== 'superadmin') {
      const own = await pool.query(
        `SELECT 1 FROM drain_schedules ds
         JOIN ponds p ON ds.pond_id = p.pond_id
         JOIN farms f ON p.farm_id = f.farm_id
         WHERE ds.id = $1 AND f.org_id = $2`, [req.params.id, req.auth.org]);
      if (!own.rows.length) return res.status(404).json({ error: 'Jadwal tidak ditemukan atau bukan milik organisasi Anda.' });
    }
    await pool.query(`DELETE FROM drain_schedules WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 2: Verifikasi sintaks**

Run: `node --check backend/server.js`
Expected: tidak ada output (exit code 0)

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "fix(kuras): validasi kepemilikan organisasi + input di endpoint /api/schedules"
```

---

### Task 5: Frontend — `ScheduleTab.jsx` mode toggle + field ketinggian

**Files:**
- Modify: `frontend/src/components/ScheduleTab.jsx` (seluruh file, 137 baris)

- [ ] **Step 1: Ganti seluruh isi file**

```jsx
import { useEffect, useState } from 'react';
import { Plus, Calendar, Trash2, X } from 'lucide-react';
import { getSchedules, createSchedule, deleteSchedule } from '../services/api';

const DAYS = [
  { id: 1, label: 'S', name: 'Sen' }, { id: 2, label: 'S', name: 'Sel' },
  { id: 3, label: 'R', name: 'Rab' }, { id: 4, label: 'K', name: 'Kam' },
  { id: 5, label: 'J', name: 'Jum' }, { id: 6, label: 'S', name: 'Sab' },
  { id: 7, label: 'M', name: 'Min' },
];

const DEFAULT_FORM = {
  schedule_time: '06:00', selectedDays: [1, 2, 3, 4, 5, 6, 7],
  mode: 'duration',
  duration_minutes: 30,
  drain_target_cm: '', refill_target_cm: '', safety_cap_minutes: 30,
};

export default function ScheduleTab({ pondId }) {
  const [schedules, setSchedules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  async function load() {
    try { setSchedules(await getSchedules(pondId)); } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [pondId]);

  async function add(e) {
    e.preventDefault();
    if (form.mode === 'depth') {
      const drain = parseFloat(form.drain_target_cm);
      const refill = parseFloat(form.refill_target_cm);
      if (isNaN(drain) || isNaN(refill) || drain <= 0 || refill <= 0) {
        alert('Isi target kuras dan target isi ulang dengan angka positif.');
        return;
      }
      if (drain >= refill) {
        alert('Target kuras harus lebih kecil dari target isi ulang.');
        return;
      }
    }
    try {
      await createSchedule({
        pond_id: pondId,
        schedule_time: form.schedule_time,
        schedule_days: form.selectedDays.join(','),
        mode: form.mode,
        duration_minutes: form.mode === 'duration' ? +form.duration_minutes : undefined,
        drain_target_cm: form.mode === 'depth' ? +form.drain_target_cm : undefined,
        refill_target_cm: form.mode === 'depth' ? +form.refill_target_cm : undefined,
        safety_cap_minutes: form.mode === 'depth' ? +form.safety_cap_minutes : undefined,
      });
      setShowModal(false);
      setForm(DEFAULT_FORM);
      load();
    } catch (e) { alert(e.message); }
  }

  async function del(id) {
    if (!confirm('Hapus jadwal?')) return;
    try { await deleteSchedule(id); load(); } catch (e) { alert(e.message); }
  }

  const toggleDay = d => setForm(p => ({
    ...p,
    selectedDays: p.selectedDays.includes(d) ? p.selectedDays.filter(x => x !== d) : [...p.selectedDays, d],
  }));

  function summarize(s) {
    if (s.mode === 'depth') {
      return `Ketinggian: ${parseFloat(s.drain_target_cm).toFixed(1)}cm → ${parseFloat(s.refill_target_cm).toFixed(1)}cm (maks ${s.safety_cap_minutes} mnt/tahap)`;
    }
    return `Durasi: ${s.duration_minutes} menit`;
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Jadwal Pengurasan Otomatis</div>
            <div className="card-subtitle">Kolam akan dikuras sesuai jadwal yang ditetapkan</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Tambah Jadwal
          </button>
        </div>

        {schedules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Calendar size={28} /></div>
            <h3>Belum ada jadwal</h3>
            <p>Tambahkan jadwal untuk pengurasan otomatis</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Hari</th><th>Mode</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.schedule_time.slice(0, 5)}</strong></td>
                    <td>{s.schedule_days.split(',').map(d => DAYS.find(x => x.id == d)?.name).join(', ')}</td>
                    <td>{summarize(s)}</td>
                    <td><span className="badge badge-success">Aktif</span></td>
                    <td>
                      <button className="btn btn-icon btn-secondary" onClick={() => del(s.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Tambah Jadwal Kuras</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={add}>
              <div className="form-group">
                <label className="form-label">Mode Kuras</label>
                <select className="form-select" value={form.mode}
                  onChange={e => setForm({ ...form, mode: e.target.value })}>
                  <option value="duration">Durasi Tetap</option>
                  <option value="depth">Berdasarkan Ketinggian</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Waktu *</label>
                  <input type="time" required className="form-input" value={form.schedule_time}
                    onChange={e => setForm({ ...form, schedule_time: e.target.value })} />
                </div>
                {form.mode === 'duration' ? (
                  <div className="form-group">
                    <label className="form-label">Durasi (menit)</label>
                    <input type="number" required min="1" max="120" className="form-input" value={form.duration_minutes}
                      onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Batas waktu maks/tahap (menit)</label>
                    <input type="number" required min="1" max="120" className="form-input" value={form.safety_cap_minutes}
                      onChange={e => setForm({ ...form, safety_cap_minutes: e.target.value })} />
                  </div>
                )}
              </div>

              {form.mode === 'depth' && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Kuras sampai (cm) *</label>
                    <input type="number" required min="0" step="0.1" className="form-input" placeholder="mis. 40"
                      value={form.drain_target_cm}
                      onChange={e => setForm({ ...form, drain_target_cm: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Isi ulang sampai (cm) *</label>
                    <input type="number" required min="0" step="0.1" className="form-input" placeholder="mis. 50"
                      value={form.refill_target_cm}
                      onChange={e => setForm({ ...form, refill_target_cm: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Hari</label>
                <div className="day-picker">
                  {DAYS.map(d => (
                    <button type="button" key={d.id}
                      className={'day-btn' + (form.selectedDays.includes(d.id) ? ' active' : '')}
                      onClick={() => toggleDay(d.id)} title={d.name}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verifikasi build frontend**

Run: `cd frontend && npm run build`
Expected: build sukses tanpa error (khususnya tidak ada error JSX/import di `ScheduleTab.jsx`)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ScheduleTab.jsx
git commit -m "feat(kuras): form jadwal kuras dukung mode berdasarkan ketinggian"
```

---

### Task 6: Verifikasi manual end-to-end (setelah deploy)

Codebase ini tidak punya test suite otomatis (tidak ada Jest/Mocha, tidak ada folder test). Task-task sebelumnya sudah diverifikasi sintaks (`node --check`, `npm run build`). Perilaku runtime (MQTT publish, cron timing, sensor ketinggian nyata) **tidak bisa disimulasikan secara lokal** — perlu backend live + device/dummy publisher, sama seperti keterbatasan yang sudah didokumentasikan di fitur Kontrol Air sebelumnya.

- [ ] **Step 1: Deploy** — user menjalankan `./run.sh` di server (migrasi `database/migration-drain-schedule-depth.sql` ikut jalan otomatis).

- [ ] **Step 2: Uji otorisasi lintas-organisasi** (bisa dari sini via curl ke API publik, tidak perlu MQTT):
  - Login sebagai user non-superadmin org A.
  - `GET /api/schedules?pond_id=<pond milik org B>` → harus balas array kosong atau tetap ter-filter ke org sendiri (bukan data org B).
  - `POST /api/schedules` dengan `pond_id` milik org B → harus 404 "Kolam tidak ditemukan atau bukan milik organisasi Anda."
  - `DELETE /api/schedules/:id` dengan id jadwal milik org B → harus 404.

- [ ] **Step 3: Uji mode ketinggian di dashboard** — buat jadwal mode "Berdasarkan Ketinggian" untuk kolam dengan sensor ketinggian aktif, set jam beberapa menit ke depan, pantau tab Kontrol Air + halaman Notifikasi saat jadwal jalan: katup kuras terbuka → tertutup otomatis saat target tercapai → katup isi terbuka otomatis → tertutup saat target isi tercapai → notifikasi sukses muncul.

- [ ] **Step 4: Uji mode durasi (fix bug lama)** — buat/pakai jadwal mode "Durasi Tetap", pastikan katup benar-benar tertutup sendiri setelah durasi habis (cek `control_logs` atau tab Kontrol Air), tidak menyala terus seperti sebelumnya.

- [ ] **Step 5: Uji sensor mati** — matikan/lepas sensor ketinggian kolam yang punya jadwal mode ketinggian, biarkan jadwal lewat jam eksekusi, pastikan katup TIDAK terbuka dan notifikasi "Jadwal Kuras Gagal Dijalankan" muncul.

---

## Catatan tambahan (dari spec, sengaja tidak dikerjakan)

- Gap otorisasi serupa di `/api/feeding-schedules` TIDAK diperbaiki di plan ini — di luar cakupan fitur kuras, perlu plan terpisah.
- Tidak ada fitur edit jadwal (cuma tambah/hapus, sama seperti sebelumnya).
- Tidak ada perubahan firmware/OTA.
