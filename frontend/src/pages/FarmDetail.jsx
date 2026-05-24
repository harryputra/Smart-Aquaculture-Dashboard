import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Droplets, Wifi, WifiOff, ArrowLeft, Trash2, X, MapPin } from 'lucide-react';
import { getFarm, getPonds, createPond, deletePond } from '../services/api';

export default function FarmDetail() {
  const { farmId } = useParams();
  const [farm, setFarm] = useState(null);
  const [ponds, setPonds] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '', fish_type: 'Lele', size_m2: 50, max_depth: 150, fish_count: 1000,
  });

  async function load() {
    try {
      const [f, p] = await Promise.all([getFarm(farmId), getPonds(farmId)]);
      setFarm(f);
      setPonds(p);
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [farmId]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await createPond({ ...form, farm_id: farmId, stocking_date: new Date().toISOString().split('T')[0] });
      setShowModal(false);
      setForm({ name: '', fish_type: 'Lele', size_m2: 50, max_depth: 150, fish_count: 1000 });
      load();
    } catch (e) { alert('Gagal: ' + e.message); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Hapus kolam "${name}"?`)) return;
    try { await deletePond(id); load(); } catch (e) { alert('Gagal: ' + e.message); }
  }

  if (!farm) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page-container">
      <Link to="/farms" className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Kembali
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{farm.name}</h1>
          <p className="page-subtitle">
            <MapPin size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> {farm.location || '-'}
            {farm.owner && ` · Pemilik: ${farm.owner}`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Tambah Kolam
        </button>
      </div>

      {farm.description && (
        <div className="alert alert-info" style={{ marginBottom: 24 }}>
          {farm.description}
        </div>
      )}

      {ponds.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Droplets size={32} /></div>
            <h3>Belum ada kolam</h3>
            <p>Tambahkan kolam pertama di peternakan ini</p>
          </div>
        </div>
      ) : (
        <div className="pond-grid">
          {ponds.map(p => (
            <div key={p.pond_id} className="pond-card" style={{ position: 'relative' }}>
              <button
                className="btn btn-icon btn-secondary"
                onClick={e => { e.stopPropagation(); handleDelete(p.pond_id, p.name); }}
                style={{ position: 'absolute', top: 12, right: 12 }}
              >
                <Trash2 size={14} />
              </button>
              <Link to={`/ponds/${p.pond_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="pond-card-header">
                  <div className="pond-card-icon"><Droplets size={22} /></div>
                  <div className={`mode-indicator ${p.is_connected ? 'live' : 'dummy'}`}>
                    {p.is_connected ? <><Wifi size={12} /> ESP32</> : <><WifiOff size={12} /> Dummy</>}
                  </div>
                </div>
                <div className="pond-card-name">{p.name}</div>
                <div className="pond-card-type">{p.fish_type}</div>
                <div className="pond-card-stats">
                  <div>
                    <div className="pond-card-stat-label">Luas</div>
                    <div className="pond-card-stat-value">{p.size_m2} m²</div>
                  </div>
                  <div>
                    <div className="pond-card-stat-label">Populasi</div>
                    <div className="pond-card-stat-value">{p.fish_count}</div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Tambah Kolam</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nama Kolam *</label>
                <input className="form-input" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Kolam Lele A1" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Jenis Ikan</label>
                  <select className="form-select" value={form.fish_type}
                    onChange={e => setForm({ ...form, fish_type: e.target.value })}>
                    <option>Lele</option><option>Nila</option><option>Mas</option>
                    <option>Gurame</option><option>Patin</option><option>Bawal</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Populasi (ekor)</label>
                  <input type="number" className="form-input" value={form.fish_count}
                    onChange={e => setForm({ ...form, fish_count: +e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Luas (m²)</label>
                  <input type="number" className="form-input" value={form.size_m2}
                    onChange={e => setForm({ ...form, size_m2: +e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Kedalaman Max (cm)</label>
                  <input type="number" className="form-input" value={form.max_depth}
                    onChange={e => setForm({ ...form, max_depth: +e.target.value })} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
