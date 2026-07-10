import { useEffect, useState } from 'react';
import { Plus, Utensils, Trash2, X } from 'lucide-react';
import {
  getFeedingSchedules, createFeedingSchedule, deleteFeedingSchedule,
  getFeedingLogs, recordFeeding,
} from '../services/api';
import FeederDetail from './FeederDetail';

const DAYS = [
  { id: 1, label: 'S', name: 'Sen' }, { id: 2, label: 'S', name: 'Sel' },
  { id: 3, label: 'R', name: 'Rab' }, { id: 4, label: 'K', name: 'Kam' },
  { id: 5, label: 'J', name: 'Jum' }, { id: 6, label: 'S', name: 'Sab' },
  { id: 7, label: 'M', name: 'Min' },
];

export default function FeedingTab({ pondId }) {
  const [schedules, setSchedules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showSchModal, setShowSchModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [schForm, setSchForm] = useState({
    schedule_time: '07:00', selectedDays: [1, 2, 3, 4, 5, 6, 7],
    feed_amount_kg: 2.5, feed_type: 'Pelet 781-2', note: '',
  });
  const [logForm, setLogForm] = useState({ feed_amount_kg: 2.5, feed_type: 'Pelet', note: '' });

  async function load() {
    try {
      const [s, l] = await Promise.all([getFeedingSchedules(pondId), getFeedingLogs(pondId)]);
      setSchedules(s);
      setLogs(l);
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); }, [pondId]);

  async function addSchedule(e) {
    e.preventDefault();
    try {
      await createFeedingSchedule({
        pond_id: pondId,
        schedule_time: schForm.schedule_time,
        schedule_days: schForm.selectedDays.join(','),
        feed_amount_kg: +schForm.feed_amount_kg,
        feed_type: schForm.feed_type,
        note: schForm.note,
      });
      setShowSchModal(false);
      load();
    } catch (e) { alert('Gagal: ' + e.message); }
  }

  async function delSchedule(id) {
    if (!confirm('Hapus jadwal ini?')) return;
    try { await deleteFeedingSchedule(id); load(); } catch (e) { alert(e.message); }
  }

  async function manualFeed(e) {
    e.preventDefault();
    try {
      await recordFeeding({ pond_id: pondId, ...logForm });
      setShowLogModal(false);
      setLogForm({ feed_amount_kg: 2.5, feed_type: 'Pelet', note: '' });
      load();
    } catch (e) { alert('Gagal: ' + e.message); }
  }

  const toggleDay = d => setSchForm(prev => ({
    ...prev,
    selectedDays: prev.selectedDays.includes(d) ? prev.selectedDays.filter(x => x !== d) : [...prev.selectedDays, d],
  }));

  return (
    <>
      <FeederDetail pondId={pondId} />

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">Jadwal Pakan Otomatis</div>
            <div className="card-subtitle">Pakan akan diberikan otomatis sesuai jadwal</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => setShowLogModal(true)}>
              <Utensils size={16} /> Catat Manual
            </button>
            <button className="btn btn-primary" onClick={() => setShowSchModal(true)}>
              <Plus size={16} /> Tambah Jadwal
            </button>
          </div>
        </div>

        {schedules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Utensils size={28} /></div>
            <h3>Belum ada jadwal pakan</h3>
            <p>Tambahkan jadwal untuk pemberian pakan otomatis</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Hari</th><th>Jumlah</th><th>Jenis</th><th>Catatan</th><th></th></tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.schedule_time.slice(0, 5)}</strong></td>
                    <td>{s.schedule_days.split(',').map(d => DAYS.find(x => x.id == d)?.name).join(', ')}</td>
                    <td>{s.feed_amount_kg} kg</td>
                    <td>{s.feed_type || '-'}</td>
                    <td>{s.note || '-'}</td>
                    <td>
                      <button className="btn btn-icon btn-secondary" onClick={() => delSchedule(s.id)}>
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

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Riwayat Pemberian Pakan</div>
            <div className="card-subtitle">50 pemberian terakhir</div>
          </div>
        </div>
        {logs.length === 0 ? (
          <div className="empty-state"><p>Belum ada riwayat pakan</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tanggal & Waktu</th><th>Jumlah</th><th>Jenis</th><th>Sumber</th><th>Catatan</th></tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td>{new Date(l.timestamp).toLocaleString('id-ID')}</td>
                    <td><strong>{l.feed_amount_kg} kg</strong></td>
                    <td>{l.feed_type || '-'}</td>
                    <td>
                      <span className={`badge ${l.triggered_by === 'schedule' ? 'badge-info' : 'badge-neutral'}`}>
                        {l.triggered_by === 'schedule' ? 'Jadwal' : 'Manual'}
                      </span>
                    </td>
                    <td>{l.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showSchModal && (
        <div className="modal-overlay" onClick={() => setShowSchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Tambah Jadwal Pakan</h2>
              <button className="modal-close" onClick={() => setShowSchModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={addSchedule}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Waktu *</label>
                  <input type="time" required className="form-input" value={schForm.schedule_time}
                    onChange={e => setSchForm({ ...schForm, schedule_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Jumlah (kg) *</label>
                  <input type="number" step="0.1" required className="form-input" value={schForm.feed_amount_kg}
                    onChange={e => setSchForm({ ...schForm, feed_amount_kg: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Hari</label>
                <div className="day-picker">
                  {DAYS.map(d => (
                    <button type="button" key={d.id}
                      className={'day-btn' + (schForm.selectedDays.includes(d.id) ? ' active' : '')}
                      onClick={() => toggleDay(d.id)} title={d.name}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pakan</label>
                <input className="form-input" value={schForm.feed_type}
                  onChange={e => setSchForm({ ...schForm, feed_type: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <input className="form-input" value={schForm.note}
                  onChange={e => setSchForm({ ...schForm, note: e.target.value })}
                  placeholder="Contoh: Pakan pagi" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSchModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Catat Pakan Manual</h2>
              <button className="modal-close" onClick={() => setShowLogModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={manualFeed}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Jumlah (kg)</label>
                  <input type="number" step="0.1" required className="form-input" value={logForm.feed_amount_kg}
                    onChange={e => setLogForm({ ...logForm, feed_amount_kg: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Jenis</label>
                  <input className="form-input" value={logForm.feed_type}
                    onChange={e => setLogForm({ ...logForm, feed_type: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea className="form-textarea" value={logForm.note}
                  onChange={e => setLogForm({ ...logForm, note: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowLogModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Catat</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
