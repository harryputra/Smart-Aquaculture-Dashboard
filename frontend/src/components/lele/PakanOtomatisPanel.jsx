import { useEffect, useState } from 'react';
import { Play, Power, AlertTriangle, CheckCircle, XCircle, Zap, Calculator, RefreshCw } from 'lucide-react';
import { remoteManualFeed, remoteFeedGram, remoteAutoFeed, getLeleSessions, getLastAck } from '../../services/leleApi';

export default function PakanOtomatisPanel({ device }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customGram, setCustomGram] = useState(200);
  const [lastAck, setLastAck] = useState(null);

  async function load() {
    try {
      const [s, ack] = await Promise.all([
        getLeleSessions(device.device_id),
        getLastAck(device.device_id),
      ]);
      setSessions(s);
      setLastAck(ack);
    } catch (e) { /* */ }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [device.device_id]);

  const fishCount = device.fish_count || 0;
  const avgWeight = parseFloat(device.avg_fish_g || 0);
  const feedingRate = parseFloat(device.feeding_rate_percent || 0);
  const feedingPerDay = device.feeding_per_day || 2;
  const biomassKg = (avgWeight * fishCount) / 1000;
  const dailyFeedG = biomassKg * (feedingRate / 100) * 1000;
  const perScheduleG = feedingPerDay > 0 ? dailyFeedG / feedingPerDay : 0;
  const sampleReady = device.sample_ready;

  async function handleManualFeed() {
    if (!sampleReady) { alert('Belum ada data sampling. Lakukan sampling dulu di tab Timbang Biomassa.'); return; }
    if (device.feeding_in_progress) { alert('Device sedang feeding.'); return; }
    if (!confirm(`Mulai manual feed ADAPTIF?\n\n• Avg ikan: ${avgWeight.toFixed(1)} g\n• Biomassa: ${biomassKg.toFixed(2)} kg\n• Rate: ${feedingRate.toFixed(1)}%/hari\n• Target/jadwal: ${Math.round(perScheduleG)} g`)) return;

    setLoading(true);
    try { await remoteManualFeed(device.device_id); setTimeout(load, 500); }
    catch (e) { alert('❌ ' + e.message); }
    setLoading(false);
  }

  async function handleCustomFeed() {
    if (device.feeding_in_progress) { alert('Device sedang feeding.'); return; }
    if (!confirm(`Mulai feed ${customGram}g manual?`)) return;
    setLoading(true);
    try { await remoteFeedGram(device.device_id, +customGram); setTimeout(load, 500); }
    catch (e) { alert('❌ ' + e.message); }
    setLoading(false);
  }

  async function handleToggleAuto() {
    try { await remoteAutoFeed(device.device_id, !device.auto_feed_enabled); setTimeout(load, 500); }
    catch (e) { alert(e.message); }
  }

  const lastSession = sessions[0];
  const isOffline = !device.is_online;

  return (
    <>
      {isOffline && (
        <div className="alert alert-danger">
          <AlertTriangle size={18} />
          <div><strong>Device offline.</strong> Tombol kontrol tidak bekerja.</div>
        </div>
      )}

      {device.feeding_in_progress && (
        <div className="alert" style={{ background: 'linear-gradient(135deg, #06b6d4, #0284c7)', color: 'white', border: 'none' }}>
          <RefreshCw size={18} className="spin" />
          <div><strong>⚙️ Device sedang feeding...</strong> Perintah ditolak hingga selesai.</div>
        </div>
      )}

      {lastAck && (Date.now() - new Date(lastAck.received_at).getTime() < 10000) && (
        <div className={`alert ${lastAck.success ? 'alert-success' : 'alert-warning'}`}>
          {lastAck.success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <div><strong>Device respond:</strong> {lastAck.command} — {lastAck.reason}</div>
        </div>
      )}

      {/* Auto Feed Toggle */}
      <div className="card mb-6">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 48, height: 48, borderRadius: 12,
              background: device.auto_feed_enabled ? 'var(--success-light)' : 'var(--bg-tertiary)',
              color: device.auto_feed_enabled ? 'var(--success-dark)' : 'var(--text-tertiary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Power size={24} />
            </div>
            <div>
              <div className="card-title">Auto Feed (Jadwal)</div>
              <div className="card-subtitle">
                {device.auto_feed_enabled
                  ? `✅ ON — next ${device.next_schedule_hhmm || '--'}`
                  : '⏸️ OFF — hanya manual'}
              </div>
            </div>
          </div>
          <label className="toggle" style={{ transform: 'scale(1.3)' }}>
            <input type="checkbox" checked={device.auto_feed_enabled || false}
              onChange={handleToggleAuto} disabled={isOffline} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">🎯 Manual Feed Adaptif</div>
            <div className="card-subtitle">Sesuai biomassa terkini (LCD: Pakan Otomatis → Mulai Feed Manual)</div>
          </div>
        </div>

        {!sampleReady ? (
          <div className="alert alert-warning">
            <AlertTriangle size={18} />
            <div>Belum ada data biomassa valid. Lakukan sampling minimum 3 ikan dulu.</div>
          </div>
        ) : (
          <>
            <div className="alert alert-info">
              <Calculator size={18} />
              <div>avg <strong>{avgWeight.toFixed(1)}g</strong> × <strong>{fishCount}</strong> × <strong>{feedingRate.toFixed(1)}%</strong> ÷ <strong>{feedingPerDay}x</strong> = <strong>{Math.round(perScheduleG)}g</strong></div>
            </div>
            <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
              <div style={{ padding: 16, background: 'var(--success-light)', borderRadius: 10, border: '2px solid var(--success)' }}>
                <div className="text-xs" style={{ color: 'var(--success-dark)', fontWeight: 600 }}>TARGET</div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: 'var(--success-dark)' }}>{Math.round(perScheduleG)} g</div>
              </div>
              <button className="btn btn-primary" onClick={handleManualFeed}
                disabled={loading || isOffline || device.feeding_in_progress}
                style={{ padding: '16px 24px', fontSize: 16 }}>
                {loading ? <RefreshCw size={18} className="spin" /> : <Play size={18} />}
                {loading ? 'Mengirim...' : 'KIRIM PERINTAH FEED ADAPTIF'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">⚡ Manual Feed Custom Gram</div>
            <div className="card-subtitle">Override target (10-5000g)</div>
          </div>
        </div>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label className="form-label">Target gram</label>
            <input type="number" min="10" max="5000" className="form-input" value={customGram}
              onChange={e => setCustomGram(e.target.value)} />
          </div>
          <button className="btn btn-warning" onClick={handleCustomFeed}
            disabled={loading || isOffline || device.feeding_in_progress}
            style={{ padding: '12px 20px', alignSelf: 'flex-end' }}>
            <Zap size={16} /> Kirim Feed {customGram}g
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Feeding Terakhir</div>
            <div className="card-subtitle">Sesi terbaru dari device</div>
          </div>
        </div>
        {!lastSession ? (
          <div className="empty-state"><p>Belum ada feeding tercatat</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Stat label="Status" value={lastSession.success ? 'Sukses' : 'Gagal'} icon={lastSession.success
              ? <CheckCircle size={18} style={{ color: 'var(--success)' }} />
              : <XCircle size={18} style={{ color: 'var(--danger)' }} />} />
            <Stat label="Sesi" value={lastSession.session_name} />
            <Stat label="Target" value={`${parseFloat(lastSession.target_total_g).toFixed(0)} g`} />
            <Stat label="Aktual" value={lastSession.actual_total_g ? `${parseFloat(lastSession.actual_total_g).toFixed(0)} g` : '-'} />
            <Stat label="Batch" value={lastSession.actual_batch_count || lastSession.planned_batch_count} />
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
      <div className="text-xs text-muted">{label}</div>
      <div className="flex items-center gap-2" style={{ marginTop: 4, fontWeight: 700, fontSize: 14 }}>
        {icon}<span>{value}</span>
      </div>
    </div>
  );
}
