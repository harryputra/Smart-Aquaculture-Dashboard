import { useEffect, useState } from 'react';
import { Plus, Utensils, Trash2, X, Activity, Sliders, Clock, History, Terminal, Settings as SettingsIcon, Info } from 'lucide-react';
import {
  getFeedingSchedules, createFeedingSchedule, deleteFeedingSchedule,
  getFeedingLogs, recordFeeding, getPondFeeder, getFeedPlan
} from '../services/api';
import FeederDetail from './FeederDetail';
import FeedPlanCard from './FeedPlanCard';
import JadwalPakanPanel from './lele/JadwalPakanPanel';
import StatusSistemPanel from './lele/StatusSistemPanel';
import PakanOtomatisPanel from './lele/PakanOtomatisPanel';
import KalibrasiTarePanel from './lele/KalibrasiTarePanel';
import RiwayatAkhirPanel from './lele/RiwayatAkhirPanel';
import PengaturanPanel from './lele/PengaturanPanel';
import FeedControlSyncPanel from './lele/FeedControlSyncPanel';
import MqttMonitorPanel from './lele/MqttMonitorPanel';
import DataKolamPanel from './lele/DataKolamPanel';
import { useCan } from '../context/AuthContext';

const ESP_PANELS = [
  { id: 'plan',      label: 'Rencana Pakan',    icon: Clock },
  { id: 'status',    label: 'Status Sistem',    icon: Activity },
  { id: 'feedctl',   label: 'Kontrol Pakan',    icon: Sliders },
  { id: 'feeding',   label: 'Pakan Otomatis',   icon: Utensils },
  { id: 'pond',      label: 'Data Kolam',       icon: Utensils }, // Using Utensils for pond data
  { id: 'tare',      label: 'Kalibrasi/Tare',   icon: Sliders },
  { id: 'history',   label: 'Riwayat Akhir',    icon: History },
  { id: 'monitor',   label: 'Diagnostik',       icon: Terminal },
  { id: 'settings',  label: 'Pengaturan',       icon: SettingsIcon },
];

// Tab inti yang dipakai harian (semua role). Sisanya (jadwal onboard,
// kalibrasi, riwayat, diagnostik, pengaturan device) jarang dipakai &
// cuma relevan buat pemilik/superadmin — sembunyikan dari pekerja/pengamat
// biar tak "pusing" lihat 9 tab (keluhan peternak).
const CORE_PANEL_IDS = ['plan', 'status', 'feedctl', 'pond'];

const DAYS = [
  { id: 1, label: 'S', name: 'Sen' }, { id: 2, label: 'S', name: 'Sel' },
  { id: 3, label: 'R', name: 'Rab' }, { id: 4, label: 'K', name: 'Kam' },
  { id: 5, label: 'J', name: 'Jum' }, { id: 6, label: 'S', name: 'Sab' },
  { id: 7, label: 'M', name: 'Min' },
];

export default function FeedingTab({ pondId }) {
  const { role } = useCan();
  const showAdvancedTabs = role === 'pemilik' || role === 'superadmin';
  const visiblePanels = showAdvancedTabs ? ESP_PANELS : ESP_PANELS.filter(p => CORE_PANEL_IDS.includes(p.id));
  const [schedules, setSchedules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showSchModal, setShowSchModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [schForm, setSchForm] = useState({
    schedule_time: '07:00', selectedDays: [1, 2, 3, 4, 5, 6, 7],
    feed_amount_kg: 2.5, feed_type: 'Pelet 781-2', note: '',
  });
  const [logForm, setLogForm] = useState({ feed_amount_kg: 2.5, feed_type: 'Pelet', note: '' });
  const [feederData, setFeederData] = useState(null);
  const [espTab, setEspTab] = useState('plan');
  const [plan, setPlan] = useState(null);   // ringkasan Rencana Pakan (utk banner konsistensi)

  async function load() {
    try {
      const [s, l, f] = await Promise.all([getFeedingSchedules(pondId), getFeedingLogs(pondId), getPondFeeder(pondId)]);
      setSchedules(s);
      setLogs(l);
      setFeederData(f);
    } catch (e) { console.error(e); }
    try { const p = await getFeedPlan(pondId); setPlan(p); } catch (e) { /* */ }
  }

  async function loadFeeder() {
    try {
      const f = await getPondFeeder(pondId);
      setFeederData(f);
    } catch (e) { console.error(e); }
  }

  useEffect(() => { 
    load(); 
    const id = setInterval(loadFeeder, 3000);
    return () => clearInterval(id);
  }, [pondId]);

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
      {(!feederData || !feederData.has_device) && <FeederDetail pondId={pondId} />}

      {feederData?.has_device && feederData?.settings ? (
        <div style={{ marginTop: 12 }}>
          {plan?.plan?.enabled && plan?.sessions?.length > 0 && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, padding: '12px 16px',
              borderRadius: 12, background: 'var(--accent-light)', border: '1px solid var(--accent-primary)', color: 'var(--text-primary)',
            }}>
              <Info size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                <strong>Rencana Pakan AKTIF ({plan.sessions.length}×/hari).</strong> Kolam ini diberi pakan dari <strong>dashboard</strong> sesuai persen di tab <strong>Rencana Pakan</strong> — bukan jadwal onboard feeder. Karena itu:
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li><strong>Mode Pakan = Manual</strong> itu <em>disengaja</em> (auto‑feed onboard dimatikan agar feeder tak memberi porsi bawaannya/dobel).</li>
                  <li>Gramasi di <strong>Data Kolam</strong> (mis. "200 g/jadwal") hanya <em>preview onboard</em> — <strong>yang dipakai</strong> adalah gram di Rencana Pakan.</li>
                </ul>
              </div>
            </div>
          )}
          <div className="tabs" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
            {visiblePanels.map(p => {
              const Icon = p.icon;
              return (
                <button key={p.id}
                  className={'tab' + (espTab === p.id ? ' active' : '')}
                  onClick={() => setEspTab(p.id)}>
                  <Icon size={16} /> {p.label}
                </button>
              );
            })}
          </div>

          {espTab === 'plan'      && <FeedPlanCard pondId={pondId} />}
          {espTab === 'status'    && <StatusSistemPanel device={feederData.settings} onAssign={() => {}} />}
          {espTab === 'feedctl'   && <FeedControlSyncPanel device={feederData.settings} />}
          {espTab === 'feeding'   && <PakanOtomatisPanel device={feederData.settings} />}
          {espTab === 'pond'      && <DataKolamPanel device={feederData.settings} />}
          {espTab === 'tare'      && <KalibrasiTarePanel device={feederData.settings} />}
          {espTab === 'history'   && <RiwayatAkhirPanel device={feederData.settings} />}
          {espTab === 'monitor'   && <MqttMonitorPanel deviceId={feederData.settings.device_id} device={feederData.settings} />}
          {espTab === 'settings'  && <PengaturanPanel device={feederData.settings} onAssign={() => {}} />}
        </div>
      ) : (
        <>
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
        </>
      )}

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
