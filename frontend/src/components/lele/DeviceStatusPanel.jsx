import { Wifi, WifiOff, Fish, Clock, Scale, SettingsIcon, Activity, CheckCircle, XCircle } from 'lucide-react';

export default function DeviceStatusPanel({ device, onAssign }) {
  const Indicator = ({ ok, label }) => (
    <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
      {ok ? <CheckCircle size={20} style={{ color: 'var(--success)' }} /> : <XCircle size={20} style={{ color: 'var(--danger)' }} />}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div className="text-xs text-muted">{ok ? 'OK' : 'Tidak terdeteksi'}</div>
      </div>
    </div>
  );

  // Tentukan status sistem (untuk mirror tampilan LCD)
  let systemMode = 'STANDBY';
  let systemDetail = '';

  if (!device.is_online) {
    systemMode = 'OFFLINE';
    systemDetail = 'Device tidak terhubung';
  } else if (device.feeding_in_progress) {
    systemMode = 'AUTO FEED';
    systemDetail = `Screen: ${device.current_screen || '-'}`;
  } else if (device.seconds_to_next_feed >= 0) {
    const min = Math.floor(device.seconds_to_next_feed / 60);
    const sec = device.seconds_to_next_feed % 60;
    systemMode = 'STANDBY';
    systemDetail = `Next: ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  return (
    <>
      {/* Mirror LCD utama */}
      <div className="card mb-6" style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none' }}>
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="text-xs" style={{ opacity: 0.85, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Tampilan Sistem (Mirror LCD)
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4, fontFamily: "'Outfit', sans-serif" }}>
              {systemMode}
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>
              {systemDetail}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
              <span className="pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: device.is_online ? '#86efac' : '#fca5a5' }} />
              <span style={{ fontWeight: 700 }}>{device.is_online ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div className="text-xs" style={{ opacity: 0.8, marginTop: 4 }}>
              {device.last_seen ? new Date(device.last_seen).toLocaleString('id-ID') : '-'}
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
          <div className="stat-card-subtext">
            {device.last_seen ? new Date(device.last_seen).toLocaleTimeString('id-ID') : '-'}
          </div>
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
          <div className="stat-card-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}><Clock size={22} /></div>
          <div className="stat-card-label">Pakan Berikutnya</div>
          <div className="stat-card-value" style={{ fontSize: 22 }}>
            {device.seconds_to_next_feed >= 0
              ? `${Math.floor(device.seconds_to_next_feed / 60)}:${String(device.seconds_to_next_feed % 60).padStart(2, '0')}`
              : '--:--'}
          </div>
          <div className="stat-card-subtext">Mundur</div>
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

        <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontWeight: 600 }}>Kolam terkait:</span>
            <span>{device.pond_name || <em style={{ color: 'var(--text-tertiary)' }}>Belum di-assign</em>}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontWeight: 600 }}>Sample biomassa siap:</span>
            <span className={`badge ${device.sample_ready ? 'badge-success' : 'badge-neutral'}`}>
              {device.sample_ready ? '✅ Siap' : 'Belum di-sampling'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 600 }}>Sedang feeding:</span>
            <span className={`badge ${device.feeding_in_progress ? 'badge-warning' : 'badge-neutral'}`}>
              {device.feeding_in_progress ? 'Ya' : 'Tidak'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
