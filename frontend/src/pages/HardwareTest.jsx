import { useEffect, useState } from 'react';
import {
  Cpu, Wifi, WifiOff, Octagon, DoorOpen, RotateCw, Wind, Scale, Radio,
  CheckCircle, XCircle, Loader,
} from 'lucide-react';
import {
  getLeleDevices, pingDevice, testSpinner, testServoAct, testAuger, stopDevice,
  remoteTare, getCommissioning, saveCommissioning,
} from '../services/leleApi';

const fdt = (d) => (d ? new Date(d).toLocaleTimeString('id-ID') : '-');

export default function HardwareTest() {
  const [devices, setDevices] = useState([]);
  const [sel, setSel] = useState(null);
  const [results, setResults] = useState({});   // test_key -> {result, note, tested_at}
  const [busy, setBusy] = useState(false);
  const [pingMsg, setPingMsg] = useState('');

  async function load() {
    try { const r = await getLeleDevices(); setDevices(r); if (r.length && !sel) setSel(r[0].device_id); } catch (e) { /* */ }
  }
  async function loadResults(id) {
    try { const r = await getCommissioning(id); const m = {}; r.forEach(x => { m[x.test_key] = x; }); setResults(m); } catch (e) { /* */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 2000); return () => clearInterval(t); }, []);
  useEffect(() => { if (sel) loadResults(sel); }, [sel]);

  const device = devices.find(d => d.device_id === sel);
  const live = device?.live_data || {};
  const online = device?.is_online;
  const feeding = live.feeding_in_progress || device?.feeding_in_progress;
  const locked = !online || feeding;   // interlock

  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { alert(e.message); } finally { setTimeout(() => setBusy(false), 500); }
  }
  async function emergencyStop() { try { await stopDevice(sel); } catch (e) { alert(e.message); } }
  async function ping() {
    setPingMsg('mengirim...');
    try { await pingDevice(sel); setPingMsg('Ping terkirim — device akan balas ACK. Lihat status "terakhir terlihat".'); }
    catch (e) { setPingMsg('Gagal: ' + e.message); }
  }
  async function mark(testKey, result) {
    const note = prompt(result === 'pass' ? 'Catatan (opsional):' : 'Apa masalahnya? (opsional)') ?? '';
    try { await saveCommissioning(sel, { test_key: testKey, result, note }); await loadResults(sel); }
    catch (e) { alert(e.message); }
  }

  if (!device) {
    return (
      <div className="page-container">
        <div className="page-header"><div><h1 className="page-title">🔧 Uji Hardware</h1>
          <p className="page-subtitle">Commissioning / pengujian fungsi perangkat</p></div></div>
        <div className="card"><div className="empty-state"><div className="empty-state-icon"><Cpu size={32} /></div>
          <h3>Belum ada device</h3><p>ESP32 akan muncul saat terhubung ke MQTT.</p></div></div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">🔧 Uji Hardware</h1>
          <p className="page-subtitle">Uji tiap fungsi perangkat & simpan hasilnya (commissioning)</p></div>
        <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={emergencyStop}>
          <Octagon size={16} /> STOP DARURAT
        </button>
      </div>

      {/* Pilih device + status mirror */}
      <div className="card mb-6">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>Device:</span>
            <select className="form-select" value={sel} onChange={e => setSel(e.target.value)} style={{ width: 'auto' }}>
              {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.name || d.device_id}</option>)}
            </select>
            <span className="badge" style={{ background: online ? '#d1fae5' : '#fee2e2', color: online ? '#047857' : '#b91c1c' }}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />} {online ? 'ONLINE' : 'OFFLINE'}
            </span>
            {feeding && <span className="badge badge-warning">Sedang feeding — uji terkunci</span>}
          </div>
          <div className="text-xs text-muted">Terakhir terlihat: {fdt(device.last_seen)}</div>
        </div>
        <div className="stats-grid" style={{ marginTop: 12 }}>
          <Mini label="Chamber" value={live.chamber_g != null ? `${Number(live.chamber_g).toFixed(1)} g` : '-'} />
          <Mini label="Sampling" value={live.sampling_g != null ? `${Number(live.sampling_g).toFixed(1)} g` : '-'} />
          <Mini label="Sudut Servo" value={live.servo_angle != null ? `${live.servo_angle}°` : '-'} />
          <Mini label="Spinner" value={live.spinner_state != null ? `${['stop', 'CW', 'CCW'][live.spinner_state] || '-'} / ${live.spinner_pwm ?? 0}` : '-'} />
        </div>
      </div>

      {/* 1. Konektivitas */}
      <TestCard icon={<Radio size={18} />} title="1. Konektivitas (dua arah)" testKey="konektivitas" result={results.konektivitas}
        expected="Dashboard→Hardware: ping dibalas ACK. Hardware→Dashboard: status masuk tiap 3 dtk (ONLINE & 'terakhir terlihat' baru)." onMark={mark}>
        <button className="btn btn-primary" disabled={busy || !online} onClick={ping}><Radio size={15} /> Kirim Ping</button>
        {pingMsg && <span className="text-xs text-muted" style={{ marginLeft: 10 }}>{pingMsg}</span>}
      </TestCard>

      {/* 2. Trapdoor servo */}
      <TestCard icon={<DoorOpen size={18} />} title="2. Trapdoor (servo)" testKey="servo" result={results.servo}
        expected="Pintu bergerak buka/tutup; sudut servo berubah di status. 'Sweep' = buka-tutup bertahap." onMark={mark}>
        <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testServoAct(sel, 'open'))}>Buka</button>
        <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testServoAct(sel, 'close'))}>Tutup</button>
        <button className="btn btn-primary" disabled={busy || locked} onClick={() => run(() => testServoAct(sel, 'sweep'))}>Buka-Tutup Bertahap (Sweep)</button>
      </TestCard>

      {/* 3. Spinner */}
      <TestCard icon={<RotateCw size={18} />} title="3. Spinner / penampang pemutar" testKey="spinner" result={results.spinner}
        expected="Piringan berputar sesuai arah (kanan/kiri) & kecepatan (pelan/kencang) selama ~3 detik." onMark={mark}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
          <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testSpinner(sel, { seconds: 3, pwm: 160, dir: 1 }))}>Pelan ↻ Kanan</button>
          <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testSpinner(sel, { seconds: 3, pwm: 255, dir: 1 }))}>Kencang ↻ Kanan</button>
          <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testSpinner(sel, { seconds: 3, pwm: 160, dir: 2 }))}>Pelan ↺ Kiri</button>
          <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testSpinner(sel, { seconds: 3, pwm: 255, dir: 2 }))}>Kencang ↺ Kiri</button>
        </div>
      </TestCard>

      {/* 4. Auger */}
      <TestCard icon={<Wind size={18} />} title="4. Auger / pendorong pakan (stepper)" testKey="auger" result={results.auger}
        expected="Ulir berputar saat jog. Maju = mendorong pakan; mundur = arah sebaliknya." onMark={mark}>
        <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testAuger(sel, 3, 'maju'))}>Jog Maju (3s)</button>
        <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => testAuger(sel, 3, 'mundur'))}>Jog Mundur (3s)</button>
      </TestCard>

      {/* 5. Timbangan */}
      <TestCard icon={<Scale size={18} />} title="5. Timbangan (HX711)" testKey="scale" result={results.scale}
        expected="Setelah Tare, berat ~0; saat ditekan/diberi beban, angka berat (atas) berubah." onMark={mark}>
        <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => remoteTare(sel, 'chamber'))}>Tare Chamber</button>
        <button className="btn btn-secondary" disabled={busy || locked} onClick={() => run(() => remoteTare(sel, 'sampling'))}>Tare Sampling</button>
        <span className="text-xs text-muted">Berat live: Chamber {live.chamber_g != null ? Number(live.chamber_g).toFixed(1) : '-'} g · Sampling {live.sampling_g != null ? Number(live.sampling_g).toFixed(1) : '-'} g</span>
      </TestCard>
    </div>
  );
}

function Mini({ label, value }) {
  return (<div className="stat-card"><div className="stat-card-label">{label}</div><div className="stat-card-value" style={{ fontSize: 20 }}>{value}</div></div>);
}

function TestCard({ icon, title, expected, testKey, result, onMark, children }) {
  return (
    <div className="card mb-6">
      <div className="card-header">
        <div><div className="card-title">{icon} {title}</div><div className="card-subtitle">{expected}</div></div>
        {result && (
          <span className="badge" style={{ background: result.result === 'pass' ? '#d1fae5' : '#fee2e2', color: result.result === 'pass' ? '#047857' : '#b91c1c' }}>
            {result.result === 'pass' ? <CheckCircle size={13} /> : <XCircle size={13} />} {result.result === 'pass' ? 'Berfungsi' : 'Bermasalah'}
            <span style={{ opacity: 0.7, marginLeft: 6 }}>{new Date(result.tested_at).toLocaleDateString('id-ID')}</span>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>{children}</div>
      {result?.note && <div className="text-xs text-muted" style={{ marginBottom: 8 }}>Catatan: {result.note}</div>}
      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-primary)', paddingTop: 10 }}>
        <span className="text-xs text-muted" style={{ alignSelf: 'center' }}>Hasil pemeriksaan:</span>
        <button className="btn btn-sm" style={{ background: '#d1fae5', color: '#047857' }} onClick={() => onMark(testKey, 'pass')}><CheckCircle size={14} /> Berfungsi</button>
        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#b91c1c' }} onClick={() => onMark(testKey, 'fail')}><XCircle size={14} /> Bermasalah</button>
      </div>
    </div>
  );
}
