import { useEffect, useState } from 'react';
import {
  Bell, CheckCheck, AlertTriangle, AlertCircle, Info, CheckCircle,
} from 'lucide-react';
import { getNotifications, markNotificationRead, markAllRead } from '../services/api';

const ICONS = {
  critical: AlertTriangle,
  risk: AlertCircle,
  info: Info,
  success: CheckCircle,
};

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const params = filter === 'unread' ? { unread_only: 'true', limit: 100 } : { limit: 100 };
      const r = await getNotifications(params);
      setItems(r);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function markRead(id) {
    try { await markNotificationRead(id); load(); } catch (e) { /* */ }
  }

  async function markAll() {
    try { await markAllRead(); load(); } catch (e) { /* */ }
  }

  const filteredItems = filter === 'all' ? items :
                        filter === 'unread' ? items :
                        items.filter(i => i.type === filter);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifikasi</h1>
          <p className="page-subtitle">Riwayat peringatan dan aktivitas sistem</p>
        </div>
        <button className="btn btn-secondary" onClick={markAll}>
          <CheckCheck size={16} /> Tandai Semua Dibaca
        </button>
      </div>

      <div className="tabs">
        <button className={'tab' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
          Semua
        </button>
        <button className={'tab' + (filter === 'unread' ? ' active' : '')} onClick={() => setFilter('unread')}>
          Belum Dibaca
        </button>
        <button className={'tab' + (filter === 'critical' ? ' active' : '')} onClick={() => setFilter('critical')}>
          🚨 Kritis
        </button>
        <button className={'tab' + (filter === 'risk' ? ' active' : '')} onClick={() => setFilter('risk')}>
          ⚠️ Risiko
        </button>
        <button className={'tab' + (filter === 'info' ? ' active' : '')} onClick={() => setFilter('info')}>
          ℹ️ Info
        </button>
        <button className={'tab' + (filter === 'success' ? ' active' : '')} onClick={() => setFilter('success')}>
          ✅ Sukses
        </button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : filteredItems.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Bell size={32} /></div>
            <h3>Tidak ada notifikasi</h3>
            <p>Notifikasi akan muncul saat ada peristiwa penting</p>
          </div>
        </div>
      ) : (
        <div className="notification-list">
          {filteredItems.map(n => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <div
                key={n.id}
                className={`notification-item ${!n.is_read ? 'unread' : ''} ${n.type}`}
                onClick={() => !n.is_read && markRead(n.id)}
              >
                <div className={`notification-icon ${n.type}`}>
                  <Icon size={18} />
                </div>
                <div className="notification-content">
                  <div className="flex items-center gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
                    <span className="notification-title">{n.title}</span>
                    {n.pond_name && <span className="badge badge-neutral">{n.pond_name}</span>}
                    {!n.is_read && <span className="badge badge-info">Baru</span>}
                    {n.action_taken && n.action_taken !== 'none' && (
                      <span className="badge badge-success">
                        Aksi: {n.action_taken.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="notification-message">{n.message}</div>
                  <div className="notification-time">{new Date(n.created_at).toLocaleString('id-ID')}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
