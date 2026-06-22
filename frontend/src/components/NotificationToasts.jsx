import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';
import { getNotifications } from '../services/api';

const ICONS = {
  critical: AlertOctagon,
  risk: AlertTriangle,
  success: CheckCircle,
  info: Info,
};

const POLL_MS = 7000;
const AUTO_DISMISS_MS = 7000;
const MAX_VISIBLE = 4;

export default function NotificationToasts() {
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());
  const firstLoad = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const list = await getNotifications({ limit: 10 });
        if (!active || !Array.isArray(list)) return;

        if (firstLoad.current) {
          // Saat pertama load, catat semua notif yang sudah ada TANPA bikin popup
          // (biar gak langsung flood saat buka dashboard)
          list.forEach(n => seenIds.current.add(n.id));
          firstLoad.current = false;
          return;
        }

        const fresh = list.filter(n => !seenIds.current.has(n.id));
        if (fresh.length === 0) return;

        fresh.forEach(n => seenIds.current.add(n.id));
        setToasts(prev => [...fresh.reverse(), ...prev].slice(0, MAX_VISIBLE));
      } catch (e) { /* silent, jangan ganggu UI kalau API gagal */ }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  function dismiss(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  function handleClick(n) {
    dismiss(n.id);
    navigate('/notifications');
  }

  return (
    <div className="toast-stack">
      {toasts.map(n => (
        <ToastItem key={n.id} notif={n} onClose={() => dismiss(n.id)} onClick={() => handleClick(n)} />
      ))}
    </div>
  );
}

function ToastItem({ notif, onClose, onClick }) {
  useEffect(() => {
    const t = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, []);

  const Icon = ICONS[notif.type] || Info;

  return (
    <div className={`toast-item ${notif.type || 'info'}`} onClick={onClick}>
      <div className={`toast-icon ${notif.type || 'info'}`}>
        <Icon size={18} />
      </div>
      <div className="toast-content">
        <div className="toast-title">{notif.title}</div>
        <div className="toast-message">{notif.message}</div>
        {notif.pond_name && <div className="toast-meta">{notif.pond_name}</div>}
      </div>
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Tutup">
        <X size={14} />
      </button>
    </div>
  );
}
