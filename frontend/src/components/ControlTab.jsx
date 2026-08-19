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
