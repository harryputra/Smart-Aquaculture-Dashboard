import { useState } from 'react';
import {
  Wifi, WifiOff, Fish, Scale, ArrowUp, ArrowDown, Check, X,
  CheckCircle, XCircle, Settings as SettingsIcon, Smartphone,
} from 'lucide-react';
import { remoteButton } from '../../services/leleApi';

export default function StatusSistemPanel({ device, onAssign }) {
  const [pressing, setPressing] = useState(null);

  async function pressBtn(btn) {
    if (!device.is_online) return;
    setPressing(btn);
    try { await remoteButton(device.device_id, btn); }
    catch (e) { console.error(e); }
    setTimeout(() => setPressing(null), 300);
  }

  // Estimate LCD content dari current_screen
  const screen = device.current_screen || 'main_menu';
  const live = device.live_data || {};

  // LCD line content estimation
  let lcd1 = '', lcd2 = '';
  if (!device.is_online) { lcd1 = 'DEVICE OFFLINE'; lcd2 = ''; }
  else if (device.feeding_in_progress) { lcd1 = 'FEEDING...'; lcd2 = 'Tunggu selesai'; }
  else if (screen === 'main_menu') {
    lcd1 = 'MENU UTAMA';
    const menus = ['Status Sistem', 'Pakan Otomatis', 'Timbang Biomassa', 'Data Kolam',
                   'Jadwal Pakan', 'Kalibrasi/Tare', 'Riwayat Akhir', 'Pengaturan'];
    lcd2 = '>' + (menus[live.main_menu_index || device.main_menu_index || 0] || '');
  }
  else if (screen === 'status') {
    lcd1 = device.feeding_in_progress ? 'MODE: FEEDING' : 'MODE: STANDBY';
    lcd2 = 'Next: ' + (device.next_schedule_hhmm || '--');
  }
  else { lcd1 = screen.toUpperCase().replace(/_/g, ' '); lcd2 = ''; }

  return (
    <>
      {/* MIRROR LCD + D-PAD */}
      <div className="card mb-6" style={{ background: 'linear-gradient(135deg, #0f2438 0%, #1e3a5f 100%)', color: 'white', border: 'none' }}>
        <div className="flex items-start justify-between" style={{ flexWrap: 'wrap', gap: 24 }}>
          {/* LCD Display */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <div className="flex items-center gap-2 mb-2">
              <Smartphone size={14} style={{ opacity: 0.8 }} />
              <span className="text-xs" style={{ opacity: 0.8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                LCD 16×2 — Live Mirror
              </span>
            </div>

            <div style={{
              background: '#16335a', padding: '20px 24px', borderRadius: 8,
              fontFamily: "'JetBrains Mono', monospace",
              border: '2px solid #2a4d7a',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
            }}>
              <div style={{ fontSize: 22, color: '#7dd3fc', letterSpacing: '0.1em' }}>
                {(lcd1 || '').padEnd(16, ' ').slice(0, 16)}
              </div>
              <div style={{ fontSize: 22, color: '#7dd3fc', letterSpacing: '0.1em', marginTop: 4 }}>
                {(lcd2 || '').padEnd(16, ' ').slice(0, 16)}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <span className="pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: device.is_online ? '#86efac' : '#fca5a5' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>{device.is_online ? 'LIVE' : 'OFFLINE'}</span>
              <span className="text-xs" style={{ opacity: 0.7 }}>
                {device.last_seen ? new Date(device.last_seen).toLocaleTimeString('id-ID') : '-'}
              </span>
            </div>
          </div>

          {/* Virtual D-Pad */}
          <div>
            <div className="text-xs mb-2" style={{ opacity: 0.8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
              Tombol Virtual
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 60px', gridTemplateRows: '60px 60px 60px', gap: 8, justifyContent: 'center' }}>
              <div></div>
              <DPadButton icon={<ArrowUp size={22} />} active={pressing === 'up'} onClick={() => pressBtn('up')} disabled={!device.is_online} />
              <div></div>
              <DPadButton icon={<X size={20} />} active={pressing === 'back'} onClick={() => pressBtn('back')} disabled={!device.is_online} color="#ef4444" label="BACK" />
              <DPadButton icon={<Check size={22} />} active={pressing === 'ok'} onClick={() => pressBtn('ok')} disabled={!device.is_online} color="#10b981" label="OK" />
              <div></div>
              <div></div>
              <DPadButton icon={<ArrowDown size={22} />} active={pressing === 'down'} onClick={() => pressBtn('down')} disabled={!device.is_online} />
              <div></div>
            </div>
            <div className="text-xs text-center" style={{ opacity: 0.65, marginTop: 8 }}>
              Sama persis seperti tombol fisik
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: device.is_online ? '#d1fae5' : '#fee2e2', color: device.is_online ? '#047857' : '#b91c1c' }}>
            {device.is_online ? <Wifi size={22} /> : <WifiOff size={22} />}
          </div>
          <div className="stat-card-label">Status Device</div>
          <div className="stat-card-value" style={{ fontSize: 22 }}>{device.is_online ? 'Online' : 'Offline'}</div>
          <div className="stat-card-subtext">{device.last_seen ? new Date(device.last_seen).toLocaleTimeString('id-ID') : '-'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon"><Fish size={22} /></div>
          <div className="stat-card-label">Jumlah Ikan</div>
          <div className="stat-card-value">{device.fish_count || 0}</div>
          <div className="stat-card-subtext">Ekor lele</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><Scale size={22} /></div>
          <div className="stat-card-label">Avg Berat Ikan</div>
          <div className="stat-card-value">{device.avg_fish_g ? parseFloat(device.avg_fish_g).toFixed(1) : '0'}</div>
          <div className="stat-card-subtext">gram/ekor</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>⏰</div>
          <div className="stat-card-label">Jadwal Berikutnya</div>
          <div className="stat-card-value" style={{ fontSize: 22 }}>
            {device.next_schedule_hhmm || '--:--'}
          </div>
          <div className="stat-card-subtext">
            {device.seconds_to_next_feed > 0
              ? `dlm ${Math.floor(device.seconds_to_next_feed / 60)}m ${device.seconds_to_next_feed % 60}d`
              : 'Mundur'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Status Konektivitas & Hardware</div>
            <div className="card-subtitle">Real-time dari ESP32</div>
          </div>
          <button className="btn btn-secondary" onClick={onAssign}>
            <SettingsIcon size={16} /> Assign Kolam
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Indicator ok={device.wifi_connected} label="WiFi" />
          <Indicator ok={device.mqtt_connected} label="MQTT Broker" />
          <Indicator ok={device.rtc_ok} label="RTC DS3231" />
          <Indicator ok={device.hx_chamber_ok} label="HX711 Chamber" />
          <Indicator ok={device.hx_sampling_ok} label="HX711 Sampling" />
          <Indicator ok={device.auto_feed_enabled} label="Auto Feed" />
        </div>
      </div>
    </>
  );
}

function Indicator({ ok, label }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
      {ok ? <CheckCircle size={20} style={{ color: 'var(--success)' }} /> : <XCircle size={20} style={{ color: 'var(--danger)' }} />}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div className="text-xs text-muted">{ok ? 'OK' : 'Tidak terdeteksi'}</div>
      </div>
    </div>
  );
}

function DPadButton({ icon, onClick, active, disabled, color = '#06b6d4', label }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        width: 60, height: 60, borderRadius: '50%', border: 'none',
        background: disabled ? '#374151' : active ? color : 'rgba(255,255,255,0.1)',
        color: disabled ? '#6b7280' : 'white',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        boxShadow: active ? `0 0 24px ${color}80` : 'inset 0 -3px 0 rgba(0,0,0,0.3)',
        transition: 'all 0.15s',
        transform: active ? 'scale(0.92)' : 'scale(1)',
        fontWeight: 700, fontSize: 10,
      }}
    >
      {icon}
      {label && <span style={{ marginTop: 2 }}>{label}</span>}
    </button>
  );
}
