import { useEffect, useState } from 'react';
import {
  Scale, Play, Trash2, CheckCircle, TrendingUp, Plus, History,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  getCurrentBiomass, getBiomassHistory, startBiomass, addBiomassEntry,
  deleteBiomassEntry, finalizeBiomass,
} from '../services/api';

const QUICK = [50, 75, 85, 100, 120, 150];
const recRate = (avg) => (avg <= 0 ? 4 : avg < 50 ? 5 : avg <= 100 ? 4 : 3);
const fdate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-');

export default function BiomassTab({ pondId }) {
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [w, setW] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [s, h] = await Promise.all([getCurrentBiomass(pondId), getBiomassHistory(pondId)]);
      setSession(s); setHistory(h);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [pondId]);

  async function begin() { setBusy(true); try { setSession(await startBiomass(pondId)); } catch (e) { alert(e.message); } finally { setBusy(false); } }
  async function addW(val) {
    const weight = parseFloat(val);
    if (!weight || weight <= 0) return;
    setBusy(true);
    try { setSession(await addBiomassEntry(pondId, weight)); setW(''); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function removeEntry(id) { setBusy(true); try { setSession(await deleteBiomassEntry(pondId, id)); } catch (e) { alert(e.message); } finally { setBusy(false); } }
  async function finalize() {
    if (!confirm('Selesaikan sampling? Feeding rate akan diperbarui otomatis.')) return;
    setBusy(true);
    try { await finalizeBiomass(pondId); await load(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const avg = session ? parseFloat(session.avg_weight_g) || 0 : 0;
  const chartData = history.map(h => ({ t: fdate(h.sampled_at), avg: parseFloat(h.avg_weight_g) || 0 }));

  return (
    <>
      {session ? (
        <div className="card mb-6">
          <div className="card-header">
            <div><div className="card-title">Sampling Berjalan</div><div className="card-subtitle">Timbang ikan satu per satu</div></div>
            <button className="btn btn-primary" onClick={finalize} disabled={busy || (session.sample_count || 0) < 1}>
              <CheckCircle size={16} /> Selesai & Hitung
            </button>
          </div>

          {/* Ringkasan live */}
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-card-icon"><Scale size={22} /></div>
              <div className="stat-card-label">Jumlah Sampel</div><div className="stat-card-value">{session.sample_count || 0}</div><div className="stat-card-subtext">ekor</div></div>
            <div className="stat-card"><div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><TrendingUp size={22} /></div>
              <div className="stat-card-label">Rata-rata</div><div className="stat-card-value">{avg.toFixed(1)}</div><div className="stat-card-subtext">gram/ekor</div></div>
            <div className="stat-card"><div className="stat-card-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}><Plus size={22} /></div>
              <div className="stat-card-label">Feeding Rate (estimasi)</div><div className="stat-card-value">{recRate(avg)}%</div><div className="stat-card-subtext">otomatis dari berat</div></div>
          </div>

          {/* Input timbang */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Berat ikan (gram)</label>
              <input className="form-input" type="number" min="1" step="0.1" value={w}
                onChange={e => setW(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addW(w); }}
                placeholder="ketik / Enter" style={{ width: 160 }} autoFocus />
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={() => addW(w)}><Plus size={16} /> Tambah</button>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              {QUICK.map(q => <button key={q} className="btn btn-secondary btn-sm" disabled={busy} onClick={() => addW(q)}>{q}g</button>)}
            </div>
          </div>

          {/* Daftar entry */}
          {session.entries?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>#</th><th>Berat (g)</th><th>Selisih dari rata2</th><th></th></tr></thead>
                <tbody>
                  {session.entries.map(en => (
                    <tr key={en.id}>
                      <td>{en.fish_no}</td>
                      <td style={{ fontWeight: 600 }}>{parseFloat(en.weight_g).toFixed(1)}</td>
                      <td style={{ color: parseFloat(en.weight_g) >= avg ? 'var(--success)' : 'var(--warning)' }}>
                        {(parseFloat(en.weight_g) - avg >= 0 ? '+' : '') + (parseFloat(en.weight_g) - avg).toFixed(1)}
                      </td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => removeEntry(en.id)}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card mb-6">
          <div className="empty-state">
            <div className="empty-state-icon"><Scale size={32} /></div>
            <h3>Belum ada sampling berjalan</h3>
            <p>Timbang beberapa ikan sebagai sampel untuk menghitung berat rata-rata, memperkirakan biomassa, dan menyetel feeding rate otomatis.</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={begin} disabled={busy}><Play size={16} /> Mulai Sampling</button>
          </div>
        </div>
      )}

      {/* Kurva pertumbuhan */}
      <div className="card">
        <div className="card-header"><div className="card-title"><TrendingUp size={18} style={{ verticalAlign: -3 }} /> Kurva Pertumbuhan</div></div>
        {chartData.length >= 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="t" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="g" />
              <Tooltip />
              <Line type="monotone" dataKey="avg" name="Berat rata-rata (g)" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-muted" style={{ padding: 16 }}>Belum ada riwayat sampling. Selesaikan minimal satu sesi sampling untuk melihat kurva.</div>
        )}
      </div>

      {/* Riwayat */}
      {history.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header"><div className="card-title"><History size={18} style={{ verticalAlign: -3 }} /> Riwayat Sampling</div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Tanggal</th><th>Jumlah</th><th>Rata-rata (g)</th><th>Feeding Rate</th></tr></thead>
              <tbody>
                {[...history].reverse().map(h => (
                  <tr key={h.sample_id}>
                    <td>{new Date(h.sampled_at).toLocaleString('id-ID')}</td>
                    <td>{h.sample_count}</td>
                    <td style={{ fontWeight: 600 }}>{parseFloat(h.avg_weight_g).toFixed(1)}</td>
                    <td>{h.feeding_rate_percent != null ? `${h.feeding_rate_percent}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
