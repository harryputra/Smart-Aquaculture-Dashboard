import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ArrowUp, ArrowDown } from 'lucide-react';
import { getCycleCompare } from '../services/api';

const COLS = [
  { key: 'pond_name', label: 'Kolam', num: false },
  { key: 'days', label: 'Umur (hari)', num: true },
  { key: 'population', label: 'Populasi', num: true },
  { key: 'survival_rate', label: 'SR %', num: true },
  { key: 'avg_weight_g', label: 'Bobot (g)', num: true },
  { key: 'est_biomass_kg', label: 'Biomassa (kg)', num: true },
  { key: 'total_feed_kg', label: 'Pakan (kg)', num: true },
  { key: 'fcr_est', label: 'FCR', num: true },
  { key: 'days_to_target', label: 'Est. panen (hari)', num: true },
];
const num = (v, d = 1) => (v == null ? '–' : Number(v).toFixed(d));
const srColor = (v) => (v == null ? '' : v >= 85 ? '#047857' : v < 70 ? '#b91c1c' : '');
const fcrColor = (v) => (v == null ? '' : v <= 1.0 ? '#047857' : v > 1.5 ? '#b91c1c' : '');

export default function ComparePonds() {
  const [rows, setRows] = useState([]);
  const [sort, setSort] = useState({ key: 'survival_rate', dir: 'desc' });

  useEffect(() => {
    async function load() { try { setRows(await getCycleCompare()); } catch (e) { /* */ } }
    load(); const t = setInterval(load, 10000); return () => clearInterval(t);
  }, []);

  const active = rows.filter(r => r.has_cycle);
  const avgSR = active.length ? active.reduce((s, r) => s + (r.survival_rate || 0), 0) / active.length : null;
  const totBio = active.reduce((s, r) => s + (r.est_biomass_kg || 0), 0);
  const avgFcr = (() => { const f = active.filter(r => r.fcr_est != null); return f.length ? f.reduce((s, r) => s + r.fcr_est, 0) / f.length : null; })();

  function sortBy(key) { setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' })); }
  const sorted = [...rows].sort((a, b) => {
    // kolam tanpa siklus selalu di bawah
    if (a.has_cycle !== b.has_cycle) return a.has_cycle ? -1 : 1;
    const av = a[sort.key], bv = b[sort.key];
    if (sort.key === 'pond_name') return sort.dir === 'desc' ? String(bv).localeCompare(av) : String(av).localeCompare(bv);
    if (av == null) return 1; if (bv == null) return -1;
    return sort.dir === 'desc' ? bv - av : av - bv;
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">📊 Perbandingan Kolam</h1>
          <p className="page-subtitle">KPI siklus aktif tiap kolam — bandingkan performa (SR, FCR, pertumbuhan)</p></div>
      </div>

      <div className="stats-grid mb-6">
        <div className="stat-card"><div className="stat-card-label">Kolam bersiklus</div><div className="stat-card-value">{active.length}</div></div>
        <div className="stat-card"><div className="stat-card-label">Rata² SR</div><div className="stat-card-value" style={{ color: srColor(avgSR) }}>{num(avgSR)}%</div></div>
        <div className="stat-card"><div className="stat-card-label">Rata² FCR</div><div className="stat-card-value" style={{ color: fcrColor(avgFcr) }}>{num(avgFcr, 2)}</div></div>
        <div className="stat-card"><div className="stat-card-label">Total biomassa est.</div><div className="stat-card-value">{num(totBio)} kg</div></div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon"><BarChart3 size={32} /></div>
            <h3>Belum ada data</h3><p>Mulai siklus budidaya di kolam untuk membandingkan performa.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', minWidth: 720 }}>
              <thead><tr>
                {COLS.map(c => (
                  <th key={c.key} onClick={() => sortBy(c.key)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: c.num ? 'right' : 'left' }}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'desc' ? <ArrowDown size={11} style={{ verticalAlign: '-1px' }} /> : <ArrowUp size={11} style={{ verticalAlign: '-1px' }} />)}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.pond_id}>
                    <td>
                      <Link to={`/ponds/${r.pond_id}`} style={{ fontWeight: 600 }}>{r.pond_name}</Link>
                      <div className="text-xs text-muted">{r.farm_name || '-'}</div>
                    </td>
                    {!r.has_cycle ? (
                      <td colSpan={COLS.length - 1} className="text-xs text-muted">belum ada siklus aktif</td>
                    ) : (
                      <>
                        <td style={{ textAlign: 'right' }}>{r.days}</td>
                        <td style={{ textAlign: 'right' }}>{r.population}<span className="text-xs text-muted"> / {r.initial_stock}</span></td>
                        <td style={{ textAlign: 'right', color: srColor(r.survival_rate), fontWeight: 600 }}>{num(r.survival_rate)}</td>
                        <td style={{ textAlign: 'right' }}>{num(r.avg_weight_g)}</td>
                        <td style={{ textAlign: 'right' }}>{num(r.est_biomass_kg)}</td>
                        <td style={{ textAlign: 'right' }}>{num(r.total_feed_kg)}</td>
                        <td style={{ textAlign: 'right', color: fcrColor(r.fcr_est), fontWeight: 600 }}>{num(r.fcr_est, 2)}</td>
                        <td style={{ textAlign: 'right' }}>{r.days_to_target == null ? '–' : r.days_to_target === 0 ? 'siap' : r.days_to_target}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-muted" style={{ marginTop: 10 }}>
          Warna: <span style={{ color: '#047857' }}>hijau = baik</span> · <span style={{ color: '#b91c1c' }}>merah = perlu perhatian</span>.
          SR ≥ 85% baik / &lt; 70% buruk · FCR ≤ 1.0 baik / &gt; 1.5 boros. Klik judul kolom untuk urutkan.
        </div>
      </div>
    </div>
  );
}
