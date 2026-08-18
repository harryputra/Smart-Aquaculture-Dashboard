import { useState } from 'react';
import { Utensils, Waves } from 'lucide-react';
import MqttMonitorPanel from '../components/lele/MqttMonitorPanel';

// Halaman global: lalu lintas MQTT semua device (admin/debug), tab terpisah
// untuk sistem PAKAN (feeder) & KUALITAS AIR.
export default function MqttMonitor() {
  const [tab, setTab] = useState('lele');   // 'lele' = feeder | 'water' = kualitas air

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🛰️ MQTT Monitor</h1>
          <p className="page-subtitle">
            Pantau pesan masuk (dari hardware) & keluar (dari dashboard) secara real‑time —
            seperti serial monitor, untuk memeriksa interkoneksi tanpa membaca kode.
          </p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={'tab' + (tab === 'lele' ? ' active' : '')} onClick={() => setTab('lele')}>
          <Utensils size={16} /> Pakan (Feeder)
        </button>
        <button className={'tab' + (tab === 'water' ? ' active' : '')} onClick={() => setTab('water')}>
          <Waves size={16} /> Kualitas Air
        </button>
      </div>

      {/* key={tab} → remount saat pindah tab (reset konsol & polling ke sumber yang benar) */}
      <MqttMonitorPanel key={tab} deviceId={null} source={tab} />
    </div>
  );
}
