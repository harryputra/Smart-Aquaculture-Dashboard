import { useEffect, useState } from 'react';
import { Plus, Calendar, Trash2, X } from 'lucide-react';
import { getSchedules, createSchedule, deleteSchedule } from '../services/api';

const DAYS = [
  { id: 1, label: 'S', name: 'Sen' }, { id: 2, label: 'S', name: 'Sel' },
  { id: 3, label: 'R', name: 'Rab' }, { id: 4, label: 'K', name: 'Kam' },
  { id: 5, label: 'J', name: 'Jum' }, { id: 6, label: 'S', name: 'Sab' },
  { id: 7, label: 'M', name: 'Min' },
];

export default function ScheduleTab({ pondId }) {
  const [schedules, setSchedules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    schedule_time: '06:00', selectedDays: [1, 2, 3, 4, 5, 6, 7], duration_minutes: 30,
  });

  async function load() {
    try { setSchedules(await getSchedules(pondId)); } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [pondId]);

  async function add(e) {
    e.preventDefault();
    try {
      await createSchedule({
        pond_id: pondId,
        schedule_time: form.schedule_time,
        schedule_days: form.selectedDays.join(','),
        duration_minutes: +form.duration_minutes,
      });
      setShowModal(false);
      load();
    } catch (e) { alert(e.message); }
  }

  async function del(id) {
    if (!confirm('Hapus jadwal?')) return;
    try { await deleteSchedule(id); load(); } catch (e) { alert(e.message); }
  }

  const toggleDay = d => setForm(p => ({
    ...p,
    selectedDays: p.selectedDays.includes(d) ? p.selectedDays.filter(x => x !== d) : [...p.selectedDays, d],
  }));

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Jadwal Pengurasan Otomatis</div>
            <div className="card-subtitle">Kolam akan dikuras sesuai jadwal yang ditetapkan</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Tambah Jadwal
          </button>
        </div>

        {schedules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Calendar size={28} /></div>
            <h3>Belum ada jadwal</h3>
            <p>Tambahkan jadwal untuk pengurasan otomatis</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Hari</th><th>Durasi</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.schedule_time.slice(0, 5)}</strong></td>
                    <td>{s.schedule_days.split(',').map(d => DAYS.find(x => x.id == d)?.name).join(', ')}</td>
                    <td>{s.duration_minutes} menit</td>
                    <td><span className="badge badge-success">Aktif</span></td>
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Tambah Jadwal Kuras</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={add}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Waktu *</label>
                  <input type="time" required className="form-input" value={form.schedule_time}
                    onChange={e => setForm({ ...form, schedule_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Durasi (menit)</label>
                  <input type="number" required className="form-input" value={form.duration_minutes}
                    onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Hari</label>
                <div className="day-picker">
                  {DAYS.map(d => (
                    <button type="button" key={d.id}
                      className={'day-btn' + (form.selectedDays.includes(d.id) ? ' active' : '')}
                      onClick={() => toggleDay(d.id)} title={d.name}>
                      {d.label}
                    </button>
                  ))}
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
    </>
  );
}
