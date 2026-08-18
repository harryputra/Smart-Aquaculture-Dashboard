import { useEffect, useState } from 'react';
import { Cpu, Wifi, WifiOff, Link2Off, Save, Waves, ArrowUpCircle, Trash2 } from 'lucide-react';
import { getLeleDevices, assignLeleDevice } from '../services/leleApi';
import { getPonds, getWaterDeviceList, assignWaterDevice, deleteWaterDevice, triggerWaterOta } from '../services/api';

const fdt = (d) => (d ? new Date(d).toLocaleString('id-ID') : '-');

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [water, setWater] = useState([]);
  const [ponds, setPonds] = useState([]);

  async function load() {
    try {
      const [d, w, p] = await Promise.all([
        getLeleDevices().catch(() => []),
        getWaterDeviceList().catch(() => []),
        getPonds().catch(() => []),
      ]);
      setDevices(d); setWater(w); setPonds(p);
    } catch (e) { console.error(e); }
  }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  const unassigned = devices.filter(d => !d.pond_id).length + water.filter(d => !d.pond_id).length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">🔌 Perangkat (Hardware)</h1>
          <p className="page-subtitle">ESP32 auto‑muncul (ID dari MAC) begitu online — pasangkan ke kolam.</p></div>
      </div>

      {unassigned > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <Link2Off size={18} />
          <div><strong>{unassigned} perangkat belum di‑assign.</strong> Pasangkan ke kolam di bawah.</div>
        </div>
      )}

      {/* ---- FEEDER (pemberi pakan) ---- */}
      <SectionTitle icon={<Cpu size={18} />} title="Pemberi Pakan (Feeder)" count={devices.length} />
      {devices.length === 0 ? (
        <EmptyDevices what="feeder lele" />
      ) : (
        <div style={grid}>
          {devices.map(d => <DeviceCard key={d.device_id} device={d} ponds={ponds} onSaved={load} />)}
        </div>
      )}

      {/* ---- MONITORING & KONTROL AIR ---- */}
      <div style={{ marginTop: 28 }}>
        <SectionTitle icon={<Waves size={18} />} title="Monitoring & Kontrol Air" count={water.length} />
        {water.length === 0 ? (
          <EmptyDevices what="monitoring kualitas air" />
        ) : (
          <div style={grid}>
            {water.map(d => <WaterDeviceCard key={d.device_id} device={d} ponds={ponds} onSaved={load} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 };

function SectionTitle({ icon, title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 12px', fontWeight: 800, fontSize: 15 }}>
      {icon} {title} <span className="badge badge-neutral" style={{ fontWeight: 700 }}>{count}</span>
    </div>
  );
}

function EmptyDevices({ what }) {
  return (
    <div className="card"><div className="empty-state"><div className="empty-state-icon"><Cpu size={30} /></div>
      <h3>Belum ada perangkat {what}</h3>
      <p>ESP32 akan muncul otomatis begitu menyala & terhubung ke MQTT (ID dari MAC).</p></div></div>
  );
}

function OnlineBadge({ online }) {
  return (
    <span className="badge" style={{ background: online ? '#d1fae5' : '#fee2e2', color: online ? '#047857' : '#b91c1c' }}>
      {online ? <Wifi size={13} /> : <WifiOff size={13} />} {online ? 'ONLINE' : 'OFFLINE'}
    </span>
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
        <OnlineBadge online={device.is_online} />
      </div>
      <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
        Terakhir: {fdt(device.last_seen)}
        {device.pond_name ? <> · Kolam: <strong>{device.pond_name}</strong></> : <> · <span style={{ color: 'var(--warning)' }}>belum di‑assign</span></>}
      </div>
      <div className="form-group"><label className="form-label">Nama perangkat</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="mis. Feeder Kolam A1" /></div>
      <div className="form-group"><label className="form-label">Kolam</label>
        <select className="form-select" value={pondId} onChange={e => setPondId(e.target.value)}>
          <option value="">— Belum di‑assign —</option>
          {ponds.map(p => <option key={p.pond_id} value={p.pond_id}>{p.name} ({p.fish_type})</option>)}
        </select></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}><Save size={14} /> Simpan</button>
        {device.pond_id && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={unassign}><Link2Off size={14} /> Lepaskan</button>}
      </div>
    </div>
  );
}

function WaterDeviceCard({ device, ponds, onSaved }) {
  const [name, setName] = useState(device.name || '');
  const [pondId, setPondId] = useState(device.pond_id || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = (name !== (device.name || '')) || (pondId !== (device.pond_id || ''));

  async function save() {
    setBusy(true); setMsg('');
    try { await assignWaterDevice(device.device_id, pondId || null, name || null); onSaved(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function unassign() {
    if (!confirm('Lepaskan perangkat air ini dari kolam?')) return;
    setBusy(true); setMsg('');
    try { await assignWaterDevice(device.device_id, null, name || null); setPondId(''); onSaved(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function ota() {
    if (!confirm('Kirim update firmware (OTA) ke perangkat air ini? Perangkat harus online & firmware air terbaru sudah diunggah.')) return;
    setBusy(true); setMsg('');
    try { const r = await triggerWaterOta(device.device_id); setMsg(`OTA v${r.manifest.version} dikirim.`); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm('Hapus perangkat air ini dari daftar? (akan muncul lagi bila masih mengirim data)')) return;
    setBusy(true);
    try { await deleteWaterDevice(device.device_id); onSaved(); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ border: device.pond_id ? undefined : '2px solid var(--warning)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{device.device_id}</div>
        <OnlineBadge online={device.is_online} />
      </div>
      <div className="text-xs text-muted" style={{ marginBottom: 10 }}>
        Terakhir: {fdt(device.last_seen)}
        {device.firmware_version ? <> · fw <strong>{device.firmware_version}</strong></> : null}
        {device.pond_name ? <> · Kolam: <strong>{device.pond_name}</strong></> : <> · <span style={{ color: 'var(--warning)' }}>belum di‑assign</span></>}
      </div>
      <div className="form-group"><label className="form-label">Nama perangkat</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="mis. Sensor Air Kolam C1" /></div>
      <div className="form-group"><label className="form-label">Kolam</label>
        <select className="form-select" value={pondId} onChange={e => setPondId(e.target.value)}>
          <option value="">— Belum di‑assign —</option>
          {ponds.map(p => <option key={p.pond_id} value={p.pond_id}>{p.name} ({p.fish_type})</option>)}
        </select></div>
      {msg && <div className="text-xs" style={{ marginBottom: 8, color: 'var(--accent-primary)', fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}><Save size={14} /> Simpan</button>
        {device.pond_id && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={unassign}><Link2Off size={14} /> Lepaskan</button>}
        <button className="btn btn-secondary btn-sm" disabled={busy || !device.is_online} title="Kirim update firmware" onClick={ota}><ArrowUpCircle size={14} /> OTA</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} title="Hapus dari daftar" onClick={del} style={{ marginLeft: 'auto' }}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
