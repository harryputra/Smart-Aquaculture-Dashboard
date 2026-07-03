import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets, Wifi, WifiOff, ArrowDownToLine, ArrowUpFromLine, Square, RefreshCw, Radio,
} from 'lucide-react';
import { getWaterDevices, controlValve, triggerDrainCycle } from '../services/api';
import { useCan } from '../context/AuthContext';

const PARAMS = [
  { key: 'temperature', label: 'Suhu', unit: '°C', dec: 1 },
  { key: 'dissolved_oxygen', label: 'DO', unit: 'mg/L', dec: 1 },
  { key: 'turbidity', label: 'Kekeruhan', unit: 'NTU', dec: 0 },
  { key: 'ph', label: 'pH', unit: '', dec: 1 },
  { key: 'depth', label: 'Kedalaman', unit: 'cm', dec: 0 },
];
const fdt = (d) => (d ? new Date(d).toLocaleTimeString('id-ID') : '-');

function evalParam(key, val, t) {
  if (val == null || !t) return 'ok';
  const n = Number(val);
  if (key === 'temperature') { if (n > t.temp_max) return 'bad'; if (n < t.temp_min) return 'warn'; }
  if (key === 'dissolved_oxygen') { if (n < t.do_min) return 'bad'; }
  if (key === 'turbidity') { if (n > t.turbidity_max) return 'bad'; }
  if (key === 'ph') { if (n < t.ph_min || n > t.ph_max) return 'warn'; }
  if (key === 'depth') { if (n < t.depth_min) return 'warn'; }
  return 'ok';
}
const COLOR = { ok: { bg: 'var(--bg-tertiary)', c: 'var(--text-primary)' }, warn: { bg: '#fef3c7', c: '#92400e' }, bad: { bg: '#fee2e2', c: '#b91c1c' } };

export default function WaterDevices() {
  const { canWrite } = useCan();
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState('');

  async function load() { try { setDevices(await getWaterDevices()); } catch (e) { /* */ } }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  async function valve(pondId, command) {
    setBusy(pondId + command);
    try { await controlValve(pondId, command); } catch (e) { alert('Gagal: ' + e.message); }
    finally { setTimeout(() => setBusy(''), 400); }
  }
  async function autoCycle(pondId) {
    if (!confirm('Jalankan siklus kuras → isi otomatis untuk kolam ini?')) return;
    try { await triggerDrainCycle(pondId); } catch (e) { alert('Gagal: ' + e.message); }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">💧 Perangkat Air</h1>
          <p className="page-subtitle">Monitoring kualitas air & kontrol kuras/isi per kolam (ESP32)</p></div>
      </div>

      {devices.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon"><Droplets size={32} /></div>
          <h3>Belum ada kolam</h3><p>Buat kolam di menu Peternakan, lalu hubungkan perangkat air (ESP32).</p></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
          {devices.map(d => {
            const online = !!d.is_connected;
            const latest = d.latest || {};
            const thr = d.threshold || null;
            return (
              <div key={d.pond_id} className="card" style={{ borderTop: `3px solid ${online ? 'var(--success)' : 'var(--border-primary)'}` }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div className="text-xs text-muted">{d.farm_name || '-'}</div>
                  </div>
                  <span className="badge" style={{ background: online ? '#d1fae5' : '#fee2e2', color: online ? '#047857' : '#b91c1c' }}>
                    {online ? <Wifi size={12} /> : <WifiOff size={12} />} {online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="text-xs text-muted" style={{ marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>Terlihat: {fdt(d.last_seen)}</span>
                  {d.ip_address && <span>IP: {d.ip_address}</span>}
                  {d.rssi != null && <span><Radio size={11} style={{ verticalAlign: '-1px' }} /> {d.rssi} dBm</span>}
                  {d.device_mode !== 'esp32' && <span className="badge badge-warning">Dummy</span>}
                </div>

                {/* Nilai parameter */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
                  {PARAMS.map(p => {
                    const v = latest[p.key];
                    const st = COLOR[evalParam(p.key, v, thr)];
                    return (
                      <div key={p.key} style={{ background: st.bg, color: st.c, borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, opacity: 0.8 }}>{p.label}</div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          {v != null ? Number(v).toFixed(p.dec) : '–'}<span style={{ fontSize: 9, opacity: 0.7 }}> {p.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Kontrol valve */}
                {canWrite ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button className="btn btn-sm btn-secondary" disabled={!online || !!busy} onClick={() => valve(d.pond_id, 'open_valve')}><ArrowDownToLine size={13} /> Buka Kuras</button>
                    <button className="btn btn-sm btn-secondary" disabled={!online || !!busy} onClick={() => valve(d.pond_id, 'close_valve')}><Square size={13} /> Tutup Kuras</button>
                    <button className="btn btn-sm btn-secondary" disabled={!online || !!busy} onClick={() => valve(d.pond_id, 'open_inlet')}><ArrowUpFromLine size={13} /> Buka Isi</button>
                    <button className="btn btn-sm btn-secondary" disabled={!online || !!busy} onClick={() => valve(d.pond_id, 'close_inlet')}><Square size={13} /> Tutup Isi</button>
                    <button className="btn btn-sm btn-primary" style={{ gridColumn: '1 / -1' }} disabled={!online} onClick={() => autoCycle(d.pond_id)}><RefreshCw size={13} /> Siklus Kuras–Isi Otomatis</button>
                  </div>
                ) : (
                  <div className="text-xs text-muted">Mode lihat — kontrol air hanya untuk operator.</div>
                )}
                <Link to={`/ponds/${d.pond_id}`} className="btn btn-sm btn-secondary" style={{ marginTop: 8, width: '100%' }}>Detail kolam</Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
