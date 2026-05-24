import { Lock, Settings as SettingsIcon, AlertTriangle, Info, Cpu } from 'lucide-react';

export default function SystemSettingsPanel({ device, onAssign }) {
  return (
    <>
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">ℹ️ Informasi Device</div>
            <div className="card-subtitle">Detail device & pengaturan dasar</div>
          </div>
          <button className="btn btn-secondary" onClick={onAssign}>
            <SettingsIcon size={16} /> Edit Assignment
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <td style={{ width: '40%', fontWeight: 600 }}>Device ID</td>
                <td><code style={{ background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: 4 }}>{device.device_id}</code></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Nama Device</td>
                <td>{device.name || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Kolam Terkait</td>
                <td>
                  {device.pond_name || <em style={{ color: 'var(--text-tertiary)' }}>Belum di-assign</em>}
                  {device.fish_type && <span className="badge badge-neutral" style={{ marginLeft: 8 }}>{device.fish_type}</span>}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Status Online</td>
                <td>
                  <span className={`badge ${device.is_online ? 'badge-success' : 'badge-danger'}`}>
                    {device.is_online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Status WiFi</td>
                <td>
                  <span className={`badge ${device.wifi_connected ? 'badge-success' : 'badge-danger'}`}>
                    {device.wifi_connected ? 'Terhubung' : 'Tidak'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Status MQTT</td>
                <td>
                  <span className={`badge ${device.mqtt_connected ? 'badge-success' : 'badge-danger'}`}>
                    {device.mqtt_connected ? 'Terhubung' : 'Tidak'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Status RTC</td>
                <td>
                  <span className={`badge ${device.rtc_ok ? 'badge-success' : 'badge-danger'}`}>
                    {device.rtc_ok ? 'OK' : 'ERROR'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Auto Feed</td>
                <td>
                  <span className={`badge ${device.auto_feed_enabled ? 'badge-success' : 'badge-neutral'}`}>
                    {device.auto_feed_enabled ? 'AKTIF' : 'NONAKTIF'}
                  </span>
                  <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                    (Ubah di tab Pakan Otomatis)
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>RTC Interval</td>
                <td>{device.rtc_interval_min || 0} menit</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Last Seen</td>
                <td>{device.last_seen ? new Date(device.last_seen).toLocaleString('id-ID') : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Technician Mode Warning */}
      <div className="card mb-6" style={{ borderColor: 'var(--warning)', background: 'linear-gradient(135deg, #fef3c7, #fff)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--warning-light)', color: 'var(--warning-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={24} />
          </div>
          <div>
            <div className="card-title">🔒 Technician Mode</div>
            <div className="card-subtitle">Fitur berisiko disembunyikan dari operator umum</div>
          </div>
        </div>

        <p style={{ marginBottom: 14, color: 'var(--text-secondary)' }}>
          Beberapa fitur dapat menyebabkan kerusakan atau hasil tidak akurat jika digunakan tidak benar.
          Akses hanya tersedia di <strong>Technician Mode</strong> (kombinasi tombol khusus saat booting device).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {[
            { name: 'Mode Test (100g / 300g)', desc: 'Test feeding fixed amount' },
            { name: 'Factory Reset', desc: 'Hapus semua pengaturan' },
            { name: 'Actuator Manual Test', desc: 'Servo, stepper, spinner manual' },
            { name: 'Kalibrasi Faktor HX711', desc: 'Ubah calibration factor' },
            { name: 'Set RTC Interval Test', desc: 'Interval 5 menit untuk debugging' },
          ].map(f => (
            <div key={f.name} style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
              <div className="flex items-center gap-2 mb-2">
                <Lock size={14} style={{ color: 'var(--warning-dark)' }} />
                <strong style={{ fontSize: 13 }}>{f.name}</strong>
              </div>
              <div className="text-xs text-muted">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="alert alert-info">
        <Info size={18} />
        <div>
          <strong>Catatan Versi:</strong> dashboard ini menjadi tempat utama untuk monitoring, history, grafik, dan analisis.
          LCD device hanya untuk kontrol lokal yang ringkas. Untuk data lengkap dan trend grafik, gunakan dashboard ini atau buka panel Grafana di menu Analytics.
        </div>
      </div>
    </>
  );
}
