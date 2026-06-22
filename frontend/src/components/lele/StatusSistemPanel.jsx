import {
  Wifi, WifiOff, Fish, Scale, CheckCircle, XCircle,
  Settings as SettingsIcon, Gauge,
} from 'lucide-react';

export default function StatusSistemPanel({ device, onAssign }) {
  return (
    <>
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
          <div className="stat-card-subtext">
            gram/ekor {device.sample_is_manual ? '(input manual)' : ''}
          </div>
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

        {device.spinner_pwm != null && device.feeding_in_progress && (
          <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-elevated)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Gauge size={18} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Kecepatan Spinner (live)</div>
              <div className="text-xs text-muted">PWM duty: {device.spinner_pwm} / 255 ({Math.round((device.spinner_pwm / 255) * 100)}%)</div>
            </div>
          </div>
        )}
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
