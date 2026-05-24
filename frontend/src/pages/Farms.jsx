import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Fish, MapPin, User, Trash2, X } from 'lucide-react';
import { getFarms, createFarm, deleteFarm } from '../services/api';

export default function Farms() {
  const [farms, setFarms] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', owner: '', description: '' });

  async function load() {
    try {
      const r = await getFarms();
      setFarms(r);
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await createFarm(form);
      setShowModal(false);
      setForm({ name: '', location: '', owner: '', description: '' });
      load();
    } catch (e) { alert('Gagal: ' + e.message); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Hapus peternakan "${name}"?\nSemua kolam di dalamnya akan ikut terhapus.`)) return;
    try {
      await deleteFarm(id);
      load();
    } catch (e) { alert('Gagal: ' + e.message); }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Peternakan</h1>
          <p className="page-subtitle">Kelola semua peternakan ikan Anda</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Tambah Peternakan
        </button>
      </div>

      {farms.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Fish size={32} /></div>
            <h3>Belum ada peternakan</h3>
            <p>Klik tombol "Tambah Peternakan" untuk memulai</p>
          </div>
        </div>
      ) : (
        <div className="pond-grid">
          {farms.map(f => (
            <div key={f.farm_id} className="pond-card" style={{ position: 'relative' }}>
              <button
                className="btn btn-icon btn-secondary"
                onClick={(e) => { e.stopPropagation(); handleDelete(f.farm_id, f.name); }}
                style={{ position: 'absolute', top: 12, right: 12 }}
                title="Hapus"
              >
                <Trash2 size={14} />
              </button>
              <Link to={`/farms/${f.farm_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="pond-card-header">
                  <div className="pond-card-icon"><Fish size={22} /></div>
                </div>
                <div className="pond-card-name">{f.name}</div>
                <div className="pond-card-type">
                  <MapPin size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {f.location || '-'}
                </div>
                <div className="pond-card-stats">
                  <div>
                    <div className="pond-card-stat-label">Pemilik</div>
                    <div className="pond-card-stat-value" style={{ fontSize: 14 }}>{f.owner || '-'}</div>
                  </div>
                  <div>
                    <div className="pond-card-stat-label">Total Kolam</div>
                    <div className="pond-card-stat-value">{f.pond_count}</div>
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
              <h2 className="modal-title">Tambah Peternakan</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nama Peternakan *</label>
                <input className="form-input" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Peternakan Mina Sejahtera" />
              </div>
              <div className="form-group">
                <label className="form-label">Lokasi</label>
                <input className="form-input" value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Bandung, Jawa Barat" />
              </div>
              <div className="form-group">
                <label className="form-label">Pemilik</label>
                <input className="form-input" value={form.owner}
                  onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="Nama pemilik" />
              </div>
              <div className="form-group">
                <label className="form-label">Deskripsi</label>
                <textarea className="form-textarea" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi peternakan..." />
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
