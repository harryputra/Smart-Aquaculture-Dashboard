import { useState } from 'react';
import { ExternalLink, RefreshCw, Maximize2, AlertCircle } from 'lucide-react';

export default function GrafanaView() {
  const [refreshKey, setRefreshKey] = useState(0);
  const grafanaUrl = '/grafana/d/aquaculture/smart-aquaculture-dashboard?orgId=1&refresh=5s&kiosk=tv';

  const handleFullscreen = () => {
    const iframe = document.getElementById('grafana-iframe');
    if (iframe?.requestFullscreen) iframe.requestFullscreen();
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Grafana Analytics</h1>
          <p className="page-subtitle">Dashboard analitik real-time dari InfluxDB</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={handleFullscreen}>
            <Maximize2 size={16} /> Layar Penuh
          </button>
          <button className="btn btn-primary" onClick={() => window.open('/grafana/', '_blank')}>
            <ExternalLink size={16} /> Buka di Tab Baru
          </button>
        </div>
      </div>

      <div className="alert alert-info">
        <AlertCircle size={18} />
        <div>
          <strong>Tips:</strong> Jika dashboard tidak muncul, pastikan Grafana sudah berjalan di port 3001.
          Login default: <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4 }}>admin / admin123</code>.
          Dashboard auto-refresh setiap 5 detik.
        </div>
      </div>

      <div className="grafana-container">
        <iframe
          id="grafana-iframe"
          key={refreshKey}
          src={grafanaUrl}
          title="Grafana Dashboard"
          className="grafana-iframe"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
