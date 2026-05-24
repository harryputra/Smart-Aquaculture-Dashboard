import { useEffect, useState } from 'react';
import { Sliders, Scale, AlertTriangle, CheckCircle, XCircle, Lock } from 'lucide-react';
import { remoteTare, getTareHistory } from '../../services/leleApi';

export default function KalibrasiTarePanel({ device }) {
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  async function loadHistory() {
    try { setHistory(await getTareHistory(device.device_id)); }
    catch (e) { /* */ }
  }

  useEffect(() => { loadHistory(); const i = setInterval(loadHistory, 5000); return () => clearInterval(i); }, [device.device_id]);

  async function doTare(type) {
    const labels = { chamber: 'Tare Pakan (Chamber)', sampling: 'Tare Biomassa (Sampling)', all: 'Tare Semua' };
    if (!confirm(`${labels[type]}\n\nPASTIKAN load cell dalam kondisi KOSONG.\n\nLanjutkan?`)) return;

    setBusy(true);
    try {
      await remoteTare(device.device_id, type);
      alert(`✅ Perintah ${labels[type]} dikirim ke device`);
      loadHistory();
    } catch (e) { alert('❌ ' + e.message); }
    setBusy(false);
  }

  const isOffline = !device.is_online;
  const liveChamber = device.chamber_g;
  const liveSampling = device.sampling_g;

  return (
    <>
      <div className="card mb-6" style={{ background: 'linear-gradient(135deg, #0f2438 0%, #1e3a5f 100%)', color: 'white', border: 'none' }}>
        <div className="card-header">
          <div>
            <div className="card-title" style={{ color: 'white' }}>📊 Live Reading Load Cell</div>
            <div className="card-subtitle" style={{ color: 'rgba(255,255,255,0.7)' }}>Real-time dari ESP32 tiap 3 detik</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div style={{ padding: 18, background: 'rgba(255,255,255,0.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Scale size={18} style={{ color: '#7dd3fc' }} />
              <strong>Chamber (Pakan)</strong>
              {device.hx_chamber_ok ?
                <CheckCircle size={16} style={{ color: '#86efac', marginLeft: 'auto' }} /> :
                <XCircle size={16} style={{ color: '#fca5a5', marginLeft: 'auto' }} />}
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: '#7dd3fc' }}>
              {liveChamber != null ? parseFloat(liveChamber).toFixed(1) : '--'}
              <span style={{ fontSize: 16, opacity: 0.7, marginLeft: 8 }}>g</span>
            </div>
          </div>

          <div style={{ padding: 18, background: 'rgba(255,255,255,0.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Scale size={18} style={{ color: '#fcd34d' }} />
              <strong>Sampling (Biomassa)</strong>
              {device.hx_sampling_ok ?
                <CheckCircle size={16} style={{ color: '#86efac', marginLeft: 'auto' }} /> :
                <XCircle size={16} style={{ color: '#fca5a5', marginLeft: 'auto' }} />}
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: '#fcd34d' }}>
              {liveSampling != null ? parseFloat(liveSampling).toFixed(1) : '--'}
              <span style={{ fontSize: 16, opacity: 0.7, marginLeft: 8 }}>g</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">⚖️ Tare Remote</div>
            <div className="card-subtitle">LCD: Kalibrasi/Tare → Tare Pakan / Biomassa / Semua</div>
          </div>
        </div>

        <div className="alert alert-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>PENTING:</strong> sebelum tare, pastikan load cell <strong>BENAR-BENAR KOSONG</strong>.
            Tare menetapkan beban saat ini sebagai titik nol.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => doTare('chamber')} disabled={busy || isOffline}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Scale size={28} />
            <div style={{ fontWeight: 700 }}>Tare Pakan</div>
            <div className="text-xs text-muted">Load cell chamber</div>
          </button>
          <button className="btn btn-secondary" onClick={() => doTare('sampling')} disabled={busy || isOffline}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Scale size={28} />
            <div style={{ fontWeight: 700 }}>Tare Biomassa</div>
            <div className="text-xs text-muted">Load cell sampling</div>
          </button>
          <button className="btn btn-primary" onClick={() => doTare('all')} disabled={busy || isOffline}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Sliders size={28} />
            <div style={{ fontWeight: 700 }}>Tare Semua</div>
            <div className="text-xs" style={{ opacity: 0.85 }}>Reset kedua load cell</div>
          </button>
        </div>

        {isOffline && (
          <div className="alert alert-danger" style={{ marginTop: 12, marginBottom: 0 }}>
            Device offline — perintah tare tidak bisa dikirim.
          </div>
        )}
      </div>

      <div className="card mb-6" style={{ background: 'var(--bg-tertiary)' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--warning-light)', color: 'var(--warning-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Calibration Factor Load Cell</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Pengaturan ini disembunyikan dari operator. Default chamber=1000.0, sampling=-1000.0 (sesuai V3.1).
              Edit langsung di firmware <code>chamberCalFactor</code> & <code>samplingCalFactor</code>, lalu upload ulang.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">📜 Riwayat Tare</div>
            <div className="card-subtitle">20 tare terakhir</div>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="empty-state"><p>Belum ada riwayat tare</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Jenis</th><th>Dipicu Oleh</th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{new Date(h.occurred_at).toLocaleString('id-ID')}</td>
                    <td><span className="badge badge-info">{h.scale_type}</span></td>
                    <td>{h.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
