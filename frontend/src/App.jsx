import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import {
  Home, Fish, Activity, BarChart3, Bell, Waves,
  Skull, Utensils, Settings, LayoutGrid, Cpu, Menu, X, Radio, Wrench, Plug, LogOut,
  Users as UsersIcon, ArrowUpCircle, MessageCircle,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Farms from './pages/Farms';
import FarmDetail from './pages/FarmDetail';
import PondDetail from './pages/PondDetail';
import Simulation from './pages/Simulation';
import GrafanaView from './pages/GrafanaView';
import Notifications from './pages/Notifications';
import LeleFeeder from './pages/LeleFeeder';
import MqttMonitor from './pages/MqttMonitor';
import HardwareTest from './pages/HardwareTest';
import Devices from './pages/Devices';
import Firmware from './pages/Firmware';
import WaterDevices from './pages/WaterDevices';
import WhatsApp from './pages/WhatsApp';
import ComparePonds from './pages/ComparePonds';
import Login from './pages/Login';
import QuickLogin from './pages/QuickLogin';
import Users from './pages/Users';
import NotificationToasts from './components/NotificationToasts';
import { getUnreadCount } from './services/api';
import { useAuth, useCan, ROLE_LABEL } from './context/AuthContext';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="loading" style={{ minHeight: '100vh' }}><div className="spinner" /></div>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/q/:token" element={<QuickLogin />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return <Shell />;
}

function Shell() {
  const { user, logout } = useAuth();
  const { canManageUsers } = useCan();
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await getUnreadCount();
        if (active) setUnreadCount(r.count);
      } catch (e) { /* ignore */ }
    }
    load();
    const id = setInterval(load, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Tutup sidebar otomatis tiap pindah halaman (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="app-layout">
      <NotificationToasts />
      {/* Top bar hanya tampil di mobile */}
      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">
          <Menu size={22} />
        </button>
        <Link to="/" className="mobile-topbar-brand">
          <Waves size={18} /> <span>AquaSmart</span>
        </Link>
      </div>

      {/* Overlay gelap saat sidebar terbuka di mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={'sidebar' + (sidebarOpen ? ' open' : '')}>
        <Link to="/" className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Waves size={22} />
          </div>
          <div className="sidebar-logo-text">
            <h1>AquaSmart</h1>
            <p>Smart Aquaculture System</p>
          </div>
        </Link>
        <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu">
          <X size={20} />
        </button>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Utama</div>
          <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Home size={18} /> <span>Dashboard</span>
          </NavLink>
          <NavLink to="/farms" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Fish size={18} /> <span>Peternakan</span>
          </NavLink>
          <NavLink to="/notifications" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Bell size={18} /> <span>Notifikasi</span>
            {unreadCount > 0 && <span className="nav-item-badge">{unreadCount}</span>}
          </NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Hardware</div>
          <NavLink to="/lele-feeder" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Cpu size={18} /> <span>Pakan Lele</span>
          </NavLink>
          <NavLink to="/water-devices" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Waves size={18} /> <span>Perangkat Air</span>
          </NavLink>
          <NavLink to="/devices" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Plug size={18} /> <span>Perangkat</span>
          </NavLink>
          <NavLink to="/mqtt-monitor" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Radio size={18} /> <span>MQTT Monitor</span>
          </NavLink>
          <NavLink to="/hardware-test" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Wrench size={18} /> <span>Uji Hardware</span>
          </NavLink>
          <NavLink to="/firmware" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <ArrowUpCircle size={18} /> <span>Firmware (OTA)</span>
          </NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Tools</div>
          <NavLink to="/simulation" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Activity size={18} /> <span>Simulasi Dummy</span>
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <BarChart3 size={18} /> <span>Grafana Analytics</span>
          </NavLink>
          <NavLink to="/compare" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <LayoutGrid size={18} /> <span>Perbandingan Kolam</span>
          </NavLink>
        </div>

        {canManageUsers && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Administrasi</div>
            <NavLink to="/users" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <UsersIcon size={18} /> <span>Pengguna</span>
            </NavLink>
            <NavLink to="/whatsapp" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <MessageCircle size={18} /> <span>Notifikasi WA</span>
            </NavLink>
          </div>
        )}

        <div className="sidebar-user" style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center',
              color: 'white', fontWeight: 700, background: 'linear-gradient(135deg,#0891b2,#06b6d4)',
            }}>{(user?.name || user?.email || '?').charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || user?.email}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{ROLE_LABEL[user?.role] || user?.role}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={logout}>
            <LogOut size={15} /> Keluar
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/farms" element={<Farms />} />
          <Route path="/farms/:farmId" element={<FarmDetail />} />
          <Route path="/ponds/:pondId" element={<PondDetail />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/analytics" element={<GrafanaView />} />
          <Route path="/compare" element={<ComparePonds />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/lele-feeder" element={<LeleFeeder />} />
          <Route path="/water-devices" element={<WaterDevices />} />
          <Route path="/mqtt-monitor" element={<MqttMonitor />} />
          <Route path="/hardware-test" element={<HardwareTest />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/firmware" element={<Firmware />} />
          <Route path="/users" element={<Users />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
        </Routes>
      </main>
    </div>
  );
}
