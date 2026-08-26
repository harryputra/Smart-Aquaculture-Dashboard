import { useEffect, useState } from 'react';
import {
  Sprout, CalendarClock, Fish, TrendingUp, Scale, Wheat, Percent,
  Play, Anchor, X, History, Trophy, Ban, PackageCheck, ChevronDown,
  ChevronUp, Scissors, CircleDollarSign, AlertCircle,
} from 'lucide-react';
import {
  getActiveCycle, startCycle, harvestCycle, getCycles, cancelCycle,
  getHarvestRecords, addPartialHarvest,
} from '../services/api';

const rupiah = (n) =>
  n == null ? '-' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const fdate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const fnum  = (n, dec = 2) => n == null ? '-' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: dec });

export default function CycleTab({ pondId, onChange }) {
  const [cycle,    setCycle]    = useState(null);
  const [cycles,   setCycles]   = useState([]);
  const [harvests, setHarvests] = useState([]);   // panen parsial siklus aktif
  const [loading,  setLoading]  = useState(true);
  const [showStart,   setShowStart]   = useState(false);
  const [showPartial, setShowPartial] = useState(false);
  const [showFinal,   setShowFinal]   = useState(false);

  async function load() {
    try {
      const [c, hist, hv] = await Promise.all([
        getActiveCycle(pondId),
        getCycles(pondId),
        getHarvestRecords(pondId).catch(() => []),
      ]);
      setCycle(c);
      setCycles(hist);
      setHarvests(hv);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [pondId]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const m        = cycle?.metrics || {};
  const completed = cycles.filter(c => c.status !== 'active');

  return (
    <>
      {!cycle ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Sprout size={32} /></div>
            <h3>Belum ada siklus aktif</h3>
            <p>Mulai siklus budidaya baru (tebar benih) untuk melacak pertumbuhan, pakan, mortalitas, dan hasil panen.</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowStart(true)}>
              <Play size={16} /> Mulai Siklus Baru
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ===== Banner siklus aktif ===== */}
          <div className="card mb-6" style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none' }}>
            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div className="text-xs" style={{ opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Siklus Aktif
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, fontFamily: "'Outfit',sans-serif" }}>
                  Hari ke-{m.days ?? 0}
                </div>
                <div style={{ fontSize: 14, opacity: 0.9 }}>
                  Tebar {fdate(cycle.start_date)} · {cycle.initial_stock} ekor
                  {(m.harvest_count ?? 0) > 0 && (
                    <span style={{ marginLeft: 10, background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                      {m.harvest_count}× Panen Parsial
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setShowPartial(true)}>
                  <Scissors size={16} /> Panen Parsial
                </button>
                <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={() => setShowFinal(true)}>
                  <Anchor size={16} /> Panen Final &amp; Tutup
                </button>
                <button className="btn btn-secondary" onClick={async () => {
                  if (confirm('Batalkan siklus aktif ini? (tanpa panen)')) {
                    await cancelCycle(pondId).catch(e => alert(e.message));
                    load(); onChange?.();
                  }
                }}><Ban size={16} /> Batalkan</button>
              </div>
            </div>
          </div>

          {/* ===== Stats Grid ===== */}
          <div className="stats-grid">
            <Stat icon={<Fish size={22} />}    label="Sisa Populasi"  value={fnum(m.population, 0)}
              sub={`Mati ${m.deaths ?? 0} · Dipanen ${m.total_harvested_fish ?? 0} ekor`} />
            <Stat icon={<Percent size={22} />}  label="Survival Rate"  value={m.survival_rate != null ? `${m.survival_rate}%` : '-'}
              sub="SR (belum panen final)" bg="#d1fae5" color="#047857" />
            <Stat icon={<Scale size={22} />}    label="Berat Rata-rata" value={m.avg_weight_g != null ? `${m.avg_weight_g} g` : '—'}
              sub={m.est_biomass_kg != null ? `Biomassa ~${m.est_biomass_kg} kg` : 'Belum sampling'} bg="#fef3c7" color="#b45309" />
            <Stat icon={<Wheat size={22} />}    label="Total Pakan"     value={`${m.total_feed_kg ?? 0} kg`}
              sub={m.fcr_est != null ? `FCR ~${m.fcr_est}` : 'FCR -'} bg="#dbeafe" color="#1d4ed8" />
          </div>

          {/* ===== Progress panen parsial (jika sudah ada) ===== */}
          {(m.harvest_count ?? 0) > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <div className="card-title"><PackageCheck size={18} style={{ verticalAlign: -3 }} /> Akumulasi Panen Parsial</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
                <SummaryBox label="Total Dipanen" value={`${fnum(m.total_harvested_kg)} kg`} sub={`${fnum(m.total_harvested_fish, 0)} ekor`} color="#0284c7" />
                <SummaryBox label="Revenue Parsial" value={rupiah(m.total_harvest_revenue)} color="#059669" />
                <SummaryBox label="Panen ke-" value={m.harvest_count} sub="kali panen sudah dicatat" color="#7c3aed" />
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr>
                    <th>#</th>
                    <th>Tanggal</th>
                    <th>Ekor</th>
                    <th>Avg/ekor (g)</th>
                    <th>Total (kg)</th>
                    <th>Harga/kg</th>
                    <th>Revenue</th>
                    <th>Status</th>
                  </tr></thead>
                  <tbody>
                    {harvests.map(h => (
                      <tr key={h.harvest_id || h.id}>
                        <td style={{ fontWeight: 700 }}>{h.harvest_no}</td>
                        <td>{fdate(h.harvest_date)}</td>
                        <td>{fnum(h.fish_count, 0)}</td>
                        <td>{h.avg_weight_g ? `${fnum(h.avg_weight_g)} g` : '-'}</td>
                        <td style={{ fontWeight: 600 }}>{fnum(h.total_weight_kg)} kg</td>
                        <td>{rupiah(h.price_per_kg)}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 600 }}>{rupiah(h.revenue)}</td>
                        <td>
                          <span className={`badge ${h.is_final ? 'badge-success' : 'badge-info'}`}>
                            {h.is_final ? 'Final' : 'Parsial'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== Target & Proyeksi ===== */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><div className="card-title">Target &amp; Proyeksi</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <Info icon={<CalendarClock size={18} />} label="Target Panen"     value={fdate(cycle.target_harvest_date)} />
              <Info icon={<Scale size={18} />}         label="Target Berat"     value={`${cycle.target_weight_g ?? '-'} g`} />
              <Info icon={<TrendingUp size={18} />}    label="Estimasi ke Target" value={m.days_to_target != null ? `${m.days_to_target} hari lagi` : '—'} />
              <Info icon={<Wheat size={18} />}         label="Feeding Rate"     value={`${cycle.feeding_rate_percent ?? '-'}%`} />
            </div>
            {cycle.notes && <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-elevated)', borderRadius: 10, fontSize: 13 }}><strong>Catatan:</strong> {cycle.notes}</div>}
          </div>
        </>
      )}

      {/* ===== Riwayat siklus selesai ===== */}
      {completed.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header"><div className="card-title"><History size={18} style={{ verticalAlign: -3 }} /> Riwayat Siklus</div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr>
                <th>Periode</th><th>Status</th><th>Panen</th><th>Total (kg)</th>
                <th>SR</th><th>FCR</th><th>Revenue</th><th>Profit</th><th>ROI</th><th>HPP/kg</th>
              </tr></thead>
              <tbody>
                {completed.map(c => {
                  const hppKg = (c.total_cost && c.harvest_total_kg) ? (parseFloat(c.total_cost) / parseFloat(c.harvest_total_kg)) : null;
                  return (
                    <tr key={c.cycle_id}>
                      <td>{fdate(c.start_date)} → {fdate(c.harvest_date)}</td>
                      <td><span className={`badge ${c.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{c.status === 'completed' ? 'Panen' : 'Batal'}</span></td>
                      <td>{c.partial_harvest_count ? `${c.partial_harvest_count}×` : '-'}</td>
                      <td>{c.harvest_total_kg ? `${fnum(c.harvest_total_kg)} kg` : '-'}</td>
                      <td>{c.survival_rate != null ? `${c.survival_rate}%` : '-'}</td>
                      <td>{c.fcr ?? '-'}</td>
                      <td>{rupiah(c.harvest_revenue)}</td>
                      <td style={{ color: c.profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{rupiah(c.profit)}</td>
                      <td>{c.roi != null ? `${c.roi}%` : '-'}</td>
                      <td>{hppKg != null ? `${rupiah(hppKg)}/kg` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showStart   && <StartModal   pondId={pondId} onClose={() => setShowStart(false)}   onDone={() => { setShowStart(false);   load(); onChange?.(); }} />}
      {showPartial && <PartialHarvestModal pondId={pondId} cycle={cycle} onClose={() => setShowPartial(false)} onDone={() => { setShowPartial(false); load(); onChange?.(); }} />}
      {showFinal   && <FinalHarvestModal   pondId={pondId} cycle={cycle} harvests={harvests} onClose={() => setShowFinal(false)}   onDone={() => { setShowFinal(false);   load(); onChange?.(); }} />}
    </>
  );
}

/* ========== Sub-components ========== */

function Stat({ icon, label, value, sub, bg, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={bg ? { background: bg, color } : {}}>{icon}</div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value" style={{ fontSize: 24 }}>{value}</div>
      <div className="stat-card-subtext">{sub}</div>
    </div>
  );
}
function Info({ icon, label, value }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 10 }}>
      <div className="flex items-center gap-2 text-muted text-xs" style={{ marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}
function SummaryBox({ label, value, sub, color }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Row({ k, v }) { return (<tr><td className="text-muted">{k}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{v}</td></tr>); }

/* ========== Modal: Mulai Siklus ========== */
function StartModal({ pondId, onClose, onDone }) {
  const [f, setF] = useState({
    initial_stock: '', fry_size: '5-7 cm', fry_cost_total: '', initial_feed_kg: '',
    target_harvest_date: '', target_weight_g: 125, feeding_rate_percent: 4, start_date: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      await startCycle(pondId, {
        initial_stock: parseInt(f.initial_stock) || 0,
        fry_size: f.fry_size || null,
        fry_cost_total: parseFloat(f.fry_cost_total) || 0,
        initial_feed_kg: parseFloat(f.initial_feed_kg) || 0,
        target_harvest_date: f.target_harvest_date || null,
        target_weight_g: parseFloat(f.target_weight_g) || 125,
        feeding_rate_percent: parseFloat(f.feeding_rate_percent) || 4,
        start_date: f.start_date || null,
        notes: f.notes || null,
      });
      onDone();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2 className="modal-title">Mulai Siklus Budidaya</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
        <form onSubmit={submit}>
          <div className="form-group"><label className="form-label">Jumlah Tebar (ekor) *</label>
            <input className="form-input" type="number" min="1" required value={f.initial_stock} onChange={set('initial_stock')} placeholder="mis. 1000" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label className="form-label">Ukuran Benih</label>
              <input className="form-input" value={f.fry_size} onChange={set('fry_size')} placeholder="5-7 cm" /></div>
            <div className="form-group"><label className="form-label">Tanggal Tebar</label>
              <input className="form-input" type="date" value={f.start_date} onChange={set('start_date')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label className="form-label">Biaya Benih (Rp)</label>
              <input className="form-input" type="number" min="0" value={f.fry_cost_total} onChange={set('fry_cost_total')} placeholder="mis. 500000" /></div>
            <div className="form-group"><label className="form-label">Stok Pakan Awal (kg)</label>
              <input className="form-input" type="number" min="0" step="0.1" value={f.initial_feed_kg} onChange={set('initial_feed_kg')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group"><label className="form-label">Target Panen</label>
              <input className="form-input" type="date" value={f.target_harvest_date} onChange={set('target_harvest_date')} /></div>
            <div className="form-group"><label className="form-label">Target Berat (g)</label>
              <input className="form-input" type="number" min="1" value={f.target_weight_g} onChange={set('target_weight_g')} /></div>
            <div className="form-group"><label className="form-label">Feeding Rate (%)</label>
              <input className="form-input" type="number" min="1" step="0.5" value={f.feeding_rate_percent} onChange={set('feeding_rate_percent')} /></div>
          </div>
          <div className="form-group"><label className="form-label">Catatan</label>
            <input className="form-input" value={f.notes} onChange={set('notes')} placeholder="opsional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Mulai Siklus'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ========== Modal: Panen Parsial ========== */
function PartialHarvestModal({ pondId, cycle, onClose, onDone }) {
  const m = cycle?.metrics || {};
  const [f, setF] = useState({
    fish_count: '', avg_weight_g: '', total_weight_kg: '', price_per_kg: '',
    harvest_date: new Date().toISOString().split('T')[0], notes: '',
    useTotal: false,   // toggle: input total kg langsung vs avg × ekor
  });
  const [busy,   setBusy]   = useState(false);
  const [preview, setPreview] = useState(null);
  const set = (k) => (e) => {
    const next = { ...f, [k]: e.target.value };
    // auto-preview
    const fc = parseInt(next.fish_count) || 0;
    const avg = parseFloat(next.avg_weight_g) || 0;
    const tot = parseFloat(next.total_weight_kg) || 0;
    const price = parseFloat(next.price_per_kg) || 0;
    const kg = next.useTotal ? tot : (fc > 0 && avg > 0 ? (fc * avg) / 1000 : 0);
    setPreview(fc > 0 && kg > 0 ? { kg: kg.toFixed(2), revenue: (kg * price).toFixed(0) } : null);
    setF(next);
  };

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      await addPartialHarvest(pondId, {
        fish_count: parseInt(f.fish_count) || 0,
        avg_weight_g: f.useTotal ? null : (parseFloat(f.avg_weight_g) || null),
        total_weight_kg: f.useTotal ? (parseFloat(f.total_weight_kg) || null) : null,
        price_per_kg: parseFloat(f.price_per_kg) || 0,
        harvest_date: f.harvest_date || null,
        notes: f.notes || null,
      });
      onDone();
    } catch (e) { alert(e.message); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title"><Scissors size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Panen Parsial</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Info siklus */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          Siklus hari ke-<strong>{m.days ?? 0}</strong> · Sisa populasi{' '}
          <strong>{(m.population ?? 0).toLocaleString('id-ID')} ekor</strong> · Target berat{' '}
          <strong>{cycle?.target_weight_g ?? '-'} g/ekor</strong>
          {m.avg_weight_g && (
            <span style={{ marginLeft: 8, color: m.avg_weight_g >= (cycle?.target_weight_g || 0) ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
              (Berat saat ini {m.avg_weight_g} g — {m.avg_weight_g >= (cycle?.target_weight_g || 0) ? '✓ Layak panen' : '⚡ Belum target'})
            </span>
          )}
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Jumlah Ekor Dipanen *</label>
            <input className="form-input" type="number" min="1" required
              value={f.fish_count} onChange={set('fish_count')} placeholder="mis. 500" />
          </div>

          {/* Toggle cara input berat */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button"
              className={`btn btn-sm ${!f.useTotal ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setF({ ...f, useTotal: false })}>
              Berat Rata-rata/ekor
            </button>
            <button type="button"
              className={`btn btn-sm ${f.useTotal ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setF({ ...f, useTotal: true })}>
              Total Berat Langsung
            </button>
          </div>

          {!f.useTotal ? (
            <div className="form-group">
              <label className="form-label">Berat Rata-rata per Ekor (gram) *</label>
              <input className="form-input" type="number" min="1" step="0.1" required={!f.useTotal}
                value={f.avg_weight_g} onChange={set('avg_weight_g')} placeholder="mis. 130" />
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                Sistem akan menghitung: {parseInt(f.fish_count)||0} ekor × {parseFloat(f.avg_weight_g)||0} g ÷ 1000 = <strong>{preview ? preview.kg : '—'} kg</strong>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Total Berat Panen (kg) *</label>
              <input className="form-input" type="number" min="0.1" step="0.01" required={f.useTotal}
                value={f.total_weight_kg} onChange={set('total_weight_kg')} placeholder="mis. 65.5" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Harga Jual (Rp/kg)</label>
              <input className="form-input" type="number" min="0"
                value={f.price_per_kg} onChange={set('price_per_kg')} placeholder="mis. 28000" />
              {preview && parseFloat(f.price_per_kg) > 0 && (
                <div className="text-xs" style={{ marginTop: 4, color: 'var(--success)', fontWeight: 600 }}>
                  Estimasi revenue: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(preview.revenue)}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal Panen</label>
              <input className="form-input" type="date" value={f.harvest_date} onChange={set('harvest_date')} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Catatan</label>
            <input className="form-input" value={f.notes} onChange={set('notes')} placeholder="mis. batch pertama ukuran &gt;130g" />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Menyimpan...' : <><Scissors size={15} /> Catat Panen Parsial</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ========== Modal: Panen Final & Tutup Siklus ========== */
function FinalHarvestModal({ pondId, cycle, harvests, onClose, onDone }) {
  const m = cycle?.metrics || {};
  const hasPartial = harvests.length > 0;

  const [f, setF] = useState({
    fish_count: '', avg_weight_g: '', total_weight_kg: '', harvest_price_per_kg: '',
    harvest_date: new Date().toISOString().split('T')[0], notes: '', useTotal: false,
  });
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);
  const [showPartialList, setShowPartialList] = useState(true);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Akumulasi parsial
  const accKg  = harvests.reduce((s, h) => s + parseFloat(h.total_weight_kg || 0), 0);
  const accRev  = harvests.reduce((s, h) => s + parseFloat(h.revenue || 0), 0);
  const accFish = harvests.reduce((s, h) => s + parseInt(h.fish_count || 0), 0);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const payload = {
        fish_count: parseInt(f.fish_count) || 0,
        avg_weight_g: f.useTotal ? null : (parseFloat(f.avg_weight_g) || null),
        total_weight_kg: f.useTotal ? (parseFloat(f.total_weight_kg) || null) : null,
        harvest_price_per_kg: parseFloat(f.harvest_price_per_kg) || 0,
        harvest_date: f.harvest_date || null,
        notes: f.notes || null,
      };
      const r = await harvestCycle(pondId, payload);
      setResult(r);
    } catch (e) { alert(e.message); setBusy(false); }
  }

  if (result) {
    const b = result.breakdown || {};
    const allHarvests = result.harvests || [];
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Laporan Akhir Siklus</h2>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Trophy size={44} style={{ color: 'var(--warning)' }} />
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8, color: b.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {b.profit >= 0 ? '🎉 Untung' : '📉 Rugi'} {rupiah(b.profit)}
            </div>
            <div className="text-muted text-xs">ROI {b.roi != null ? `${b.roi}%` : '-'}</div>
          </div>

          {/* Rekap panen parsial */}
          {allHarvests.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="text-xs text-muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Rincian {allHarvests.length} Panen
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead><tr><th>#</th><th>Tanggal</th><th>Ekor</th><th>kg</th><th>Harga</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {allHarvests.map(h => (
                      <tr key={h.harvest_no} style={h.is_final ? { background: 'var(--bg-elevated)', fontWeight: 700 } : {}}>
                        <td>{h.harvest_no}{h.is_final ? ' ⭐' : ''}</td>
                        <td>{fdate(h.harvest_date)}</td>
                        <td>{(parseInt(h.fish_count)||0).toLocaleString('id-ID')}</td>
                        <td>{fnum(h.total_weight_kg)} kg</td>
                        <td>{rupiah(h.price_per_kg)}</td>
                        <td style={{ color: 'var(--success)' }}>{rupiah(h.revenue)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--bg-elevated)', fontWeight: 800, fontSize: 13 }}>
                      <td colSpan={3}>TOTAL</td>
                      <td>{fnum(b.total_harvested_kg)} kg</td>
                      <td>—</td>
                      <td style={{ color: 'var(--success)' }}>{rupiah(b.revenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <table className="table" style={{ marginTop: 4 }}>
            <tbody>
              <Row k="Total Ikan Dipanen"  v={`${(b.total_harvested_fish||0).toLocaleString('id-ID')} ekor`} />
              <Row k="Total Bobot Panen"   v={`${fnum(b.total_harvested_kg)} kg`} />
              <Row k="Survival Rate"       v={b.survival_rate != null ? `${b.survival_rate}%` : '-'} />
              <Row k="FCR (konversi pakan)" v={b.fcr ?? '-'} />
              <Row k="Revenue (penjualan)" v={rupiah(b.revenue)} />
              <Row k="Biaya benih"         v={rupiah(b.fry_cost)} />
              <Row k="Biaya pakan"         v={rupiah(b.feed_cost)} />
              <Row k="Biaya operasional"   v={rupiah(b.op_cost)} />
              <Row k="Total biaya"         v={rupiah(b.total_cost)} />
              <Row k="HPP per kg"          v={b.hpp_per_kg != null ? `${rupiah(b.hpp_per_kg)}/kg` : '-'} />
            </tbody>
          </table>
          <div className="modal-actions"><button className="btn btn-primary" onClick={onDone}>Selesai</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title"><Anchor size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Panen Final &amp; Tutup Siklus</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Ringkasan panen parsial sebelumnya */}
        {hasPartial && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setShowPartialList(v => !v)}>
              <span style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>
                <PackageCheck size={15} style={{ verticalAlign: -2, marginRight: 4 }} />
                {harvests.length}× Panen Parsial Sebelumnya
              </span>
              {showPartialList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            {showPartialList && (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Total Dipanen</div>
                  <div style={{ fontWeight: 800, color: '#15803d' }}>{accKg.toFixed(2)} kg</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Jumlah Ekor</div>
                  <div style={{ fontWeight: 800, color: '#15803d' }}>{accFish.toLocaleString('id-ID')}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Revenue Parsial</div>
                  <div style={{ fontWeight: 800, color: '#15803d' }}>{rupiah(accRev)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          <AlertCircle size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
          Sisa populasi: <strong>{(m.population ?? 0).toLocaleString('id-ID')} ekor</strong>.
          Jika semua ikan sudah dipanen parsial, biarkan kolom di bawah kosong dan langsung tutup.
        </div>

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Ekor Sisa yang Dipanen</label>
              <input className="form-input" type="number" min="0"
                value={f.fish_count} onChange={set('fish_count')} placeholder="0 = tidak ada sisa" />
            </div>
            <div className="form-group">
              <label className="form-label">Berat Avg/ekor (g)</label>
              <input className="form-input" type="number" min="0" step="0.1"
                value={f.avg_weight_g} onChange={set('avg_weight_g')} placeholder="opsional" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Atau: Total Berat Sisa (kg)</label>
              <input className="form-input" type="number" min="0" step="0.01"
                value={f.total_weight_kg} onChange={set('total_weight_kg')} placeholder="opsional" />
            </div>
            <div className="form-group">
              <label className="form-label">Harga Jual Sisa (Rp/kg)</label>
              <input className="form-input" type="number" min="0"
                value={f.harvest_price_per_kg} onChange={set('harvest_price_per_kg')} placeholder="mis. 28000" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Tanggal Panen Final</label>
              <input className="form-input" type="date" value={f.harvest_date} onChange={set('harvest_date')} />
            </div>
            <div className="form-group">
              <label className="form-label">Catatan</label>
              <input className="form-input" value={f.notes} onChange={set('notes')} placeholder="opsional" />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={busy}
              style={{ background: '#dc2626', borderColor: '#dc2626' }}>
              {busy ? 'Memproses...' : <><Anchor size={15} /> Tutup Siklus &amp; Lihat Rekap</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
