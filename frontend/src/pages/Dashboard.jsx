import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Fish, Droplets, Wifi, WifiOff, Skull, Bell, Utensils, TrendingUp, ChevronRight, MapPin,
} from 'lucide-react';
import { getDashboardSummary, getFarms, getPonds, getNotifications } from '../services/api';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [farms, setFarms] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [s, f, p, n] = await Promise.all([
          getDashboardSummary(),
          getFarms(),
          getPonds(),
          getNotifications({ limit: 5 }),
        ]);
        setSummary(s);
        setFarms(f);
        setPonds(p);
        setNotifications(n);
      } catch (e) { console.error(e); }
    }
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  if (!summary) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Ringkasan sistem peternakan ikan Anda</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon"><Fish size={22} /></div>
          <div className="stat-card-label">Total Peternakan</div>
          <div className="stat-card-value">{summary.total_farms}</div>
          <div className="stat-card-subtext">Peternakan terdaftar</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}><Droplets size={22} /></div>
          <div className="stat-card-label">Total Kolam</div>
          <div className="stat-card-value">{summary.total_ponds}</div>
          <div className="stat-card-subtext">Kolam aktif</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#d1fae5', color: '#047857' }}><Wifi size={22} /></div>
          <div className="stat-card-label">Device Online</div>
          <div className="stat-card-value">{summary.connected_devices}</div>
          <div className="stat-card-subtext">ESP32 tersambung</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}><Skull size={22} /></div>
          <div className="stat-card-label">Kematian (30 hari)</div>
          <div className="stat-card-value">{summary.deaths_30d}</div>
          <div className="stat-card-subtext">Ekor ikan</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><Bell size={22} /></div>
          <div className="stat-card-label">Notifikasi Baru</div>
          <div className="stat-card-value">{summary.unread_notifications}</div>
          <div className="stat-card-subtext">Belum dibaca</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#cffafe', color: '#0891b2' }}><Utensils size={22} /></div>
          <div className="stat-card-label">Pakan (24 jam)</div>
          <div className="stat-card-value">{summary.feedings_24h}</div>
          <div className="stat-card-subtext">Pemberian pakan</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Peternakan</div>
              <div className="card-subtitle">Daftar peternakan aktif</div>
            </div>
            <Link to="/farms" className="btn btn-secondary btn-sm">
              Lihat Semua <ChevronRight size={14} />
            </Link>
          </div>

          {farms.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Fish size={28} /></div>
              <h3>Belum ada peternakan</h3>
              <p>Tambahkan peternakan pertama Anda di menu Peternakan</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {farms.slice(0, 4).map(f => (
                <Link key={f.farm_id} to={`/farms/${f.farm_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
                       onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                       onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Fish size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{f.name}</div>
                      <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <MapPin size={11} /> {f.location || '-'}
                      </div>
                    </div>
                    <span className="badge badge-neutral">{f.pond_count} kolam</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Notifikasi Terbaru</div>
              <div className="card-subtitle">5 notifikasi terkini</div>
            </div>
            <Link to="/notifications" className="btn btn-secondary btn-sm">
              Lihat Semua <ChevronRight size={14} />
            </Link>
          </div>

          {notifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Bell size={28} /></div>
              <h3>Belum ada notifikasi</h3>
              <p>Notifikasi akan muncul saat ada peristiwa penting</p>
            </div>
          ) : (
            <div className="notification-list">
              {notifications.map(n => (
                <div key={n.id} className={`notification-item ${!n.is_read ? 'unread' : ''} ${n.type}`}>
                  <div className={`notification-icon ${n.type}`}>
                    <Bell size={16} />
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">{n.title}</div>
                    <div className="notification-message">{n.message}</div>
                    <div className="notification-time">{new Date(n.created_at).toLocaleString('id-ID')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
