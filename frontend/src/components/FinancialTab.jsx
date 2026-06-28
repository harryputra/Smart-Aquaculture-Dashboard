import { useEffect, useState } from 'react';
import {
  Wallet, Wheat, TrendingUp, AlertTriangle, Plus, Trash2, PiggyBank, Receipt,
} from 'lucide-react';
import {
  getFeedStock, updateFeedStock, getCosts, addCost, deleteCost, getFinancial,
} from '../services/api';

const rupiah = (n) =>
  n == null ? '-' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

const COST_TYPES = ['listrik', 'obat', 'tenaga', 'lain'];

export default function FinancialTab({ pondId }) {
  const [fin, setFin] = useState(null);
  const [stock, setStock] = useState(null);
  const [costs, setCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sellPrice, setSellPrice] = useState('');     // estimasi harga jual Rp/kg
  const [busy, setBusy] = useState(false);

  // form stok
  const [addKg, setAddKg] = useState('');
  const [price, setPrice] = useState('');
  const [lowKg, setLowKg] = useState('');
  // form biaya
  const [cType, setCType] = useState('listrik');
  const [cAmount, setCAmount] = useState('');
  const [cDesc, setCDesc] = useState('');

  async function load() {
    try {
      const [f, s, c] = await Promise.all([getFinancial(pondId), getFeedStock(pondId), getCosts(pondId)]);
      setFin(f); setStock(s); setCosts(c);
      if (s) { setPrice(String(s.price_per_kg || '')); setLowKg(String(s.low_threshold_kg || '')); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [pondId]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  async function saveStock(extra = {}) {
    setBusy(true);
    try {
      await updateFeedStock(pondId, {
        ...(addKg ? { add_kg: parseFloat(addKg) } : {}),
        ...(price !== '' ? { price_per_kg: parseFloat(price) } : {}),
        ...(lowKg !== '' ? { low_threshold_kg: parseFloat(lowKg) } : {}),
        ...extra,
      });
      setAddKg(''); await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function submitCost(e) {
    e.preventDefault(); setBusy(true);
    try { await addCost(pondId, { cost_type: cType, amount: parseFloat(cAmount), description: cDesc || null }); setCAmount(''); setCDesc(''); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function rmCost(id) { setBusy(true); try { await deleteCost(pondId, id); await load(); } catch (e) { alert(e.message); } finally { setBusy(false); } }

  const lowStock = stock && parseFloat(stock.current_stock_kg) <= parseFloat(stock.low_threshold_kg);
  // proyeksi pakai harga jual estimasi
  const sp = parseFloat(sellPrice) || 0;
  const projKg = fin?.proj_harvest_kg || 0;
  const projRevenue = sp * projKg;
  const projProfit = fin ? projRevenue - fin.total_cost : 0;
  const projRoi = fin && fin.total_cost > 0 ? (projProfit / fin.total_cost) * 100 : null;

  return (
    <>
      {!fin && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <AlertTriangle size={18} /><div>Belum ada siklus aktif. Mulai siklus di tab <strong>Siklus</strong> agar biaya & proyeksi terhitung.</div>
        </div>
      )}

      {/* STOK PAKAN */}
      <div className="card mb-6">
        <div className="card-header">
          <div><div className="card-title"><Wheat size={18} style={{ verticalAlign: -3 }} /> Stok & Harga Pakan</div></div>
          {lowStock && <span className="badge badge-warning"><AlertTriangle size={13} /> Stok menipis</span>}
        </div>
        <div className="stats-grid" style={{ marginBottom: 12 }}>
          <div className="stat-card"><div className="stat-card-icon"><Wheat size={22} /></div>
            <div className="stat-card-label">Stok Sekarang</div><div className="stat-card-value">{stock ? parseFloat(stock.current_stock_kg).toFixed(1) : '0'}</div><div className="stat-card-subtext">kg</div></div>
          <div className="stat-card"><div className="stat-card-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}><Wallet size={22} /></div>
            <div className="stat-card-label">Harga Pakan</div><div className="stat-card-value" style={{ fontSize: 20 }}>{rupiah(stock?.price_per_kg)}</div><div className="stat-card-subtext">/kg</div></div>
          <div className="stat-card"><div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><AlertTriangle size={22} /></div>
            <div className="stat-card-label">Ambang Rendah</div><div className="stat-card-value">{stock ? parseFloat(stock.low_threshold_kg).toFixed(1) : '0'}</div><div className="stat-card-subtext">kg</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Tambah stok (kg)</label>
            <input className="form-input" type="number" min="0" step="0.5" value={addKg} onChange={e => setAddKg(e.target.value)} style={{ width: 130 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Harga (Rp/kg)</label>
            <input className="form-input" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} style={{ width: 130 }} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Ambang rendah (kg)</label>
            <input className="form-input" type="number" min="0" value={lowKg} onChange={e => setLowKg(e.target.value)} style={{ width: 140 }} /></div>
          <button className="btn btn-primary" disabled={busy} onClick={() => saveStock()}>Simpan</button>
        </div>
      </div>

      {/* PROYEKSI FINANSIAL */}
      {fin && (
        <div className="card mb-6">
          <div className="card-header"><div className="card-title"><PiggyBank size={18} style={{ verticalAlign: -3 }} /> Proyeksi Keuangan (siklus berjalan)</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
            <Box label="Biaya benih" value={rupiah(fin.fry_cost)} />
            <Box label="Biaya pakan" value={rupiah(fin.feed_cost)} sub={`${fin.total_feed_kg} kg × ${rupiah(fin.feed_price_per_kg)}`} />
            <Box label="Biaya operasional" value={rupiah(fin.op_cost)} />
            <Box label="Total biaya" value={rupiah(fin.total_cost)} strong />
          </div>
          <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
            <div className="flex items-center gap-3" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontWeight: 600 }}>Estimasi panen: {fin.proj_harvest_kg ?? '-'} kg</span>
              <span className="text-muted text-xs">(populasi {fin.population} × target {fin.target_weight_g ?? '-'} g)</span>
              <div className="flex items-end gap-2" style={{ marginLeft: 'auto' }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Estimasi harga jual (Rp/kg)</label>
                  <input className="form-input" type="number" min="0" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="mis. 25000" style={{ width: 150 }} /></div>
              </div>
            </div>
            {sp > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
                <Box label="Proyeksi revenue" value={rupiah(projRevenue)} />
                <Box label="Proyeksi profit" value={rupiah(projProfit)} color={projProfit >= 0 ? 'var(--success)' : 'var(--danger)'} strong />
                <Box label="Proyeksi ROI" value={projRoi != null ? `${projRoi.toFixed(1)}%` : '-'} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* BIAYA OPERASIONAL */}
      <div className="card">
        <div className="card-header"><div className="card-title"><Receipt size={18} style={{ verticalAlign: -3 }} /> Biaya Operasional</div></div>
        {fin ? (
          <form onSubmit={submitCost} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Jenis</label>
              <select className="form-select" value={cType} onChange={e => setCType(e.target.value)}>{COST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Jumlah (Rp)</label>
              <input className="form-input" type="number" min="1" required value={cAmount} onChange={e => setCAmount(e.target.value)} style={{ width: 150 }} /></div>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}><label className="form-label">Keterangan</label>
              <input className="form-input" value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="opsional" /></div>
            <button className="btn btn-primary" disabled={busy}><Plus size={16} /> Tambah</button>
          </form>
        ) : <div className="text-muted" style={{ marginBottom: 12 }}>Mulai siklus untuk mencatat biaya.</div>}
        {costs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Jumlah</th><th></th></tr></thead>
              <tbody>
                {costs.map(c => (
                  <tr key={c.id}>
                    <td>{new Date(c.recorded_at).toLocaleDateString('id-ID')}</td>
                    <td><span className="badge badge-neutral">{c.cost_type}</span></td>
                    <td>{c.description || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{rupiah(c.amount)}</td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => rmCost(c.id)}><Trash2 size={13} /></button></td>
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

function Box({ label, value, sub, strong, color }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 10 }}>
      <div className="text-muted text-xs">{label}</div>
      <div style={{ fontWeight: strong ? 800 : 700, fontSize: strong ? 20 : 16, color: color || 'inherit', marginTop: 2 }}>{value}</div>
      {sub && <div className="text-xs text-muted" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
