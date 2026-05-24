import { Wifi, Clock, Cpu, AlertTriangle, CheckCircle, XCircle, Settings as SettingsIcon, Info } from 'lucide-react';

export default function PengaturanPanel({ device, onAssign }) {
  return (
    <>
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">⚙️ Info Device</div>
            <div className="card-subtitle">LCD: Pengaturan → WiFi / RTC / Device Info</div>
          </div>
          <button className="btn btn-primary" onClick={onAssign}>
            <SettingsIcon size={16} /> Assign Kolam
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {/* WiFi Status */}
          <div style={{ padding: 16, background: device.wifi_connected ? 'var(--success-light)' : 'var(--danger-light)',
                        borderRadius: 12, border: '2px solid ' + (device.wifi_connected ? 'var(--success)' : 'var(--danger)') }}>
            <div className="flex items-center gap-2 mb-3">
              <Wifi size={20} />
              <strong>WiFi</strong>
              {device.wifi_connected ?
                <CheckCircle size={16} style={{ marginLeft: 'auto', color: 'var(--success)' }} /> :
                <XCircle size={16} style={{ marginLeft: 'auto', color: 'var(--danger)' }} />}
            </div>
            <div className="text-xs">SSID: <strong>PAKAN_TEST</strong></div>
            <div className="text-xs">Status: {device.wifi_connected ? 'Connected' : 'Disconnected'}</div>
          </div>

          {/* MQTT Status */}
          <div style={{ padding: 16, background: device.mqtt_connected ? 'var(--success-light)' : 'var(--danger-light)',
                        borderRadius: 12, border: '2px solid ' + (device.mqtt_connected ? 'var(--success)' : 'var(--danger)') }}>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: 20 }}>📡</span>
              <strong>MQTT</strong>
              {device.mqtt_connected ?
                <CheckCircle size={16} style={{ marginLeft: 'auto', color: 'var(--success)' }} /> :
                <XCircle size={16} style={{ marginLeft: 'auto', color: 'var(--danger)' }} />}
            </div>
            <div className="text-xs">Broker: <strong>192.168.137.1:1883</strong></div>
            <div className="text-xs">Status: {device.mqtt_connected ? 'Subscribed' : 'Disconnected'}</div>
          </div>

          {/* RTC Status */}
          <div style={{ padding: 16, background: device.rtc_ok ? 'var(--success-light)' : 'var(--danger-light)',
                        borderRadius: 12, border: '2px solid ' + (device.rtc_ok ? 'var(--success)' : 'var(--danger)') }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={20} />
              <strong>RTC DS3231</strong>
              {device.rtc_ok ?
                <CheckCircle size={16} style={{ marginLeft: 'auto', color: 'var(--success)' }} /> :
                <XCircle size={16} style={{ marginLeft: 'auto', color: 'var(--danger)' }} />}
            </div>
            <div className="text-xs">Status: {device.rtc_ok ? 'OK' : 'Error'}</div>
            <div className="text-xs">Next feed: <strong>{device.next_schedule_hhmm || '--'}</strong></div>
          </div>

          {/* Device Info */}
          <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={20} />
              <strong>Device Info</strong>
            </div>
            <div className="text-xs">Device ID: <strong>{device.device_id}</strong></div>
            <div className="text-xs">Firmware: <strong>V3.2 Hybrid</strong></div>
            <div className="text-xs">MCU: ESP32 + LCD I2C 16×2</div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">🔗 Assignment</div>
            <div className="card-subtitle">Hubungkan device ke kolam di sistem</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
            <div className="text-xs text-muted">Nama Device</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{device.name || '— belum diset —'}</div>
          </div>
          <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
            <div className="text-xs text-muted">Kolam Target</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{device.pond_name || '— belum di-assign —'}</div>
            {device.fish_type && <div className="text-xs text-muted">{device.fish_type}</div>}
          </div>
        </div>
      </div>

      <div className="alert alert-info">
        <Info size={18} />
        <div className="text-xs">
          <strong>Catatan:</strong> setting yang sifatnya sensitif (cal factor load cell, range gram min/max,
          parameter timing batch) dikunci di firmware. Edit langsung di file <code>esp32_pakan_lele_v3_2.ino</code> jika
          perlu, lalu upload ulang ke ESP32.
        </div>
      </div>

      <div className="alert alert-warning" style={{ marginTop: 12 }}>
        <AlertTriangle size={18} />
        <div className="text-xs">
          <strong>Mode Hybrid (V3.2):</strong> Setting tersimpan di Preferences device — TIDAK HILANG saat restart atau
          WiFi offline. Dashboard hanya mirror & remote control. Jadi device tetap autonomous.
        </div>
      </div>
    </>
  );
}
