import { useEffect, useState } from 'react';
import { Plus, Clock, Trash2, X, Power } from 'lucide-react';
import { getLeleSchedules, createLeleSchedule, toggleLeleSchedule, deleteLeleSchedule } from '../../services/leleApi';

export default function FeedingSchedulePanel({ deviceId }) {
  const [schedules, setSchedules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ schedule_time: '07:00', note: '' });

  async function load() {
    try {
      const r = await getLeleSchedules(deviceId);
      setSchedules(r);
    } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [deviceId]);

  async function add(e) {
    e.preventDefault();
    try {
      await createLeleSchedule(deviceId, form);
      setShowModal(false);
      setForm({ schedule_time: '07:00', note: '' });
      load();
    } catch (e) { alert(e.message); }
  }

  async function toggle(id) {
    try { await toggleLeleSchedule(id); load(); } catch (e) { alert(e.message); }
  }

  async function del(id) {
    if (!confirm('Hapus jadwal?')) return;
    try { await deleteLeleSchedule(id); load(); } catch (e) { alert(e.message); }
  }

  // Cari jadwal berikutnya
  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const activeSchedules = schedules.filter(s => s.is_active);

  const nextSchedule = activeSchedules
    .map(s => {
      const [h, m] = s.schedule_time.split(':');
      const min = parseInt(h) * 60 + parseInt(m);
      return { ...s, minOfDay: min, diff: min > currentMin ? min - currentMin : (1440 - currentMin + min) };
    })
    .sort((a, b) => a.diff - b.diff)[0];

  return (
    <>
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">⏰ Jadwal Pakan</div>
            <div className="card-subtitle">Jadwal pemberian pakan berbasis jam (versi final, bukan interval test)</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Tambah Jadwal
          </button>
        </div>

        {/* Next feeding indicator */}
        {nextSchedule && (
          <div className="alert alert-info" style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none' }}>
            <Clock size={18} />
            <div>
              <strong>Jadwal Berikutnya:</strong> {nextSchedule.schedule_time.slice(0, 5)} ({nextSchedule.note || 'tanpa catatan'})
              {' '}— dalam {Math.floor(nextSchedule.diff / 60)} jam {nextSchedule.diff % 60} menit
            </div>
          </div>
        )}

        {schedules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock size={28} /></div>
            <h3>Belum ada jadwal</h3>
            <p>Rekomendasi: 07:00 (pagi) dan 17:00 (sore) untuk 2x sehari</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Catatan</th><th>Last Run</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td>
                      <strong style={{ fontSize: 18, fontFamily: "'Outfit', sans-serif" }}>
                        {s.schedule_time.slice(0, 5)}
                      </strong>
                    </td>
                    <td>{s.note || '-'}</td>
                    <td>
                      <span className="text-xs text-muted">
                        {s.last_executed ? new Date(s.last_executed).toLocaleString('id-ID') : 'Belum pernah'}
                      </span>
                    </td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={s.is_active} onChange={() => toggle(s.id)} />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <button className="btn btn-icon btn-secondary" onClick={() => del(s.id)}>
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

      <div className="alert alert-warning">
        <Power size={18} />
        <div>
          <strong>Catatan penting:</strong> jadwal hanya berjalan saat <em>Auto Feed RTC</em> aktif di tab Pakan Otomatis.
          Frekuensi pakan/hari di tab <em>Data Kolam</em> sebaiknya sesuai dengan jumlah jadwal yang aktif di sini.
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Tambah Jadwal Pakan</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={add}>
              <div className="form-group">
                <label className="form-label">Jam *</label>
                <input type="time" required className="form-input" value={form.schedule_time}
                  onChange={e => setForm({ ...form, schedule_time: e.target.value })} />
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                  Rekomendasi: 07:00 (pagi), 12:00 (siang), 17:00 (sore)
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <input className="form-input" value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Contoh: Pakan pagi" />
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
