import { useEffect, useRef, useState } from 'react';
import { Hand, CalendarClock, Sparkles, Utensils, Scale, Loader, CheckCircle } from 'lucide-react';
import {
  setFeedMode, getFeedProgress, remoteManualFeed, remoteFeedGram, setSpinner, testSpread,
} from '../../services/leleApi';

const MODES = [
  { id: 'manual', label: 'Manual', icon: Hand, desc: 'Hanya saat ditekan (hardware/dashboard)' },
  { id: 'jadwal', label: 'Jadwal', icon: CalendarClock, desc: 'Pakan otomatis di jam terjadwal' },
  { id: 'auto', label: 'Auto', icon: Sparkles, desc: 'Jadwal + dosis ikut sampling terbaru' },
];

// Panel pakan tersinkron: pilih MODE, kontrol manual, & MONITOR penimbangan live.
// Sumber kebenaran = device (live_data dari status MQTT). Aksi → MQTT ke hardware.
export default function FeedControlSyncPanel({ device }) {
  const deviceId = device.device_id;
  const live = device.live_data || {};
  const currentMode = live.feed_mode || (device.auto_feed_enabled ? 'jadwal' : 'manual');
  const online = device.is_online;

  const [busy, setBusy] = useState(false);
  const [gram, setGram] = useState('');
  const [progress, setProgress] = useState(null);
  const timer = useRef(null);
  // pengaturan spinner (nilai awal dari status device)
  const [spnHigh, setSpnHigh] = useState(live.spinner_pwm_high ?? 255);
  const [spnLow, setSpnLow] = useState(live.spinner_pwm_low ?? 175);
  const [spnDir, setSpnDir] = useState(live.spinner_dir_mode ?? 0);
  const [spnSecs, setSpnSecs] = useState(5);

  // Poll progress penimbangan saat feeding (cepat) / idle (lambat).
  useEffect(() => {
    let stop = false;
    async function tick() {
      try { const p = await getFeedProgress(deviceId); if (!stop) setProgress(p); } catch (_) {}
    }
    tick();
    timer.current = setInterval(tick, 700);
    return () => { stop = true; clearInterval(timer.current); };
  }, [deviceId]);

  const feeding = !!progress || live.feeding_in_progress || device.feeding_in_progress;

  async function changeMode(mode) {
    if (mode === currentMode || busy) return;
    setBusy(true);
    try { await setFeedMode(deviceId, mode); } catch (e) { alert(e.message); } finally { setTimeout(() => setBusy(false), 600); }
  }
  async function feedNow(adaptive) {
    if (!online) { alert('Device offline.'); return; }
    setBusy(true);
    try {
      if (adaptive) await remoteManualFeed(deviceId);
      else {
        const g = parseFloat(gram);
        if (!g || g < 10 || g > 5000) { alert('Isi gram 10–5000.'); setBusy(false); return; }
        await remoteFeedGram(deviceId, g);
      }
    } catch (e) { alert(e.message); } finally { setTimeout(() => setBusy(false), 600); }
  }
  async function saveSpinner() {
    setBusy(true);
    try { await setSpinner(deviceId, { pwm_high: spnHigh, pwm_low: spnLow, dir: spnDir }); }
    catch (e) { alert(e.message); } finally { setTimeout(() => setBusy(false), 600); }
  }
  async function doTestSpread() {
    if (!online) { alert('Device offline.'); return; }
    setBusy(true);
    try { await testSpread(deviceId, spnSecs); }
    catch (e) { alert(e.message); } finally { setTimeout(() => setBusy(false), 600); }
  }

  const pct = progress && progress.target_g > 0
    ? Math.min(100, Math.round((progress.current_g / progress.target_g) * 100)) : 0;

  return (
    <>
      {/* MODE PAKAN */}
      <div className="card mb-6">
        <div className="card-header">
          <div><div className="card-title">Mode Pakan</div><div className="card-subtitle">Sinkron dengan panel hardware</div></div>
          {!online && <span className="badge badge-warning">Device offline</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          {MODES.map(m => {
            const Icon = m.icon; const active = currentMode === m.id;
            return (
              <button key={m.id} onClick={() => changeMode(m.id)} disabled={busy || !online}
                style={{
                  textAlign: 'left', padding: 14, borderRadius: 12, cursor: online ? 'pointer' : 'not-allowed',
                  border: '2px solid ' + (active ? 'var(--accent-primary)' : 'var(--border-primary)'),
                  background: active ? 'var(--accent-light)' : 'var(--bg-secondary)',
                }}>
                <div className="flex items-center gap-2" style={{ fontWeight: 700, color: active ? 'var(--accent-primary)' : 'inherit' }}>
                  <Icon size={18} /> {m.label} {active && <CheckCircle size={15} style={{ marginLeft: 'auto', color: 'var(--success)' }} />}
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>{m.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MONITOR PENIMBANGAN LIVE */}
      <div className="card mb-6">
        <div className="card-header"><div className="card-title"><Scale size={18} style={{ verticalAlign: -3 }} /> Monitor Penimbangan (Live)</div></div>
        {feeding && progress ? (
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span className="flex items-center gap-2" style={{ fontWeight: 600 }}><Loader size={16} className="spin" /> Sedang menimbang — Batch {progress.batch_no}/{progress.total_batches}</span>
              <span style={{ fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{progress.current_g?.toFixed(1)} / {progress.target_g?.toFixed(0)} g</span>
            </div>
            <div style={{ height: 22, background: 'var(--bg-tertiary)', borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct + '%', background: 'var(--gradient-primary)', transition: 'width 0.3s', borderRadius: 11 }} />
            </div>
            <div className="text-xs text-muted" style={{ marginTop: 6 }}>{pct}% dari target batch · update ~0.7 dtk</div>
          </div>
        ) : feeding ? (
          <div className="flex items-center gap-2 text-muted"><Loader size={16} className="spin" /> Feeding berlangsung… menunggu data timbangan.</div>
        ) : (
          <div className="empty-state" style={{ padding: 20 }}>
            <div className="text-muted">Tidak sedang memberi pakan. Timbangan akan tampil real-time saat feeding berjalan.</div>
            <div className="text-xs text-muted" style={{ marginTop: 6 }}>Chamber sekarang: {live.chamber_g != null ? `${Number(live.chamber_g).toFixed(1)} g` : '-'}</div>
          </div>
        )}
      </div>

      {/* KONTROL MANUAL */}
      <div className="card">
        <div className="card-header"><div><div className="card-title"><Utensils size={18} style={{ verticalAlign: -3 }} /> Beri Pakan Manual</div><div className="card-subtitle">Dari dashboard — setara tombol di panel hardware</div></div></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy || !online || feeding} onClick={() => feedNow(true)}>
            <Sparkles size={16} /> Feed Adaptif (otomatis dari biomassa)
          </button>
          <div className="flex items-end gap-2">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Gram tertentu</label>
              <input className="form-input" type="number" min="10" max="5000" value={gram} onChange={e => setGram(e.target.value)} placeholder="10–5000 g" style={{ width: 140 }} />
            </div>
            <button className="btn btn-secondary" disabled={busy || !online || feeding} onClick={() => feedNow(false)}>Beri</button>
          </div>
        </div>
        {feeding && <div className="text-xs text-muted" style={{ marginTop: 10 }}>Sedang feeding — tunggu selesai sebelum trigger baru.</div>}
      </div>

      {/* PENGATURAN SEBARAN (SPINNER) */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><div><div className="card-title">Pengaturan Sebaran (Spinner)</div>
          <div className="card-subtitle">Atur kecepatan & arah lemparan pakan — sinkron ke hardware</div></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 10 }}>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Kecepatan tinggi (lempar jauh)</label>
            <input className="form-input" type="number" min="120" max="255" value={spnHigh} onChange={e => setSpnHigh(+e.target.value)} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Kecepatan rendah (lempar dekat)</label>
            <input className="form-input" type="number" min="120" max="255" value={spnLow} onChange={e => setSpnLow(+e.target.value)} /></div>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Arah putar</label>
            <select className="form-select" value={spnDir} onChange={e => setSpnDir(+e.target.value)}>
              <option value={0}>Bolak-balik (merata)</option>
              <option value={1}>Kanan (CW)</option>
              <option value={2}>Kiri (CCW)</option>
            </select></div>
        </div>
        <div className="text-xs text-muted" style={{ marginBottom: 12 }}>
          Skala 120–255 (255 = paling kencang). Naikkan bila pakan tak sampai ke ujung depan.
          {live.spinner_pwm_high != null && <> · Aktif di device: tinggi {live.spinner_pwm_high}, rendah {live.spinner_pwm_low}, arah {live.spinner_dir_mode === 1 ? 'kanan' : live.spinner_dir_mode === 2 ? 'kiri' : 'bolak-balik'}.</>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy || !online} onClick={saveSpinner}>Simpan Pengaturan</button>
          <div className="flex items-end gap-2" style={{ marginLeft: 'auto' }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Test (detik)</label>
              <input className="form-input" type="number" min="1" max="15" value={spnSecs} onChange={e => setSpnSecs(+e.target.value)} style={{ width: 90 }} /></div>
            <button className="btn btn-secondary" disabled={busy || !online || feeding} onClick={doTestSpread}>Test Sebar (tanpa pakan)</button>
          </div>
        </div>
      </div>

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
