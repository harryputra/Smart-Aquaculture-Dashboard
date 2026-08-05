import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Wifi, WifiOff, Zap, Activity, Power, Utensils, Skull,
  Calendar, FileText, Settings, AlertCircle, Sprout, Scale, Wallet, ClipboardList, Waves,
} from 'lucide-react';
import { getPond, getSensorHistory } from '../services/api';
import { useCan } from '../context/AuthContext';
import MonitorTab from '../components/MonitorTab';
import ControlTab from '../components/ControlTab';
import FeedingTab from '../components/FeedingTab';
import MortalityTab from '../components/MortalityTab';
import ScheduleTab from '../components/ScheduleTab';
import LogsTab from '../components/LogsTab';
import SettingsTab from '../components/SettingsTab';
import CycleTab from '../components/CycleTab';
import BiomassTab from '../components/BiomassTab';
import FinancialTab from '../components/FinancialTab';
import LogbookTab from '../components/LogbookTab';
import PondOverview from '../components/PondOverview';

export default function PondDetail() {
  const { pondId } = useParams();
  const [pond, setPond] = useState(null);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('cycle');
  const { canFinance, canManageUsers } = useCan();

  async function loadPond() {
    try {
      const [p, h] = await Promise.all([getPond(pondId), getSensorHistory(pondId, 30)]);
      setPond(p);
      setHistory(h);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    loadPond();
    const id = setInterval(loadPond, 3000);
    return () => clearInterval(id);
  }, [pondId]);

  if (!pond) return <div className="loading"><div className="spinner" /></div>;

  const isConnected = pond.is_connected;
  const feederOnline = pond.feeder_is_online;
  const hasLiveDevice = isConnected || feederOnline;

  // Dikelompokkan: Budidaya (manajemen siklus) vs Operasional (harian/hardware).
  const GROUPS = [
    { group: 'Budidaya', tabs: [
      { id: 'cycle', label: 'Siklus', icon: Sprout },
      { id: 'biomass', label: 'Biomassa', icon: Scale },
      { id: 'mortality', label: 'Kematian', icon: Skull },
      ...(canFinance ? [{ id: 'financial', label: 'Keuangan', icon: Wallet }] : []),
      { id: 'logbook', label: 'Logbook', icon: ClipboardList },
    ] },
    { group: 'Operasional', tabs: [
      { id: 'monitor', label: 'Monitor', icon: Activity },
      { id: 'control', label: 'Kontrol Air', icon: Power },
      { id: 'feeding', label: 'Pakan', icon: Utensils },
      { id: 'schedule', label: 'Jadwal Kuras', icon: Calendar },
      { id: 'logs', label: 'Log Aktivitas', icon: FileText },
      ...(canManageUsers ? [{ id: 'settings', label: 'Pengaturan', icon: Settings }] : []),
    ] },
  ];

  return (
    <div className="page-container">
      <Link to={`/farms/${pond.farm_id}`} className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Kembali
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{pond.name}</h1>
          <p className="page-subtitle">
            {pond.fish_type} · {pond.fish_count} ekor · Luas {pond.size_m2} m²
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Status hardware KUALITAS AIR (sensor + kuras/isi) */}
          <div className={`mode-indicator ${isConnected ? 'live' : 'dummy'}`} title="Node monitoring & kontrol kualitas air">
            <span className="pulse" />
            {isConnected ? <><Waves size={14} /> Kualitas Air Online</> : <><WifiOff size={14} /> Kualitas Air Offline</>}
          </div>
          {/* Status hardware PAKAN (feeder) — hanya bila kolam punya mesin pakan */}
          {pond.feeder_device_id && (
            <div className={`mode-indicator ${feederOnline ? 'live' : 'dummy'}`} title="Mesin pemberi pakan (feeder)">
              <span className="pulse" />
              <Zap size={14} /> {feederOnline ? 'Feeder Online' : 'Feeder Offline'}
            </div>
          )}
        </div>
      </div>

      {!hasLiveDevice && (
        <div className="alert alert-info">
          <AlertCircle size={18} />
          <div>
            <strong>Mode Dummy Aktif.</strong> ESP32 tidak terdeteksi. Atur data sensor di menu{' '}
            <Link to="/simulation" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>Simulasi Dummy</Link>.
            Sistem akan otomatis beralih ke realtime saat ESP32 mengirim data.
          </div>
        </div>
      )}

      <PondOverview pondId={pondId} onGoTab={setTab} />

      {GROUPS.map(g => (
        <div key={g.group} style={{ marginBottom: 10 }}>
          <div className="text-xs text-muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 2px' }}>{g.group}</div>
          <div className="tabs">
            {g.tabs.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
                  <Icon size={16} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 12 }}>
        {tab === 'cycle' && <CycleTab pondId={pondId} onChange={loadPond} />}
        {tab === 'biomass' && <BiomassTab pondId={pondId} />}
        {tab === 'financial' && <FinancialTab pondId={pondId} />}
        {tab === 'logbook' && <LogbookTab pondId={pondId} />}
        {tab === 'monitor' && <MonitorTab pond={pond} history={history} />}
        {tab === 'control' && <ControlTab pond={pond} onChange={loadPond} />}
        {tab === 'feeding' && <FeedingTab pondId={pondId} />}
        {tab === 'mortality' && <MortalityTab pondId={pondId} />}
        {tab === 'schedule' && <ScheduleTab pondId={pondId} />}
        {tab === 'logs' && <LogsTab pondId={pondId} />}
        {tab === 'settings' && <SettingsTab pondId={pondId} threshold={pond.threshold} onSaved={loadPond} />}
      </div>
    </div>
  );
}
