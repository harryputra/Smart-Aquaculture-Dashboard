import MqttMonitorPanel from '../components/lele/MqttMonitorPanel';

// Halaman global: lalu lintas MQTT semua device lele (gaya admin/debug).
export default function MqttMonitor() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🛰️ MQTT Monitor</h1>
          <p className="page-subtitle">
            Pantau semua pesan masuk (dari hardware) & keluar (dari dashboard) secara real-time —
            seperti serial monitor, untuk memeriksa interkoneksi tanpa membaca kode.
          </p>
        </div>
      </div>
      <MqttMonitorPanel deviceId={null} />
    </div>
  );
}
