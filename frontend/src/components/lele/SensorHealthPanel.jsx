import { useEffect, useState } from 'react';
import { Sliders, Scale, AlertTriangle, CheckCircle, XCircle, Lock } from 'lucide-react';
import { sendTare, getTareHistory } from '../../services/leleApi';

export default function SensorHealthPanel({ device }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadHistory() {
    try { setHistory(await getTareHistory(device.device_id)); } catch (e) { /* */ }
  }

  useEffect(() => { loadHistory(); }, [device.device_id]);

  async function doTare(type) {
    const labels = { chamber: 'Tare Pakan (Chamber)', sampling: 'Tare Biomassa (Sampling)', all: 'Tare Semua' };
    if (!confirm(`${labels[type]}\n\nPASTIKAN load cell dalam kondisi KOSONG (tidak ada beban) sebelum melanjutkan.\n\nLanjutkan?`)) return;

    setLoading(true);
    try {
      await sendTare(device.device_id, type);
      alert(`✅ Perintah ${labels[type]} dikirim ke device`);
      loadHistory();
    } catch (e) { alert('❌ ' + e.message); }
    setLoading(false);
  }

  return (
    <>
      {/* Status HX711 */}
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">🔧 Status Load Cell (HX711)</div>
            <div className="card-subtitle">Health check sensor berat</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <div style={{ padding: 16, background: device.hx_chamber_ok ? 'var(--success-light)' : 'var(--danger-light)', borderRadius: 10 }}>
            <div className="flex items-center gap-2 mb-2">
              {device.hx_chamber_ok ? <CheckCircle size={20} style={{ color: 'var(--success-dark)' }} /> : <XCircle size={20} style={{ color: 'var(--danger-dark)' }} />}
              <strong>HX711 Chamber</strong>
            </div>
            <div className="text-xs text-muted">Load cell untuk pakan di chamber</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Status: <strong style={{ color: device.hx_chamber_ok ? 'var(--success-dark)' : 'var(--danger-dark)' }}>
                {device.hx_chamber_ok ? 'BERFUNGSI' : 'TIDAK TERDETEKSI'}
              </strong>
            </div>
          </div>

          <div style={{ padding: 16, background: device.hx_sampling_ok ? 'var(--success-light)' : 'var(--danger-light)', borderRadius: 10 }}>
            <div className="flex items-center gap-2 mb-2">
              {device.hx_sampling_ok ? <CheckCircle size={20} style={{ color: 'var(--success-dark)' }} /> : <XCircle size={20} style={{ color: 'var(--danger-dark)' }} />}
              <strong>HX711 Sampling</strong>
            </div>
            <div className="text-xs text-muted">Load cell untuk sampling biomassa ikan</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Status: <strong style={{ color: device.hx_sampling_ok ? 'var(--success-dark)' : 'var(--danger-dark)' }}>
                {device.hx_sampling_ok ? 'BERFUNGSI' : 'TIDAK TERDETEKSI'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Tare controls */}
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">⚖️ Kalibrasi / Tare</div>
            <div className="card-subtitle">Reset titik nol load cell — pastikan kosong saat tare</div>
          </div>
        </div>

        <div className="alert alert-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Penting:</strong> sebelum melakukan tare, pastikan load cell dalam kondisi <strong>BENAR-BENAR KOSONG</strong>.
            Tare akan menetapkan beban saat ini sebagai titik nol (0 gram).
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => doTare('chamber')} disabled={loading || !device.is_online}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Scale size={28} />
            <div style={{ fontWeight: 700 }}>Tare Chamber</div>
            <div className="text-xs text-muted">Load cell pakan</div>
          </button>
          <button className="btn btn-secondary" onClick={() => doTare('sampling')} disabled={loading || !device.is_online}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Scale size={28} />
            <div style={{ fontWeight: 700 }}>Tare Sampling</div>
            <div className="text-xs text-muted">Load cell biomassa</div>
          </button>
          <button className="btn btn-primary" onClick={() => doTare('all')} disabled={loading || !device.is_online}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Sliders size={28} />
            <div style={{ fontWeight: 700 }}>Tare Semua</div>
            <div className="text-xs" style={{ opacity: 0.85 }}>Reset kedua load cell</div>
          </button>
        </div>

        {!device.is_online && (
          <div className="alert alert-danger" style={{ marginTop: 12, marginBottom: 0 }}>
            Device offline — perintah tare tidak bisa dikirim.
          </div>
        )}
      </div>

      {/* Kalibrasi Factor - Technician Mode */}
      <div className="card mb-6" style={{ background: 'var(--bg-tertiary)' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--warning-light)', color: 'var(--warning-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Kalibrasi Faktor Load Cell</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Pengaturan calibration factor disembunyikan dari operator umum.
              Akses hanya tersedia di <strong>Technician Mode</strong> (kombinasi tombol saat booting).
              Mengubah faktor sembarangan akan membuat semua pembacaan berat salah.
            </div>
          </div>
        </div>
      </div>

      {/* Riwayat Tare */}
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
