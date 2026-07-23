import { useEffect, useRef, useState } from 'react';
import { Hand, CalendarClock, Sparkles, Utensils, Scale, Loader, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import {
  setFeedMode, getFeedProgress, remoteManualFeed, remoteFeedGram, setSpinner, testSpread, setServoOpen, getLastAck,
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
  const [feedMsg, setFeedMsg] = useState(null);   // { kind:'sending'|'ok'|'fail'|'timeout', text }
  const timer = useRef(null);
  // pengaturan spinner (nilai awal dari status device)
  const [spnHigh, setSpnHigh] = useState(live.spinner_pwm_high ?? 255);
  const [spnLow, setSpnLow] = useState(live.spinner_pwm_low ?? 175);
  const [spnDir, setSpnDir] = useState(live.spinner_dir_mode ?? 0);
  const [spnSecs, setSpnSecs] = useState(5);
  // pengaturan buka trapdoor
  const [svoMode, setSvoMode] = useState(live.servo_open_mode ?? 0);
  const [svoStall, setSvoStall] = useState(((live.servo_stall_ms ?? 1500) / 1000));

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
  // Tunggu ACK BARU dari device (beda dari baseline) untuk command tertentu, maks ~7 dtk.
  async function waitForAck(expectedCmd, baselineTs) {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const a = await getLastAck(deviceId);
        if (a && a.command === expectedCmd && a.received_at !== baselineTs) return a;
      } catch (_) { /* ignore */ }
    }
    return null;
  }

  async function feedNow(adaptive) {
    if (!online) { setFeedMsg({ kind: 'fail', text: 'Device OFFLINE — perintah tidak dikirim.' }); return; }
    let target_g = null;
    if (!adaptive) {
      const g = parseFloat(gram);
      if (!g || g < 10 || g > 5000) { setFeedMsg({ kind: 'fail', text: 'Isi gram antara 10–5000.' }); return; }
      target_g = g;
    }
    setBusy(true);
    const expectedCmd = adaptive ? 'manual_feed_adaptive' : 'manual_feed_gram';
    // Rekam ACK terakhir sbg baseline agar bisa deteksi ACK BARU dari device.
    let baseline = null;
    try { const a0 = await getLastAck(deviceId); baseline = a0?.received_at ?? null; } catch (_) { /* */ }
    setFeedMsg({ kind: 'sending', text: adaptive ? 'Mengirim perintah Feed Adaptif…' : `Mengirim perintah beri ${target_g} g…` });
    try {
      if (adaptive) await remoteManualFeed(deviceId);
      else await remoteFeedGram(deviceId, target_g);
    } catch (e) {
      setFeedMsg({ kind: 'fail', text: 'Gagal mengirim ke server: ' + e.message });
      setBusy(false);
      return;
    }
    // Perintah sudah di broker; tunggu device membalas ACK.
    const ack = await waitForAck(expectedCmd, baseline);
    if (!ack) {
      setFeedMsg({
        kind: 'timeout',
        text: 'Perintah terkirim ke broker, tapi device belum membalas (ACK). Kemungkinan alat tidak menerima — cek daya/koneksi alat, atau lihat tab Diagnostik.',
      });
    } else if (ack.success) {
      setFeedMsg({ kind: 'ok', text: `Alat menerima perintah ✓ — ${ack.reason || 'Queued'}. Pantau di "Monitor Penimbangan" di atas.` });
    } else {
      setFeedMsg({ kind: 'fail', text: `Alat menolak perintah ✗ — ${ack.reason || 'ditolak'}.` });
    }
    setBusy(false);
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
  async function saveServo() {
    setBusy(true);
    try { await setServoOpen(deviceId, { mode: svoMode, stall_ms: Math.round(svoStall * 1000) }); }
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
        {feedMsg && <FeedMsgBanner msg={feedMsg} />}
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

      {/* BUKA TRAPDOOR (pelepasan pakan) */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><div><div className="card-title">Buka Trapdoor (pelepasan pakan)</div>
          <div className="card-subtitle">Atur cara pakan jatuh ke piringan pemutar</div></div></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Mode buka</label>
            <select className="form-select" value={svoMode} onChange={e => setSvoMode(+e.target.value)}>
              <option value={0}>Instan (langsung penuh)</option>
              <option value={1}>Bertahap (metered, sedikit demi sedikit)</option>
            </select></div>
          {svoMode === 1 && (
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Ambang anti-macet (detik)</label>
              <input className="form-input" type="number" min="0.3" max="8" step="0.1" value={svoStall} onChange={e => setSvoStall(+e.target.value)} style={{ width: 150 }} /></div>
          )}
          <button className="btn btn-primary" disabled={busy || !online} onClick={saveServo}>Simpan</button>
        </div>
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>
          <strong>Bertahap</strong>: trapdoor buka celah kecil dulu → pakan menetes ke piringan; celah otomatis melebar bila aliran berhenti (anti-macet). Cocok untuk sebaran lebih rata.
          {live.servo_open_mode != null && <> · Aktif di device: {live.servo_open_mode === 1 ? `bertahap (anti-macet ${(live.servo_stall_ms / 1000).toFixed(1)}s)` : 'instan'}.</>}
        </div>
      </div>

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// Banner hasil perintah beri pakan: kirim → ACK device / ditolak / tak ada respons.
function FeedMsgBanner({ msg }) {
  const map = {
    sending: { bg: 'rgba(6,182,212,0.10)', bd: '#06b6d4', fg: '#0e7490', Icon: Loader, spin: true },
    ok:      { bg: 'rgba(34,197,94,0.12)', bd: '#22c55e', fg: '#15803d', Icon: CheckCircle },
    fail:    { bg: 'rgba(239,68,68,0.12)', bd: '#ef4444', fg: '#b91c1c', Icon: XCircle },
    timeout: { bg: 'rgba(245,158,11,0.12)', bd: '#f59e0b', fg: '#b45309', Icon: AlertTriangle },
  };
  const s = map[msg.kind] || map.sending;
  const { Icon } = s;
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px', borderRadius: 10,
      background: s.bg, border: `1px solid ${s.bd}`, color: s.fg,
      display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, fontWeight: 600,
    }}>
      <Icon size={18} className={s.spin ? 'spin' : ''} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{msg.text}</span>
    </div>
  );
}
