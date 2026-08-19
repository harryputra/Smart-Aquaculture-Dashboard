# Kontrol Air: Ketinggian Air + Auto-Stop Katup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan tampilan ketinggian air live + opsi auto-stop (durasi/target ketinggian/persentase perubahan, dengan batas pengaman 15 menit) ke tombol buka katup Pengurasan & Pengisian di tab Kontrol Air, dan buat status katup terbaca dari server (bukan state lokal yang reset saat refresh).

**Architecture:** Semua logika timing/pemantauan baru ada di `backend/server.js` (in-memory timer per katup, mengikuti pola `drainStates`/`triggerAutoDrainCycle` yang sudah ada), dipicu dari endpoint kontrol yang sudah ada dan dari handler pesan MQTT `sensors` yang sudah ada. Tidak ada perubahan firmware. Frontend (`ControlTab.jsx`) menambah picker mode auto-stop per katup dan polling status dari endpoint baru.

**Tech Stack:** Node.js/Express + PostgreSQL (backend), React (frontend). Tidak ada framework test di project ini (`backend/package.json` & `frontend/package.json` tidak punya script test) — verifikasi tiap task pakai `curl` manual terhadap API + cek langsung di UI, mengikuti kebiasaan project ini.

**Spec:** `docs/superpowers/specs/2026-08-19-kontrol-air-auto-stop-design.md`

---

## File Structure

- Modify: `backend/server.js` — state in-memory baru, helper `forceCloseValve`/`checkValveAutoStop`, endpoint `/api/control/:pondId/valve` diperluas, endpoint baru `/api/control/:pondId/valve-status`, hook di MQTT handler.
- Modify: `frontend/src/services/api.js` — `controlValve` terima param `autoStop` opsional, tambah `getValveStatus`.
- Modify: `frontend/src/components/ControlTab.jsx` — banner ketinggian air, picker auto-stop per katup, status dari server (bukan `useState` lokal).

---

### Task 1: Backend — state in-memory & helper auto-stop

**Files:**
- Modify: `backend/server.js:128-129` (setelah `const drainStates = {};`)

- [ ] **Step 1: Tambahkan state & helper setelah `drainStates`**

Cari baris ini di `backend/server.js` (sekitar baris 128-129):

```js
const latestData = {};
const drainStates = {}; // { pond_id: { draining: bool, refilling: bool, startTime: Date } }
```

Tambahkan PERSIS setelah baris `drainStates` itu:

```js

// Auto-stop katup manual (Kontrol Air). Key: `${pond_id}:${valveKind}`,
// valveKind = 'drain' | 'inlet'. Timer di sini, bukan di firmware — pola
// sama seperti drainStates/triggerAutoDrainCycle di atas.
const valveAutoStop = {};
const VALVE_SAFETY_CAP_MS = 15 * 60 * 1000; // batas pengaman keras, berlaku di SEMUA mode

function valveTopic(farm_id, pond_id) {
  return `aquaculture/${farm_id}/${pond_id}/control`;
}

function clearValveWatch(pond_id, valveKind) {
  const key = `${pond_id}:${valveKind}`;
  const watch = valveAutoStop[key];
  if (!watch) return;
  clearTimeout(watch.safetyTimer);
  if (watch.durationTimer) clearTimeout(watch.durationTimer);
  delete valveAutoStop[key];
}

async function forceCloseValve(pond_id, valveKind, reasonCode) {
  const key = `${pond_id}:${valveKind}`;
  const watch = valveAutoStop[key];
  clearValveWatch(pond_id, valveKind);

  const p = await pool.query(`SELECT farm_id FROM ponds WHERE pond_id = $1`, [pond_id]);
  const farm_id = p.rows[0]?.farm_id;
  if (!farm_id) return;

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

async function checkValveAutoStop(pond_id, currentDepth) {
  if (currentDepth == null || isNaN(parseFloat(currentDepth))) return;
  const depth = parseFloat(currentDepth);
  for (const valveKind of ['drain', 'inlet']) {
    const watch = valveAutoStop[`${pond_id}:${valveKind}`];
    if (!watch || (watch.mode !== 'depth_target' && watch.mode !== 'depth_percent')) continue;
    const reached = valveKind === 'drain' ? depth <= watch.targetDepth : depth >= watch.targetDepth;
    if (reached) await forceCloseValve(pond_id, valveKind, 'depth_reached');
  }
}
```

- [ ] **Step 2: Cek server masih start tanpa error**

Run: `cd backend && node --check server.js`
Expected: tidak ada output (artinya syntax valid). Kalau ada `SyntaxError`, perbaiki sebelum lanjut.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(kontrol-air): state & helper auto-stop katup di backend"
```

---

### Task 2: Backend — endpoint valve terima `auto_stop`

**Files:**
- Modify: `backend/server.js:646-668` (endpoint `POST /api/control/:pondId/valve`)

- [ ] **Step 1: Ganti isi endpoint**

Cari blok ini (persis, termasuk baris `// ----- Control -----` di atasnya):

```js
// ----- Control -----
app.post('/api/control/:pondId/valve', requirePondAccess('pondId'), async (req, res) => {
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
```

Ganti dengan:

```js
// ----- Control -----
const VALVE_KIND_BY_COMMAND = {
  open_valve: 'drain', close_valve: 'drain',
  open_inlet: 'inlet', close_inlet: 'inlet',
};

app.post('/api/control/:pondId/valve', requirePondAccess('pondId'), async (req, res) => {
  try {
    const { command, source = 'manual', auto_stop } = req.body;
    const pond_id = req.params.pondId;
    const p = await pool.query(`SELECT farm_id FROM ponds WHERE pond_id = $1`, [pond_id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Pond not found' });
    const farm_id = p.rows[0].farm_id;

    const valveKind = VALVE_KIND_BY_COMMAND[command];
    const isOpenCommand = command === 'open_valve' || command === 'open_inlet';

    // Perintah tutup (manual atau lainnya) -> batalkan watch auto-stop yang
    // sedang aktif utk valve ini, supaya timer lama tak kirim close ganda.
    if (!isOpenCommand && valveKind) clearValveWatch(pond_id, valveKind);

    mqttClient.publish(valveTopic(farm_id, pond_id), JSON.stringify({ command, source }));

    const action = command === 'open_valve' ? 'valve_open' :
                   command === 'close_valve' ? 'valve_close' :
                   command === 'open_inlet' ? 'inlet_open' :
                   command === 'close_inlet' ? 'inlet_close' : command;

    let reason = 'Kontrol manual';

    if (isOpenCommand && valveKind && auto_stop &&
        ['duration', 'depth_target', 'depth_percent'].includes(auto_stop.mode)) {
      clearValveWatch(pond_id, valveKind); // bersihkan watch lama valve ini kalau ada

      let targetDepth = null;
      let durationMinutes = null;

      if (auto_stop.mode === 'depth_target') {
        targetDepth = parseFloat(auto_stop.value);
        if (!isNaN(targetDepth)) reason = `Auto-stop: target ketinggian ${targetDepth.toFixed(1)}cm`;
      } else if (auto_stop.mode === 'depth_percent') {
        const startDepth = parseFloat(latestData[pond_id]?.depth);
        const percent = parseFloat(auto_stop.value);
        if (!isNaN(startDepth) && !isNaN(percent)) {
          targetDepth = valveKind === 'drain'
            ? startDepth * (1 - percent / 100)
            : startDepth * (1 + percent / 100);
          reason = `Auto-stop: ${percent}% perubahan dari ${startDepth.toFixed(1)}cm (target ${targetDepth.toFixed(1)}cm)`;
        }
      } else if (auto_stop.mode === 'duration') {
        durationMinutes = Math.min(15, Math.max(1, parseFloat(auto_stop.value) || 1));
        reason = `Auto-stop: durasi ${durationMinutes} menit`;
      }

      // Hanya pasang watch kalau targetDepth/durationMinutes berhasil dihitung.
      if (targetDepth != null || durationMinutes != null) {
        const watch = {
          mode: auto_stop.mode,
          targetDepth,
          durationMinutes,
          startedAt: new Date(),
          safetyTimer: setTimeout(() => forceCloseValve(pond_id, valveKind, 'safety_cap'), VALVE_SAFETY_CAP_MS),
          durationTimer: null,
        };
        if (auto_stop.mode === 'duration') {
          watch.durationTimer = setTimeout(() => forceCloseValve(pond_id, valveKind, 'duration'), durationMinutes * 60 * 1000);
        }
        valveAutoStop[`${pond_id}:${valveKind}`] = watch;
      }
    }

    await pool.query(
      `INSERT INTO control_logs (pond_id, action, triggered_by, reason) VALUES ($1, $2, $3, $4)`,
      [pond_id, action, source, reason]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 2: Cek syntax**

Run: `cd backend && node --check server.js`
Expected: tidak ada output.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(kontrol-air): endpoint valve terima parameter auto_stop"
```

---

### Task 3: Backend — hook auto-stop ke data sensor masuk

**Files:**
- Modify: `backend/server.js` (di dalam `mqttClient.on('message', ...)`, blok `if (type === 'sensors')`)

- [ ] **Step 1: Tambahkan panggilan `checkValveAutoStop`**

Cari blok ini di dalam handler MQTT (`mqttClient.on('message', ...)`):

```js
      await saveSensorData(farm_id, pond_id, payload, 'esp32');
      await checkSensorRisks(pond_id, payload);
    } else if (type === 'status') {
```

Ganti jadi:

```js
      await saveSensorData(farm_id, pond_id, payload, 'esp32');
      await checkSensorRisks(pond_id, payload);
      await checkValveAutoStop(pond_id, payload.depth);
    } else if (type === 'status') {
```

- [ ] **Step 2: Cek syntax**

Run: `cd backend && node --check server.js`
Expected: tidak ada output.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(kontrol-air): cek auto-stop tiap data ketinggian air masuk"
```

---

### Task 4: Backend — endpoint status katup

**Files:**
- Modify: `backend/server.js` (tambahkan setelah endpoint `POST /api/control/:pondId/drain-cycle`)

- [ ] **Step 1: Tambahkan endpoint baru**

Cari blok ini:

```js
app.post('/api/control/:pondId/drain-cycle', requirePondAccess('pondId'), async (req, res) => {
  try {
    await triggerAutoDrainCycle(req.params.pondId, 'Trigger manual oleh user');
    res.json({ success: true, message: 'Siklus drain-refill dimulai' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

Tambahkan PERSIS setelah blok itu:

```js

app.get('/api/control/:pondId/valve-status', requirePondAccess('pondId'), async (req, res) => {
  try {
    const pond_id = req.params.pondId;
    const r = await pool.query(
      `SELECT DISTINCT ON (action) action, reason, timestamp
       FROM control_logs
       WHERE pond_id = $1 AND action IN ('valve_open','valve_close','inlet_open','inlet_close')
       ORDER BY action, timestamp DESC`,
      [pond_id]
    );
    const rows = {};
    r.rows.forEach(row => { rows[row.action] = row; });

    function valveInfo(openAction, closeAction, valveKind) {
      const openRow = rows[openAction];
      const closeRow = rows[closeAction];
      const isOpen = !!openRow && (!closeRow || new Date(openRow.timestamp) > new Date(closeRow.timestamp));
      const latestRow = isOpen ? openRow : (closeRow || openRow);
      const watch = valveAutoStop[`${pond_id}:${valveKind}`];
      return {
        open: isOpen,
        reason: latestRow?.reason || null,
        since: latestRow?.timestamp || null,
        auto_stop_active: !!watch,
        auto_stop_mode: watch?.mode || null,
        auto_stop_target: watch ? (watch.mode === 'duration' ? watch.durationMinutes : watch.targetDepth) : null,
      };
    }

    res.json({
      drain: valveInfo('valve_open', 'valve_close', 'drain'),
      inlet: valveInfo('inlet_open', 'inlet_close', 'inlet'),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 2: Cek syntax**

Run: `cd backend && node --check server.js`
Expected: tidak ada output.

- [ ] **Step 3: Restart backend lokal & tes endpoint manual**

Kalau ada instance dev backend jalan, restart dulu (`Ctrl+C` lalu `npm run dev` di folder `backend`), lalu:

```bash
curl -s https://sipakale.um-km.id/api/control/pond_c1_tunas/valve-status \
  -H "Cookie: at=<isi dari login session>"
```

Expected (contoh, angka pasti beda): JSON dengan struktur `{"drain":{"open":false,...},"inlet":{"open":false,...}}`, bukan error 500.

> Catatan: kalau menguji di server produksi, jalankan ini HANYA setelah deploy disetujui user (lihat larangan akses server di instruksi global) — untuk verifikasi lokal, jalankan backend dev di `localhost` dulu.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(kontrol-air): endpoint GET valve-status per kolam"
```

---

### Task 5: Frontend — API client

**Files:**
- Modify: `frontend/src/services/api.js:95-99`

- [ ] **Step 1: Ganti fungsi `controlValve`, tambah `getValveStatus`**

Cari blok ini:

```js
// Control
export const controlValve = (pondId, command, source = 'manual') =>
  req(`/control/${pondId}/valve`, { method: 'POST', body: { command, source } });
export const triggerDrainCycle = (pondId) =>
  req(`/control/${pondId}/drain-cycle`, { method: 'POST' });
```

Ganti dengan:

```js
// Control
export const controlValve = (pondId, command, source = 'manual', autoStop = null) =>
  req(`/control/${pondId}/valve`, {
    method: 'POST',
    body: { command, source, ...(autoStop ? { auto_stop: autoStop } : {}) },
  });
export const getValveStatus = (pondId) => req(`/control/${pondId}/valve-status`);
export const triggerDrainCycle = (pondId) =>
  req(`/control/${pondId}/drain-cycle`, { method: 'POST' });
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/api.js
git commit -m "feat(kontrol-air): controlValve terima auto_stop + getValveStatus"
```

---

### Task 6: Frontend — UI ketinggian air & picker auto-stop

**Files:**
- Modify: `frontend/src/components/ControlTab.jsx` (rewrite penuh — perubahan menyebar di banyak bagian file yang saling terkait: state, badge, tombol, jadi lebih aman ganti seluruh isi file daripada tempel-tempel diff).

- [ ] **Step 1: Ganti seluruh isi file**

Ganti seluruh isi `frontend/src/components/ControlTab.jsx` dengan:

```jsx
import { useEffect, useState } from 'react';
import {
  Droplets, Waves, RefreshCw, Activity,
  Thermometer, Ruler, Droplet, Eye, Beaker, Timer,
} from 'lucide-react';
import { controlValve, triggerDrainCycle, getValveStatus } from '../services/api';
import AeratorControl from './AeratorControl';

const SENSOR_META = {
  temperature: { name: 'Suhu', icon: Thermometer, unit: '°C', color: '#ef4444' },
  depth: { name: 'Kedalaman', icon: Ruler, unit: 'cm', color: '#3b82f6' },
  dissolved_oxygen: { name: 'DO', icon: Droplet, unit: 'mg/L', color: '#10b981' },
  turbidity: { name: 'Kekeruhan', icon: Eye, unit: 'NTU', color: '#f59e0b' },
  ph: { name: 'pH', icon: Beaker, unit: '', color: '#8b5cf6' },
};

const AUTO_STOP_MODE_META = {
  manual: { label: 'Manual (tanpa auto-stop)' },
  duration: { label: 'Durasi (menit)', placeholder: 'mis. 5', hint: 'Maks 15 menit — di atas itu otomatis dipotong.' },
  depth_target: { label: 'Target ketinggian (cm)', placeholder: 'mis. 48' },
  depth_percent: { label: 'Persentase perubahan (%)', placeholder: 'mis. 20', hint: null },
};

function AutoStopPicker({ kind, value, onChange, disabled }) {
  const percentHint = kind === 'drain'
    ? 'Berhenti saat air TURUN sekian % dari level saat tombol Buka ditekan.'
    : 'Berhenti saat air NAIK sekian % dari level saat tombol Buka ditekan.';
  return (
    <div style={{ marginBottom: 14, textAlign: 'left' }}>
      <label className="form-label" style={{ fontSize: 12 }}>Auto-stop</label>
      <select
        className="form-select"
        value={value.mode}
        disabled={disabled}
        onChange={e => onChange({ mode: e.target.value, value: '' })}
        style={{ marginBottom: value.mode !== 'manual' ? 6 : 0 }}
      >
        {Object.entries(AUTO_STOP_MODE_META).map(([k, m]) => (
          <option key={k} value={k}>{m.label}</option>
        ))}
      </select>
      {value.mode !== 'manual' && (
        <>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.1"
            disabled={disabled}
            placeholder={AUTO_STOP_MODE_META[value.mode].placeholder}
            value={value.value}
            onChange={e => onChange({ ...value, value: e.target.value })}
          />
          <div className="text-xs text-muted" style={{ marginTop: 2 }}>
            {value.mode === 'depth_percent' ? percentHint : AUTO_STOP_MODE_META[value.mode].hint}
          </div>
        </>
      )}
    </div>
  );
}

export default function ControlTab({ pond, onChange }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ drain: {}, inlet: {} });
  const [autoStop, setAutoStop] = useState({
    drain: { mode: 'manual', value: '' },
    inlet: { mode: 'manual', value: '' },
  });
  const latest = pond.latest_sensor || {};

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const s = await getValveStatus(pond.pond_id);
        if (active) setStatus(s);
      } catch (e) { /* diamkan, badge tetap tampilkan status terakhir yg diketahui */ }
    }
    loadStatus();
    const t = setInterval(loadStatus, 3000);
    return () => { active = false; clearInterval(t); };
  }, [pond.pond_id]);

  async function valve(cmd, kind) {
    setBusy(true);
    try {
      const isOpenCmd = cmd === 'open_valve' || cmd === 'open_inlet';
      const as = autoStop[kind];
      const payload = isOpenCmd && as.mode !== 'manual' && as.value !== ''
        ? { mode: as.mode, value: parseFloat(as.value) }
        : null;
      await controlValve(pond.pond_id, cmd, 'manual', payload);
      setTimeout(() => { onChange(); }, 500);
    } catch (e) { alert('Gagal: ' + e.message); }
    setBusy(false);
  }

  async function triggerCycle() {
    if (!confirm(
      'Mulai siklus pengurasan & pengisian otomatis?\n\n' +
      '• Katup pengurasan terbuka 30 detik\n' +
      '• Lalu katup pengisian terbuka 60 detik\n' +
      '• Selesai otomatis'
    )) return;
    setBusy(true);
    try {
      await triggerDrainCycle(pond.pond_id);
      alert('Siklus dimulai! Cek tab Log Aktivitas untuk progress.');
    } catch (e) { alert('Gagal: ' + e.message); }
    setBusy(false);
  }

  const drainOpen = !!status.drain.open;
  const inletOpen = !!status.inlet.open;

  return (
    <>
      <div className="alert alert-info">
        <Activity size={18} />
        <div>
          <strong>Kontrol Kolam.</strong> Tersedia 2 katup: <strong>Pengurasan</strong> (membuang air kotor)
          dan <strong>Pengisian</strong> (mengisi air bersih). Anda bisa kontrol manual per katup, atur
          auto-stop, atau jalankan siklus otomatis.
        </div>
      </div>

      <div className="card mb-6" style={{ textAlign: 'center', padding: '18px 20px' }}>
        <div className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Ketinggian Air Saat Ini
        </div>
        <div style={{ fontSize: 32, fontWeight: 800 }}>
          {latest.depth != null ? parseFloat(latest.depth).toFixed(1) : '--'}
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 6 }}>cm</span>
        </div>
      </div>

      <div className="control-panel">
        {/* Katup Pengurasan */}
        <div className="valve-control">
          <div className="flex items-center justify-between mb-2">
            <h3 style={{ fontSize: 16 }}>💧 Katup Pengurasan</h3>
            <span className={`badge ${drainOpen ? 'badge-success' : 'badge-neutral'}`}>
              <span className="badge-dot" style={{ background: drainOpen ? '#10b981' : '#94a3b8' }} />
              {drainOpen ? 'TERBUKA' : 'TERTUTUP'}
            </span>
          </div>
          <div className={`valve-icon-wrap ${drainOpen ? 'open' : 'closed'}`}>
            <Droplets size={48} />
          </div>
          <div className="valve-status-text">{drainOpen ? 'Mengalir Keluar' : 'Tertutup'}</div>
          <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
            Membuang air dari kolam
          </p>
          {status.drain.reason && (
            <p className="text-xs text-muted" style={{ marginBottom: 8 }}>{status.drain.reason}</p>
          )}
          {status.drain.auto_stop_active && (
            <p className="text-xs" style={{ color: 'var(--accent-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <Timer size={12} /> Auto-stop aktif ({status.drain.auto_stop_mode})
            </p>
          )}
          <AutoStopPicker kind="drain" value={autoStop.drain} disabled={busy || drainOpen}
            onChange={v => setAutoStop(s => ({ ...s, drain: v }))} />
          <div className="flex gap-2" style={{ justifyContent: 'center' }}>
            <button
              className="btn btn-success"
              disabled={busy || drainOpen}
              onClick={() => valve('open_valve', 'drain')}
            >
              Buka Katup
            </button>
            <button
              className="btn btn-danger"
              disabled={busy || !drainOpen}
              onClick={() => valve('close_valve', 'drain')}
            >
              Tutup Katup
            </button>
          </div>
        </div>

        {/* Katup Pengisian */}
        <div className="valve-control">
          <div className="flex items-center justify-between mb-2">
            <h3 style={{ fontSize: 16 }}>🌊 Katup Pengisian</h3>
            <span className={`badge ${inletOpen ? 'badge-success' : 'badge-neutral'}`}>
              <span className="badge-dot" style={{ background: inletOpen ? '#10b981' : '#94a3b8' }} />
              {inletOpen ? 'TERBUKA' : 'TERTUTUP'}
            </span>
          </div>
          <div className={`valve-icon-wrap ${inletOpen ? 'open' : 'closed'}`}>
            <Waves size={48} />
          </div>
          <div className="valve-status-text">{inletOpen ? 'Mengalir Masuk' : 'Tertutup'}</div>
          <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
            Mengisi air bersih ke kolam
          </p>
          {status.inlet.reason && (
            <p className="text-xs text-muted" style={{ marginBottom: 8 }}>{status.inlet.reason}</p>
          )}
          {status.inlet.auto_stop_active && (
            <p className="text-xs" style={{ color: 'var(--accent-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <Timer size={12} /> Auto-stop aktif ({status.inlet.auto_stop_mode})
            </p>
          )}
          <AutoStopPicker kind="inlet" value={autoStop.inlet} disabled={busy || inletOpen}
            onChange={v => setAutoStop(s => ({ ...s, inlet: v }))} />
          <div className="flex gap-2" style={{ justifyContent: 'center' }}>
            <button
              className="btn btn-success"
              disabled={busy || inletOpen}
              onClick={() => valve('open_inlet', 'inlet')}
            >
              Buka Katup
            </button>
            <button
              className="btn btn-danger"
              disabled={busy || !inletOpen}
              onClick={() => valve('close_inlet', 'inlet')}
            >
              Tutup Katup
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Siklus Otomatis Drain + Refill</div>
            <div className="card-subtitle">Mengganti air kolam secara penuh dengan 1 klik</div>
          </div>
        </div>
        <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
          Klik tombol di bawah untuk menjalankan siklus lengkap: katup pengurasan terbuka 30 detik untuk mengeluarkan
          air kotor, lalu katup pengisian otomatis terbuka 60 detik untuk mengisi air bersih hingga suhu normal.
          Cocok dipakai saat kondisi air bermasalah.
        </p>
        <button className="btn btn-primary" onClick={triggerCycle} disabled={busy}>
          <RefreshCw size={16} /> Mulai Siklus Otomatis
        </button>
      </div>

      <AeratorControl pondId={pond.pond_id} />

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Status Sensor Saat Ini</div>
            <div className="card-subtitle">Referensi untuk pengambilan keputusan</div>
          </div>
        </div>
        <div className="sensor-grid">
          {Object.entries(SENSOR_META).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <div key={key} style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-primary)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} style={{ color: meta.color }} />
                  <span className="text-xs text-muted">{meta.name}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>
                  {latest[key] != null ? parseFloat(latest[key]).toFixed(1) : '--'}
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4 }}>{meta.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Jalankan dev server frontend & cek visual**

Run: `cd frontend && npm run dev` (kalau belum jalan), buka halaman Detail Kolam → tab Kontrol Air di browser.

Expected:
- Banner "Ketinggian Air Saat Ini" muncul di atas 2 kartu katup, dengan angka cm dari data sensor terakhir.
- Tiap kartu katup punya dropdown "Auto-stop" (Manual/Durasi/Target ketinggian/Persentase) di atas tombol Buka/Tutup Katup.
- Pilih mode selain Manual → muncul input angka + keterangan singkat di bawahnya.
- Badge TERBUKA/TERTUTUP & status tidak error walau `getValveStatus` baru pertama kali dipanggil (tampil TERTUTUP default kalau belum ada data).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ControlTab.jsx
git commit -m "feat(kontrol-air): banner ketinggian air + picker auto-stop per katup"
```

---

### Task 7: Verifikasi end-to-end (manual)

**Files:** tidak ada file diubah — ini murni langkah verifikasi memakai API & UI yang sudah dibangun di Task 1-6.

- [ ] **Step 1: Login & catat cookie session untuk uji curl**

```bash
curl -sS -c /tmp/cookies_valve.txt -X POST https://sipakale.um-km.id/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tiana@tunasmekar.id","password":"Tiana12345"}'
```
Expected: `{"user":{...}}`, bukan error.

- [ ] **Step 2: Verifikasi mode `depth_target` — set target yang PASTI sudah terlampaui**

Ambil ketinggian air sekarang dulu:
```bash
curl -sS -b /tmp/cookies_valve.txt https://sipakale.um-km.id/api/sensors/pond_c1_tunas/latest
```
Catat nilai `depth`-nya (misal 60). Lalu buka katup Pengurasan dengan target JAUH di atas nilai itu (misal 90) —
supaya kondisi `currentDepth <= targetDepth` langsung terpenuhi begitu data sensor berikutnya masuk (dalam
hitungan detik, karena `depth` awal 60 pasti ≤ target 90):
```bash
curl -sS -b /tmp/cookies_valve.txt -X POST https://sipakale.um-km.id/api/control/pond_c1_tunas/valve \
  -H "Content-Type: application/json" \
  -d '{"command":"open_valve","auto_stop":{"mode":"depth_target","value":90}}'
```
Expected: `{"success":true}`. Tunggu ~5 detik (device publish sensor tiap beberapa detik), lalu:
```bash
curl -sS -b /tmp/cookies_valve.txt https://sipakale.um-km.id/api/control/pond_c1_tunas/valve-status
```
Expected: `drain.open` sudah `false` lagi, `drain.reason` berbunyi `"Auto-stop: ketinggian target 90.0cm tercapai"`.

> **PENTING — ini menyentuh device fisik nyata (buka/tutup katup sungguhan).**
> Jangan jalankan Step 2 ini kecuali sudah dapat izin eksplisit dari user untuk
> menguji di device produksi, sesuai aturan akses server/hardware global.
> Kalau belum diizinkan, cukup verifikasi Task 1-6 lewat `node --check` dan
> pengecekan visual UI di Step 2 Task 6 (yang tidak menggerakkan katup fisik).

- [ ] **Step 3: Verifikasi batas pengaman (opsional, makan waktu 15 menit)**

Set target yang mustahil tercapai (mis. `depth_target` 0 untuk katup Pengisian, yang butuh ketinggian NAIK
bukan turun — jadi kondisi `currentDepth >= 0` sebenarnya SELALU benar, jadi pakai target yang berlawanan
arah, mis. drain dengan target negatif atau lebih rendah dari kemungkinan fisik terendah kolam) — lalu
tunggu 15 menit dan cek `valve-status` menunjukkan sudah tertutup dengan `reason` mengandung "batas
pengaman". Ini opsional karena makan waktu lama; boleh dilewati kalau Step 2 sudah membuktikan
mekanisme dasar bekerja, dan cukup percaya kode `safetyTimer` yang sama persis dipasang di semua mode.

- [ ] **Step 4: Verifikasi pembatalan watch oleh Tutup manual**

Buka katup dengan `auto_stop` durasi 10 menit, lalu SEGERA tutup manual:
```bash
curl -sS -b /tmp/cookies_valve.txt -X POST https://sipakale.um-km.id/api/control/pond_c1_tunas/valve \
  -H "Content-Type: application/json" -d '{"command":"open_valve","auto_stop":{"mode":"duration","value":10}}'
curl -sS -b /tmp/cookies_valve.txt -X POST https://sipakale.um-km.id/api/control/pond_c1_tunas/valve \
  -H "Content-Type: application/json" -d '{"command":"close_valve"}'
```
Expected: tidak ada `close_valve` kedua yang terkirim otomatis 10 menit kemudian (cek `control_logs` tak
ada baris auto-close duplikat setelah ini — lihat tab Log Aktivitas di dashboard).

---

## Self-Review Notes

- **Spec coverage:** banner ketinggian air (Task 6), 3 mode auto-stop + manual (Task 2, 6), batas pengaman
  15 menit di semua mode (Task 1, 2), status dari server bukan state lokal (Task 4, 6), tidak ada perubahan
  firmware (tidak ada task yang menyentuh `esp32/`) — semua poin spec tercakup.
- **Placeholder scan:** tidak ada TBD/TODO; semua kode lengkap siap tempel.
- **Konsistensi nama:** `valveAutoStop`, `forceCloseValve`, `checkValveAutoStop`, `clearValveWatch`,
  `valveTopic` dipakai konsisten sama persis di Task 1-4; `getValveStatus`/`controlValve` konsisten sama
  persis di Task 5-6.
