import { useState } from 'react';
import {
  Droplets, Waves, RefreshCw, Activity,
  Thermometer, Ruler, Droplet, Eye, Beaker,
} from 'lucide-react';
import { controlValve, triggerDrainCycle } from '../services/api';
import AeratorControl from './AeratorControl';

const SENSOR_META = {
  temperature: { name: 'Suhu', icon: Thermometer, unit: '°C', color: '#ef4444' },
  depth: { name: 'Kedalaman', icon: Ruler, unit: 'cm', color: '#3b82f6' },
  dissolved_oxygen: { name: 'DO', icon: Droplet, unit: 'mg/L', color: '#10b981' },
  turbidity: { name: 'Kekeruhan', icon: Eye, unit: 'NTU', color: '#f59e0b' },
  ph: { name: 'pH', icon: Beaker, unit: '', color: '#8b5cf6' },
};

export default function ControlTab({ pond, onChange }) {
  const [drainOpen, setDrainOpen] = useState(false);
  const [inletOpen, setInletOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = pond.latest_sensor || {};

  async function valve(cmd, kind) {
    setBusy(true);
    try {
      await controlValve(pond.pond_id, cmd);
      if (kind === 'drain') setDrainOpen(cmd === 'open_valve');
      else setInletOpen(cmd === 'open_inlet');
      setTimeout(onChange, 500);
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

  return (
    <>
      <div className="alert alert-info">
        <Activity size={18} />
        <div>
          <strong>Kontrol Kolam.</strong> Tersedia 2 katup: <strong>Pengurasan</strong> (membuang air kotor)
          dan <strong>Pengisian</strong> (mengisi air bersih). Anda bisa kontrol manual per katup, atau jalankan siklus otomatis.
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
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
            Membuang air dari kolam
          </p>
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
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
            Mengisi air bersih ke kolam
          </p>
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
