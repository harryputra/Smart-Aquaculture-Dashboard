import { useEffect, useState } from 'react';
import {
  Sprout, CalendarClock, Fish, TrendingUp, Scale, Wheat, Percent,
  Play, Anchor, X, History, Trophy, Ban,
} from 'lucide-react';
import { getActiveCycle, startCycle, harvestCycle, getCycles, cancelCycle } from '../services/api';

const rupiah = (n) =>
  n == null ? '-' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const fdate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

export default function CycleTab({ pondId, onChange }) {
  const [cycle, setCycle] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStart, setShowStart] = useState(false);
  const [showHarvest, setShowHarvest] = useState(false);

  async function load() {
    try {
      const [c, hist] = await Promise.all([getActiveCycle(pondId), getCycles(pondId)]);
      setCycle(c);
      setCycles(hist);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [pondId]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const m = cycle?.metrics || {};
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
          {/* Kartu siklus aktif */}
          <div className="card mb-6" style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none' }}>
            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div className="text-xs" style={{ opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Siklus Aktif
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, fontFamily: "'Outfit',sans-serif" }}>
                  Hari ke-{m.days ?? 0}
                </div>
                <div style={{ fontSize: 14, opacity: 0.9 }}>Tebar {fdate(cycle.start_date)} · {cycle.initial_stock} ekor</div>
              </div>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setShowHarvest(true)}><Anchor size={16} /> Panen</button>
                <button className="btn btn-secondary" onClick={async () => {
                  if (confirm('Batalkan siklus aktif ini? (tanpa panen)')) { await cancelCycle(pondId).catch(e => alert(e.message)); load(); onChange?.(); }
                }}><Ban size={16} /> Batalkan</button>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <Stat icon={<Fish size={22} />} label="Populasi" value={m.population ?? '-'} sub={`Mati ${m.deaths ?? 0} ekor`} />
            <Stat icon={<Percent size={22} />} label="Survival Rate" value={m.survival_rate != null ? `${m.survival_rate}%` : '-'} sub="SR" bg="#d1fae5" color="#047857" />
            <Stat icon={<Scale size={22} />} label="Berat Rata-rata" value={m.avg_weight_g != null ? `${m.avg_weight_g} g` : '—'} sub={m.est_biomass_kg != null ? `Biomassa ~${m.est_biomass_kg} kg` : 'Belum sampling'} bg="#fef3c7" color="#b45309" />
            <Stat icon={<Wheat size={22} />} label="Total Pakan" value={`${m.total_feed_kg ?? 0} kg`} sub={m.fcr_est != null ? `FCR ~${m.fcr_est}` : 'FCR -'} bg="#dbeafe" color="#1d4ed8" />
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Target & Proyeksi</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <Info icon={<CalendarClock size={18} />} label="Target Panen" value={fdate(cycle.target_harvest_date)} />
              <Info icon={<Scale size={18} />} label="Target Berat" value={`${cycle.target_weight_g ?? '-'} g`} />
              <Info icon={<TrendingUp size={18} />} label="Estimasi ke Target" value={m.days_to_target != null ? `${m.days_to_target} hari lagi` : '—'} />
              <Info icon={<Wheat size={18} />} label="Feeding Rate" value={`${cycle.feeding_rate_percent ?? '-'}%`} />
            </div>
            {cycle.notes && <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-elevated)', borderRadius: 10, fontSize: 13 }}><strong>Catatan:</strong> {cycle.notes}</div>}
          </div>
        </>
      )}

      {/* Riwayat siklus */}
      {completed.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header"><div className="card-title"><History size={18} style={{ verticalAlign: -3 }} /> Riwayat Siklus</div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr>
                <th>Periode</th><th>Status</th><th>Panen (kg)</th><th>SR</th><th>FCR</th><th>Revenue</th><th>Profit</th><th>ROI</th>
              </tr></thead>
              <tbody>
                {completed.map(c => (
                  <tr key={c.cycle_id}>
                    <td>{fdate(c.start_date)} → {fdate(c.harvest_date)}</td>
                    <td><span className={`badge ${c.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{c.status === 'completed' ? 'Panen' : 'Batal'}</span></td>
                    <td>{c.harvest_total_kg ?? '-'}</td>
                    <td>{c.survival_rate != null ? `${c.survival_rate}%` : '-'}</td>
                    <td>{c.fcr ?? '-'}</td>
                    <td>{rupiah(c.harvest_revenue)}</td>
                    <td style={{ color: c.profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{rupiah(c.profit)}</td>
                    <td>{c.roi != null ? `${c.roi}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showStart && <StartModal pondId={pondId} onClose={() => setShowStart(false)} onDone={() => { setShowStart(false); load(); onChange?.(); }} />}
      {showHarvest && <HarvestModal pondId={pondId} cycle={cycle} onClose={() => setShowHarvest(false)} onDone={() => { setShowHarvest(false); load(); onChange?.(); }} />}
    </>
  );
}

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

function HarvestModal({ pondId, cycle, onClose, onDone }) {
  const [kg, setKg] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await harvestCycle(pondId, {
        harvest_total_kg: parseFloat(kg) || 0,
        harvest_price_per_kg: parseFloat(price) || 0,
        notes: notes || null,
      });
      setResult(r.breakdown || {});
    } catch (e) { alert(e.message); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2 className="modal-title">{result ? 'Laporan Panen' : 'Panen Siklus'}</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
        {!result ? (
          <form onSubmit={submit}>
            <p className="text-muted text-xs" style={{ marginBottom: 12 }}>Siklus hari ke-{cycle?.metrics?.days ?? 0}, populasi {cycle?.metrics?.population ?? '-'} ekor.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="form-label">Total Panen (kg) *</label>
                <input className="form-input" type="number" min="0" step="0.1" required value={kg} onChange={e => setKg(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Harga Jual (Rp/kg)</label>
                <input className="form-input" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="mis. 25000" /></div>
            </div>
            <div className="form-group"><label className="form-label">Catatan</label>
              <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="opsional" /></div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Memproses...' : 'Panen & Tutup Siklus'}</button>
            </div>
          </form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Trophy size={40} style={{ color: 'var(--warning)' }} />
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, color: result.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {result.profit >= 0 ? 'Untung' : 'Rugi'} {rupiah(result.profit)}
              </div>
              <div className="text-muted text-xs">ROI {result.roi != null ? `${result.roi}%` : '-'}</div>
            </div>
            <table className="table" style={{ marginTop: 8 }}>
              <tbody>
                <Row k="Survival Rate" v={result.survival_rate != null ? `${result.survival_rate}%` : '-'} />
                <Row k="FCR" v={result.fcr ?? '-'} />
                <Row k="Revenue (penjualan)" v={rupiah(result.revenue)} />
                <Row k="Biaya benih" v={rupiah(result.fry_cost)} />
                <Row k="Biaya pakan" v={rupiah(result.feed_cost)} />
                <Row k="Biaya operasional" v={rupiah(result.op_cost)} />
                <Row k="Total biaya" v={rupiah(result.total_cost)} />
              </tbody>
            </table>
            <div className="modal-actions"><button className="btn btn-primary" onClick={onDone}>Selesai</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
function Row({ k, v }) { return (<tr><td className="text-muted">{k}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{v}</td></tr>); }
