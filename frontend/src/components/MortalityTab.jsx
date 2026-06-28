import { useEffect, useState } from 'react';
import { Plus, Skull, Trash2, X, Droplets, AlertTriangle } from 'lucide-react';
import {
  getMortalityRecords, getMortalitySummary, recordMortality, deleteMortality, getWaterAudit,
} from '../services/api';

export default function MortalityTab({ pondId }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ death_count: 1, cause: 'tidak_diketahui', note: '' });

  async function load() {
    try {
      const [r, s] = await Promise.all([getMortalityRecords(pondId), getMortalitySummary(pondId)]);
      setRecords(r);
      setSummary(s);
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); }, [pondId]);

  async function submit(e) {
    e.preventDefault();
    try {
      await recordMortality({
        pond_id: pondId,
        death_count: +form.death_count,
        cause: form.cause,
        note: form.note,
      });
      setShowModal(false);
      setForm({ death_count: 1, cause: 'tidak_diketahui', note: '' });
      load();
    } catch (e) { alert(e.message); }
  }

  async function del(id) {
    if (!confirm('Hapus catatan ini? Populasi ikan tidak akan ditambah kembali otomatis.')) return;
    try { await deleteMortality(id); load(); } catch (e) { alert(e.message); }
  }

  const mortalityRate = summary?.initial_fish_count
    ? ((summary.total_deaths / summary.initial_fish_count) * 100).toFixed(2)
    : 0;

  const [audit, setAudit] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);
  async function runAudit() {
    setAuditBusy(true);
    try { setAudit(await getWaterAudit(pondId, 7)); } catch (e) { alert(e.message); } finally { setAuditBusy(false); }
  }
  const FIELD_LABEL = { temperature: 'Suhu (°C)', ph: 'pH', dissolved_oxygen: 'DO (mg/L)', turbidity: 'Kekeruhan (NTU)', depth: 'Kedalaman (cm)' };

  return (
    <>
      {summary && (
        <div className="mortality-summary">
          <div className="mortality-stat">
            <div className="mortality-stat-label">Populasi Awal</div>
            <div className="mortality-stat-value">{summary.initial_fish_count || 0}</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Tebar: {summary.stocking_date ? new Date(summary.stocking_date).toLocaleDateString('id-ID') : '-'}
            </div>
          </div>
          <div className="mortality-stat danger">
            <div className="mortality-stat-label">Total Mati</div>
            <div className="mortality-stat-value">{summary.total_deaths || 0}</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              {summary.death_events || 0} kejadian
            </div>
          </div>
          <div className="mortality-stat">
            <div className="mortality-stat-label">Mortality Rate</div>
            <div className="mortality-stat-value">{mortalityRate}%</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Dari populasi awal
            </div>
          </div>
          <div className="mortality-stat success">
            <div className="mortality-stat-label">Estimasi Panen</div>
            <div className="mortality-stat-value">{summary.estimated_harvest || 0}</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>
              Ekor ikan
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Riwayat Kematian</div>
            <div className="card-subtitle">Catatan setiap kejadian kematian ikan</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Catat Kematian
          </button>
        </div>

        {records.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Skull size={28} /></div>
            <h3>Belum ada catatan</h3>
            <p>Catat setiap kejadian kematian untuk menghitung estimasi panen</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tanggal</th><th>Jumlah</th><th>Penyebab</th><th>Catatan</th><th></th></tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td>{new Date(r.recorded_at).toLocaleString('id-ID')}</td>
                    <td><strong style={{ color: 'var(--danger)' }}>{r.death_count} ekor</strong></td>
                    <td><span className="badge badge-warning">{r.cause.replace(/_/g, ' ')}</span></td>
                    <td>{r.note || '-'}</td>
                    <td>
                      <button className="btn btn-icon btn-secondary" onClick={() => del(r.id)}>
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

      {/* Audit kualitas air 7 hari (forensik kematian) */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title"><Droplets size={18} style={{ verticalAlign: -3 }} /> Audit Kualitas Air (7 hari)</div>
            <div className="card-subtitle">Cek anomali sensor menjelang kematian — bandingkan vs ambang batas</div>
          </div>
          <button className="btn btn-secondary" onClick={runAudit} disabled={auditBusy}>
            {auditBusy ? 'Memuat...' : 'Jalankan Audit'}
          </button>
        </div>
        {audit && (
          audit.samples === 0 ? (
            <div className="text-muted" style={{ padding: 12 }}>Tidak ada data sensor pada 7 hari terakhir.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>{audit.samples} pembacaan · {new Date(audit.from).toLocaleDateString('id-ID')} – {new Date(audit.to).toLocaleDateString('id-ID')}</div>
              <table className="table">
                <thead><tr><th>Parameter</th><th>Rata2</th><th>Min</th><th>Maks</th><th>Ambang</th><th>Status</th></tr></thead>
                <tbody>
                  {Object.entries(audit.fields).map(([k, f]) => (
                    <tr key={k} style={f.breach ? { background: 'rgba(239,68,68,0.08)' } : {}}>
                      <td style={{ fontWeight: 600 }}>{FIELD_LABEL[k] || k}</td>
                      <td>{f.avg ?? '-'}</td>
                      <td>{f.min ?? '-'}</td>
                      <td>{f.max ?? '-'}</td>
                      <td className="text-xs text-muted">{f.lo ?? '–'} … {f.hi ?? '–'}</td>
                      <td>{f.breach
                        ? <span className="badge badge-warning"><AlertTriangle size={12} /> Anomali</span>
                        : <span className="badge badge-success">Normal</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Catat Kematian Ikan</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Jumlah Ikan Mati *</label>
                <input type="number" min="1" required className="form-input" value={form.death_count}
                  onChange={e => setForm({ ...form, death_count: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Penyebab</label>
                <select className="form-select" value={form.cause}
                  onChange={e => setForm({ ...form, cause: e.target.value })}>
                  <option value="tidak_diketahui">Tidak Diketahui</option>
                  <option value="penyakit">Penyakit</option>
                  <option value="kualitas_air">Kualitas Air Buruk</option>
                  <option value="predator">Predator</option>
                  <option value="stress">Stress/Lainnya</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea className="form-textarea" value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Deskripsi kejadian, gejala, lingkungan, dll..." />
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
