import { useEffect, useState } from 'react';
import { Clock, Wand2, Save, Power, AlertCircle } from 'lucide-react';
import { remoteUpdateSchedule, remoteAutoGenSchedule, getSyncedSchedules } from '../../services/leleApi';

export default function JadwalPakanPanel({ device }) {
  const [synced, setSynced] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setSynced(await getSyncedSchedules(device.device_id)); }
    catch (e) { /* */ }
  }

  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [device.device_id]);

  const feedingPerDay = device.feeding_per_day || 2;
  const isOffline = !device.is_online;

  // Live schedules dari status payload (kalau ada), fallback ke synced DB
  const liveSchedules = device.live_data?.schedules || [];
  const schedules = liveSchedules.length ? liveSchedules : synced.map(s => ({
    index: s.schedule_index, hour: s.hour, minute: s.minute, enabled: s.enabled,
  }));

  async function saveOne(idx, data) {
    setBusy(true);
    try {
      await remoteUpdateSchedule(device.device_id, idx, data);
      setEditing(null);
      setTimeout(load, 500);
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function handleAutoGen() {
    if (!confirm(`Auto-generate jadwal untuk ${feedingPerDay}x/hari?\n\nJadwal lama akan diganti dengan distribusi merata 07:00 - 17:00.`)) return;
    setBusy(true);
    try {
      await remoteAutoGenSchedule(device.device_id);
      setTimeout(load, 1000);
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  return (
    <>
      {isOffline && <div className="alert alert-danger"><AlertCircle size={18} /><div>Device offline.</div></div>}

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">⏰ Jadwal Pakan Aktif</div>
            <div className="card-subtitle">
              {feedingPerDay} jadwal aktif, next: <strong>{device.next_schedule_hhmm || '--:--'}</strong>
            </div>
          </div>
          <button className="btn btn-warning" onClick={handleAutoGen} disabled={busy || isOffline}>
            <Wand2 size={16} /> Auto-Generate
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {schedules.map((s, i) => {
            const isEditing = editing === s.index;
            return (
              <ScheduleCard
                key={s.index}
                index={s.index}
                hour={s.hour}
                minute={s.minute}
                enabled={s.enabled}
                isActive={i < feedingPerDay}
                isEditing={isEditing}
                isOffline={isOffline}
                busy={busy}
                onEdit={() => setEditing(s.index)}
                onCancel={() => setEditing(null)}
                onSave={(data) => saveOne(s.index, data)}
              />
            );
          })}
        </div>
      </div>

      <div className="alert alert-info">
        <Clock size={18} />
        <div className="text-xs">
          <strong>Cara kerja:</strong> ESP32 cek RTC tiap menit. Saat jam:menit cocok dengan jadwal aktif & Auto Feed ON,
          device otomatis trigger feed adaptif. Toggle <em>enabled</em> per jadwal kalau mau skip salah satu hari ini saja.
        </div>
      </div>
    </>
  );
}

function ScheduleCard({ index, hour, minute, enabled, isActive, isEditing, isOffline, busy, onEdit, onCancel, onSave }) {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  const [en, setEn] = useState(enabled);

  useEffect(() => { setH(hour); setM(minute); setEn(enabled); }, [hour, minute, enabled, isEditing]);

  const inactive = !isActive;

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: inactive ? 'var(--bg-tertiary)' : (en ? 'var(--success-light)' : 'var(--bg-elevated)'),
      border: '2px solid ' + (inactive ? 'var(--border-primary)' : (en ? 'var(--success)' : 'var(--border-primary)')),
      opacity: inactive ? 0.55 : 1,
    }}>
      <div className="flex items-center justify-between mb-2">
        <div style={{ fontWeight: 700, fontSize: 13 }}>Jadwal {index + 1}</div>
        {inactive && <span className="badge badge-secondary">Nonaktif</span>}
      </div>

      {isEditing ? (
        <>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <input type="number" min="0" max="23" className="form-input"
              value={h} onChange={e => setH(+e.target.value)}
              style={{ width: 70, padding: '8px 10px', fontSize: 18, textAlign: 'center', fontWeight: 700 }} />
            <span style={{ fontSize: 22, fontWeight: 700 }}>:</span>
            <input type="number" min="0" max="59" step="5" className="form-input"
              value={m} onChange={e => setM(+e.target.value)}
              style={{ width: 70, padding: '8px 10px', fontSize: 18, textAlign: 'center', fontWeight: 700 }} />
          </div>
          <label className="flex items-center gap-2" style={{ marginBottom: 8, fontSize: 13 }}>
            <input type="checkbox" checked={en} onChange={e => setEn(e.target.checked)} />
            Aktifkan jadwal ini
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={() => onSave({ hour: h, minute: m, enabled: en })} disabled={busy}>
              <Save size={14} /> Simpan
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onCancel}>Batal</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)', marginBottom: 8 }}>
            {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
          </div>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <Power size={14} style={{ color: en ? 'var(--success)' : 'var(--text-tertiary)' }} />
            <span className="text-xs">{en ? 'Aktif' : 'Nonaktif'}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onEdit} disabled={isOffline || inactive} style={{ width: '100%' }}>
            ✏️ Edit
          </button>
        </>
      )}
    </div>
  );
}
