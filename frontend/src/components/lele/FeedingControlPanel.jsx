import { useEffect, useState } from 'react';
import { Play, Power, AlertTriangle, Utensils, CheckCircle, XCircle, RefreshCw, Calculator } from 'lucide-react';
import { manualFeedAdaptive, toggleAutoFeed, getLeleSessions, getLeleBiomassSummary, getLeleConfig } from '../../services/leleApi';

export default function FeedingControlPanel({ device }) {
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(device.auto_feed_enabled);

  async function load() {
    try {
      const [s, sm, c] = await Promise.all([
        getLeleSessions(device.device_id),
        getLeleBiomassSummary(device.device_id),
        getLeleConfig(device.device_id),
      ]);
      setSessions(s);
      setSummary(sm[0] || null);
      setConfig(c);
    } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [device.device_id]);
  useEffect(() => { setAutoEnabled(device.auto_feed_enabled); }, [device.auto_feed_enabled]);

  // Hitung adaptif preview
  const fishCount = config?.fish_count || device.fish_count || 0;
  const feedingRate = parseFloat(config?.feeding_rate_percent || 3.0);
  const feedingPerDay = config?.feeding_per_day || 2;
  const avgWeight = summary ? parseFloat(summary.average_fish_weight_g) : 0;
  const biomassKg = (avgWeight * fishCount) / 1000;
  const dailyFeedG = biomassKg * (feedingRate / 100) * 1000;
  const perScheduleG = feedingPerDay > 0 ? dailyFeedG / feedingPerDay : 0;

  async function handleManualFeed() {
    if (!summary) {
      alert('Belum ada data biomassa. Lakukan sampling biomassa dulu di tab "Timbang Biomassa".');
      return;
    }

    if (!confirm(
      `Mulai manual feed adaptif?\n\n` +
      `• Biomassa: ${biomassKg.toFixed(2)} kg\n` +
      `• Pakan/hari: ${Math.round(dailyFeedG)} g\n` +
      `• Pakan/jadwal: ${Math.round(perScheduleG)} g\n\n` +
      `Target akan dikirim ke device.`
    )) return;

    setLoading(true);
    try {
      const r = await manualFeedAdaptive(device.device_id);
      alert(`✅ Manual feed dikirim!\nTarget: ${r.target_g} g`);
      load();
    } catch (e) { alert('❌ ' + e.message); }
    setLoading(false);
  }

  async function handleToggleAuto() {
    try {
      const newState = !autoEnabled;
      await toggleAutoFeed(device.device_id, newState);
      setAutoEnabled(newState);
    } catch (e) { alert(e.message); }
  }

  const lastSession = sessions[0];

  return (
    <>
      {/* Auto Feed Toggle */}
      <div className="card mb-6">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 48, height: 48, borderRadius: 12, background: autoEnabled ? 'var(--success-light)' : 'var(--bg-tertiary)', color: autoEnabled ? 'var(--success-dark)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Power size={24} />
            </div>
            <div>
              <div className="card-title">Auto Feed RTC</div>
              <div className="card-subtitle">{autoEnabled ? 'Aktif — pakan otomatis sesuai jadwal' : 'Nonaktif — pakan hanya manual'}</div>
            </div>
          </div>
          <label className="toggle" style={{ transform: 'scale(1.3)' }}>
            <input type="checkbox" checked={autoEnabled} onChange={handleToggleAuto} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {/* Manual Feed Adaptif */}
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">Manual Feed (Adaptif)</div>
            <div className="card-subtitle">Pakan manual menggunakan perhitungan adaptif terakhir (bukan test 100/300g)</div>
          </div>
          <button className="btn btn-primary" onClick={handleManualFeed} disabled={loading || !summary}>
            {loading ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
            {loading ? 'Mengirim...' : 'Mulai Manual Feed'}
          </button>
        </div>

        {!summary ? (
          <div className="alert alert-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>Belum ada data biomassa.</strong> Lakukan sampling biomassa terlebih dahulu di tab{' '}
              <em>Timbang Biomassa</em>. Tanpa data sampling, perhitungan adaptif tidak bisa berjalan.
            </div>
          </div>
        ) : (
          <>
            <div className="alert alert-info">
              <Calculator size={18} />
              <div>
                Perhitungan menggunakan: avg <strong>{avgWeight.toFixed(1)}g</strong> × <strong>{fishCount}</strong> ikan
                × <strong>{feedingRate}%</strong> / <strong>{feedingPerDay}x</strong> sehari
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                <div className="text-xs text-muted">Biomassa Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-primary)' }}>{biomassKg.toFixed(2)} kg</div>
              </div>
              <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                <div className="text-xs text-muted">Pakan Harian</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{Math.round(dailyFeedG)} g</div>
              </div>
              <div style={{ padding: 14, background: 'var(--success-light)', borderRadius: 10, border: '2px solid var(--success)' }}>
                <div className="text-xs" style={{ color: 'var(--success-dark)', fontWeight: 600 }}>Target/Jadwal</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success-dark)' }}>{Math.round(perScheduleG)} g</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Last Feeding */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Feeding Terakhir</div>
            <div className="card-subtitle">Hasil sesi feeding terbaru</div>
          </div>
        </div>

        {!lastSession ? (
          <div className="empty-state"><p>Belum ada feeding</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
              <div className="text-xs text-muted">Status</div>
              <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                {lastSession.success ? <CheckCircle size={18} style={{ color: 'var(--success)' }} /> : <XCircle size={18} style={{ color: 'var(--danger)' }} />}
                <span style={{ fontWeight: 700 }}>{lastSession.success ? 'Sukses' : 'Gagal'}</span>
              </div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
              <div className="text-xs text-muted">Target</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{parseFloat(lastSession.target_total_g).toFixed(0)} g</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
              <div className="text-xs text-muted">Aktual</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{lastSession.actual_total_g ? parseFloat(lastSession.actual_total_g).toFixed(0) : '-'} g</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
              <div className="text-xs text-muted">Batch</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{lastSession.actual_batch_count || lastSession.planned_batch_count}</div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10, gridColumn: 'span 2' }}>
              <div className="text-xs text-muted">Selesai</div>
              <div style={{ fontWeight: 600 }}>{lastSession.completed_at ? new Date(lastSession.completed_at).toLocaleString('id-ID') : 'Berlangsung'}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
