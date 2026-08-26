import { useEffect, useState } from 'react';
import { Plus, Calendar, Trash2, X } from 'lucide-react';
import { getSchedules, createSchedule, deleteSchedule } from '../services/api';

const DAYS = [
  { id: 1, label: 'S', name: 'Sen' }, { id: 2, label: 'S', name: 'Sel' },
  { id: 3, label: 'R', name: 'Rab' }, { id: 4, label: 'K', name: 'Kam' },
  { id: 5, label: 'J', name: 'Jum' }, { id: 6, label: 'S', name: 'Sab' },
  { id: 7, label: 'M', name: 'Min' },
];

const DEFAULT_FORM = {
  schedule_time: '06:00', selectedDays: [1, 2, 3, 4, 5, 6, 7],
  mode: 'duration',
  duration_minutes: 30,
  drain_target_cm: '', refill_target_cm: '', safety_cap_minutes: 30,
};

export default function ScheduleTab({ pondId }) {
  const [schedules, setSchedules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  async function load() {
    try { setSchedules(await getSchedules(pondId)); } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [pondId]);

  async function add(e) {
    e.preventDefault();
    if (form.mode === 'depth') {
      const drain = parseFloat(form.drain_target_cm);
      const refill = parseFloat(form.refill_target_cm);
      if (isNaN(drain) || isNaN(refill) || drain <= 0 || refill <= 0) {
        alert('Isi target kuras dan target isi ulang dengan angka positif.');
        return;
      }
      if (drain >= refill) {
        alert('Target kuras harus lebih kecil dari target isi ulang.');
        return;
      }
    }
    try {
      await createSchedule({
        pond_id: pondId,
        schedule_time: form.schedule_time,
        schedule_days: form.selectedDays.join(','),
        mode: form.mode,
        duration_minutes: form.mode === 'duration' ? +form.duration_minutes : undefined,
        drain_target_cm: form.mode === 'depth' ? +form.drain_target_cm : undefined,
        refill_target_cm: form.mode === 'depth' ? +form.refill_target_cm : undefined,
        safety_cap_minutes: form.mode === 'depth' ? +form.safety_cap_minutes : undefined,
      });
      setShowModal(false);
      setForm(DEFAULT_FORM);
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

  function summarize(s) {
    if (s.mode === 'depth') {
      return `Ketinggian: ${parseFloat(s.drain_target_cm).toFixed(1)}cm → ${parseFloat(s.refill_target_cm).toFixed(1)}cm (maks ${s.safety_cap_minutes} mnt/tahap)`;
    }
    return `Durasi: ${s.duration_minutes} menit`;
  }

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
                <tr><th>Waktu</th><th>Hari</th><th>Mode</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.schedule_time.slice(0, 5)}</strong></td>
                    <td>{s.schedule_days.split(',').map(d => DAYS.find(x => x.id == d)?.name).join(', ')}</td>
                    <td>{summarize(s)}</td>
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
              <div className="form-group">
                <label className="form-label">Mode Kuras</label>
                <select className="form-select" value={form.mode}
                  onChange={e => setForm({ ...form, mode: e.target.value })}>
                  <option value="duration">Durasi Tetap</option>
                  <option value="depth">Berdasarkan Ketinggian</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Waktu *</label>
                  <input type="time" required className="form-input" value={form.schedule_time}
                    onChange={e => setForm({ ...form, schedule_time: e.target.value })} />
                </div>
                {form.mode === 'duration' ? (
                  <div className="form-group">
                    <label className="form-label">Durasi (menit)</label>
                    <input type="number" required min="1" max="120" className="form-input" value={form.duration_minutes}
                      onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Batas waktu maks/tahap (menit)</label>
                    <input type="number" required min="1" max="120" className="form-input" value={form.safety_cap_minutes}
                      onChange={e => setForm({ ...form, safety_cap_minutes: e.target.value })} />
                  </div>
                )}
              </div>

              {form.mode === 'depth' && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Kuras sampai (cm) *</label>
                    <input type="number" required min="0" step="0.1" className="form-input" placeholder="mis. 40"
                      value={form.drain_target_cm}
                      onChange={e => setForm({ ...form, drain_target_cm: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Isi ulang sampai (cm) *</label>
                    <input type="number" required min="0" step="0.1" className="form-input" placeholder="mis. 50"
                      value={form.refill_target_cm}
                      onChange={e => setForm({ ...form, refill_target_cm: e.target.value })} />
                  </div>
                </div>
              )}

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
