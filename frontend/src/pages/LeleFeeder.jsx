import { useEffect, useState } from 'react';
import {
  Cpu, Activity, Utensils, Scale, Database, Clock,
  Settings as SettingsIcon, History, Sliders, X,
  Wifi, WifiOff, FlaskConical, Radio, Terminal,
} from 'lucide-react';
import { getLeleDevices, assignLeleDevice } from '../services/leleApi';
import { getPonds } from '../services/api';

import StatusSistemPanel    from '../components/lele/StatusSistemPanel';
import PakanOtomatisPanel   from '../components/lele/PakanOtomatisPanel';
import TimbangBiomassaPanel from '../components/lele/TimbangBiomassaPanel';
import DataKolamPanel       from '../components/lele/DataKolamPanel';
import JadwalPakanPanel     from '../components/lele/JadwalPakanPanel';
import KalibrasiTarePanel   from '../components/lele/KalibrasiTarePanel';
import RiwayatAkhirPanel    from '../components/lele/RiwayatAkhirPanel';
import PengaturanPanel      from '../components/lele/PengaturanPanel';
import ManualModePanel      from '../components/lele/ManualModePanel';
import MqttMonitorPanel     from '../components/lele/MqttMonitorPanel';

const PANELS = [
  { id: 'status',    label: 'Status Sistem',    icon: Activity },
  { id: 'feeding',   label: 'Pakan Otomatis',   icon: Utensils },
  { id: 'biomass',   label: 'Timbang Biomassa', icon: Scale },
  { id: 'pond',      label: 'Data Kolam',       icon: Database },
  { id: 'schedule',  label: 'Jadwal Pakan',     icon: Clock },
  { id: 'tare',      label: 'Kalibrasi/Tare',   icon: Sliders },
  { id: 'history',   label: 'Riwayat Akhir',    icon: History },
  { id: 'monitor',   label: 'Diagnostik',       icon: Terminal },
  { id: 'settings',  label: 'Pengaturan',       icon: SettingsIcon },
];

export default function LeleFeeder() {
  const [mode, setMode] = useState('esp');       // 'esp' | 'manual'
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('status');
  const [showAssign, setShowAssign] = useState(false);

  async function load() {
    try {
      const r = await getLeleDevices();
      setDevices(r);
      if (r.length && !selected) setSelected(r[0].device_id);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const device = devices.find(d => d.device_id === selected);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🐟 Pakan Lele Otomatis</h1>
          <p className="page-subtitle">
            {mode === 'esp'
              ? 'Mode Live — terhubung ke ESP32 via MQTT'
              : 'Mode Manual — tanpa ESP32, input manual'}
          </p>
        </div>
      </div>

      {/* MODE SWITCHER */}
      <div className="card mb-6" style={{ padding: '12px 20px' }}>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>Mode Operasi:</span>
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 10, padding: 4, gap: 4 }}>
            <ModeBtn
              active={mode === 'esp'}
              icon={<Radio size={16} />}
              label="Mode Live (ESP32)"
              desc="Kontrol hardware langsung"
              color="#06b6d4"
              onClick={() => { setMode('esp'); setTab('status'); }}
            />
            <ModeBtn
              active={mode === 'manual'}
              icon={<FlaskConical size={16} />}
              label="Mode Manual"
              desc="Input tanpa hardware"
              color="#8b5cf6"
              onClick={() => { setMode('manual'); setTab('manual'); }}
            />
          </div>

          {mode === 'esp' && (
            <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
              {devices.filter(d => d.is_online).length > 0
                ? <><Wifi size={16} style={{ color: 'var(--success)' }} /><span className="text-xs" style={{ color: 'var(--success)', fontWeight: 600 }}>{devices.filter(d => d.is_online).length} device online</span></>
                : <><WifiOff size={16} style={{ color: 'var(--danger)' }} /><span className="text-xs" style={{ color: 'var(--danger)', fontWeight: 600 }}>Tidak ada device online</span></>
              }
            </div>
          )}
        </div>
      </div>

      {/* ===================== MODE MANUAL ===================== */}
      {mode === 'manual' && (
        <ManualModePanel />
      )}

      {/* ===================== MODE ESP32 ===================== */}
      {mode === 'esp' && (
        <>
          {devices.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon"><Cpu size={32} /></div>
                <h3>Belum ada device terdeteksi</h3>
                <p>ESP32 akan otomatis muncul saat firmware V3.2 berjalan &amp; terhubung ke MQTT</p>
                <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-tertiary)', borderRadius: 10, fontSize: 13, textAlign: 'left', maxWidth: 400 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Checklist:</div>
                  <div>☐ WIFI_SSID &amp; WIFI_PASSWORD sudah diisi di firmware</div>
                  <div>☐ ESP32 dan laptop di WiFi yang sama</div>
                  <div>☐ MQTT_SERVER = <code>192.168.100.91</code></div>
                  <div>☐ Firewall Windows port 1883 sudah dibuka</div>
                  <div>☐ Docker containers semua running</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-secondary" onClick={() => setMode('manual')}>
                    <FlaskConical size={16} /> Pakai Mode Manual dulu
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Device selector */}
              <div className="card mb-6">
                <div className="card-header">
                  <div>
                    <div className="card-title">Pilih Device</div>
                    <div className="card-subtitle">{devices.length} device terdaftar</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                  {devices.map(d => (
                    <div key={d.device_id}
                      onClick={() => setSelected(d.device_id)}
                      style={{
                        padding: 14, borderRadius: 12, cursor: 'pointer',
                        border: '2px solid ' + (selected === d.device_id ? 'var(--accent-primary)' : 'var(--border-primary)'),
                        background: selected === d.device_id ? 'var(--accent-light)' : 'var(--bg-secondary)',
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        <div style={{ fontWeight: 700 }}>{d.name || d.device_id}</div>
                        <span className={`mode-indicator ${d.is_online ? 'live' : 'dummy'}`}>
                          <span className="pulse" />
                          {d.is_online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                      <div className="text-xs text-muted">ID: {d.device_id}</div>
                      <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                        Kolam: {d.pond_name || '— belum di-assign —'}
                      </div>
                      {!d.is_online && d.last_seen && (
                        <div className="text-xs" style={{ marginTop: 4, color: 'var(--warning)' }}>
                          Terakhir: {new Date(d.last_seen).toLocaleString('id-ID')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {device && (
                <>
                  {/* Offline warning */}
                  {!device.is_online && (
                    <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                      <WifiOff size={18} />
                      <div>
                        <strong>Device sedang OFFLINE.</strong> Dashboard menampilkan data terakhir yang tersimpan.
                        Tombol kontrol tidak akan bekerja sampai ESP32 terhubung kembali.
                        <button className="btn btn-secondary btn-sm" onClick={() => setMode('manual')} style={{ marginLeft: 12 }}>
                          Pakai Mode Manual
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab navigation */}
                  <div className="tabs" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
                    {PANELS.map(p => {
                      const Icon = p.icon;
                      return (
                        <button key={p.id}
                          className={'tab' + (tab === p.id ? ' active' : '')}
                          onClick={() => setTab(p.id)}>
                          <Icon size={16} /> {p.label}
                        </button>
                      );
                    })}
                  </div>

                  {tab === 'status'    && <StatusSistemPanel device={device} onAssign={() => setShowAssign(true)} />}
                  {tab === 'feeding'   && <PakanOtomatisPanel device={device} />}
                  {tab === 'biomass'   && <TimbangBiomassaPanel device={device} />}
                  {tab === 'pond'      && <DataKolamPanel device={device} />}
                  {tab === 'schedule'  && <JadwalPakanPanel device={device} />}
                  {tab === 'tare'      && <KalibrasiTarePanel device={device} />}
                  {tab === 'history'   && <RiwayatAkhirPanel device={device} />}
                  {tab === 'monitor'   && <MqttMonitorPanel deviceId={device.device_id} device={device} />}
                  {tab === 'settings'  && <PengaturanPanel device={device} onAssign={() => setShowAssign(true)} />}
                </>
              )}
            </>
          )}
        </>
      )}

      {showAssign && device && (
        <AssignModal device={device} onClose={() => { setShowAssign(false); load(); }} />
      )}
    </div>
  );
}

function ModeBtn({ active, icon, label, desc, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: active ? color : 'transparent',
      color: active ? 'white' : 'var(--text-secondary)',
      display: 'flex', alignItems: 'center', gap: 8,
      transition: 'all 0.2s', fontWeight: active ? 700 : 400,
      boxShadow: active ? `0 2px 12px ${color}60` : 'none',
    }}>
      {icon}
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 13, fontWeight: active ? 700 : 600 }}>{label}</div>
        <div style={{ fontSize: 11, opacity: active ? 0.85 : 0.6 }}>{desc}</div>
      </div>
    </button>
  );
}

function AssignModal({ device, onClose }) {
  const [ponds, setPonds] = useState([]);
  const [pondId, setPondId] = useState(device.pond_id || '');
  const [name, setName] = useState(device.name || '');

  useEffect(() => { getPonds().then(setPonds).catch(() => {}); }, []);

  async function save(e) {
    e.preventDefault();
    try {
      await assignLeleDevice(device.device_id, pondId || null, name);
      onClose();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Assign Device ke Kolam</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Device ID</label>
            <input className="form-input" value={device.device_id} disabled />
          </div>
          <div className="form-group">
            <label className="form-label">Nama Device</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Contoh: Pakan Lele Kolam A1" />
          </div>
          <div className="form-group">
            <label className="form-label">Kolam Target</label>
            <select className="form-select" value={pondId} onChange={e => setPondId(e.target.value)}>
              <option value="">— Tidak di-assign —</option>
              {ponds.map(p => <option key={p.pond_id} value={p.pond_id}>{p.name} ({p.fish_type})</option>)}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary">Simpan</button>
          </div>
        </form>
      </div>
    </div>
  );
}
