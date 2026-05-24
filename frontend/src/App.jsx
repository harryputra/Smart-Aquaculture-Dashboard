import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Link } from 'react-router-dom';
import {
  Home, Fish, Activity, BarChart3, Bell, Waves,
  Skull, Utensils, Settings, LayoutGrid, Cpu,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Farms from './pages/Farms';
import FarmDetail from './pages/FarmDetail';
import PondDetail from './pages/PondDetail';
import Simulation from './pages/Simulation';
import GrafanaView from './pages/GrafanaView';
import Notifications from './pages/Notifications';
import LeleFeeder from './pages/LeleFeeder';
import { getUnreadCount } from './services/api';

export default function App() {
  const [unreadCount, setUnreadCount] = useState(0);

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

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Waves size={22} />
          </div>
          <div className="sidebar-logo-text">
            <h1>AquaSmart</h1>
            <p>Smart Aquaculture System</p>
          </div>
        </Link>

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
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Tools</div>
          <NavLink to="/simulation" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Activity size={18} /> <span>Simulasi Dummy</span>
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <BarChart3 size={18} /> <span>Grafana Analytics</span>
          </NavLink>
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
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/lele-feeder" element={<LeleFeeder />} />
        </Routes>
      </main>
    </div>
  );
}
