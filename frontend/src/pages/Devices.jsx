import { useEffect, useState } from 'react';
import { Cpu, Wifi, WifiOff, Link2, Link2Off, Save } from 'lucide-react';
import { getLeleDevices, assignLeleDevice } from '../services/leleApi';
import { getPonds } from '../services/api';

const fdt = (d) => (d ? new Date(d).toLocaleString('id-ID') : '-');

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [ponds, setPonds] = useState([]);

  async function load() {
    try {
      const [d, p] = await Promise.all([getLeleDevices(), getPonds()]);
      setDevices(d); setPonds(p);
    } catch (e) { console.error(e); }
  }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  const unassigned = devices.filter(d => !d.pond_id);

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">🔌 Perangkat (Hardware)</h1>
          <p className="page-subtitle">Daftar ESP32 yang terhubung & pasangkan ke kolam</p></div>
      </div>

      {devices.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon"><Cpu size={32} /></div>
          <h3>Belum ada perangkat terdeteksi</h3>
          <p>ESP32 akan otomatis muncul di sini begitu menyala & terhubung ke MQTT (ID otomatis dari MAC).</p></div></div>
      ) : (
        <>
          {unassigned.length > 0 && (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <Link2Off size={18} />
              <div><strong>{unassigned.length} perangkat belum di-assign.</strong> Pasangkan ke kolam di bawah, atau saat membuat kolam baru.</div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
            {devices.map(d => <DeviceCard key={d.device_id} device={d} ponds={ponds} onSaved={load} />)}
          </div>
        </>
      )}
    </div>
  );
}

function DeviceCard({ device, ponds, onSaved }) {
  const [name, setName] = useState(device.name || '');
  const [pondId, setPondId] = useState(device.pond_id || '');
  const [busy, setBusy] = useState(false);
  const dirty = (name !== (device.name || '')) || (pondId !== (device.pond_id || ''));

  async function save() {
    setBusy(true);
    try { await assignLeleDevice(device.device_id, pondId || null, name || null); onSaved(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function unassign() {
    if (!confirm('Lepaskan perangkat ini dari kolam?')) return;
    setBusy(true);
    try { await assignLeleDevice(device.device_id, null, name || null); setPondId(''); onSaved(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ border: device.pond_id ? undefined : '2px solid var(--warning)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{device.device_id}</div>
        <span className="badge" style={{ background: device.is_online ? '#d1fae5' : '#fee2e2', color: device.is_online ? '#047857' : '#b91c1c' }}>
          {device.is_online ? <Wifi size={13} /> : <WifiOff size={13} />} {device.is_online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
      <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
        Terakhir terlihat: {fdt(device.last_seen)}
        {device.pond_name ? <> · Kolam: <strong>{device.pond_name}</strong></> : <> · <span style={{ color: 'var(--warning)' }}>belum di-assign</span></>}
      </div>

      <div className="form-group"><label className="form-label">Nama perangkat</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="mis. Feeder Kolam A1" /></div>
      <div className="form-group"><label className="form-label">Kolam</label>
        <select className="form-select" value={pondId} onChange={e => setPondId(e.target.value)}>
          <option value="">— Belum di-assign —</option>
          {ponds.map(p => <option key={p.pond_id} value={p.pond_id}>{p.name} ({p.fish_type})</option>)}
        </select></div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}><Save size={14} /> Simpan</button>
        {device.pond_id && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={unassign}><Link2Off size={14} /> Lepaskan</button>}
      </div>
    </div>
  );
}
