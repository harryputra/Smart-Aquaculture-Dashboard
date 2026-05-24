import { useEffect, useState } from 'react';
import { Scale, Play, RefreshCw, Trash2, AlertCircle, TrendingUp, Send, Hash } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  remoteStartSampling, remoteResetSamples, remoteConfig,
  getLeleBiomassSamples, getLeleBiomassSummary, getLeleGrowth,
} from '../../services/leleApi';

export default function TimbangBiomassaPanel({ device }) {
  const [samples, setSamples] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [growth, setGrowth] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editSample, setEditSample] = useState(false);
  const [sampleCount, setSampleCount] = useState(device.target_sample_count || 10);

  async function load() {
    try {
      const [s, sm, g] = await Promise.all([
        getLeleBiomassSamples(device.device_id),
        getLeleBiomassSummary(device.device_id),
        getLeleGrowth(device.device_id),
      ]);
      setSamples(s); setSummaries(sm); setGrowth(g);
    } catch (e) { /* */ }
  }

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [device.device_id]);
  useEffect(() => { setSampleCount(device.target_sample_count || 10); }, [device.target_sample_count]);

  async function handleStart() {
    if (device.feeding_in_progress) { alert('Device sedang feeding.'); return; }
    if (!confirm(`Mulai sampling ${device.target_sample_count || 10} ikan dari web?\n\nSetelah dikirim, lihat LCD device untuk panduan letak ikan.`)) return;
    setBusy(true);
    try { await remoteStartSampling(device.device_id); }
    catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function handleReset() {
    if (!confirm('Reset semua sampling di device? Data riwayat di dashboard TIDAK terhapus.')) return;
    setBusy(true);
    try { await remoteResetSamples(device.device_id); load(); }
    catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function saveSampleCount() {
    if (sampleCount < 3 || sampleCount > 30) { alert('Range: 3-30 ikan'); return; }
    setBusy(true);
    try {
      await remoteConfig(device.device_id, { target_sample_count: sampleCount });
      setEditSample(false);
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const latestSummary = summaries[0];
  const isOffline = !device.is_online;
  const inProgress = device.current_screen === 'sample_active';

  // Group samples per session
  const groupedSamples = [];
  let current = [];
  let lastTime = null;
  for (const s of samples) {
    const t = new Date(s.sampled_at).getTime();
    if (lastTime && lastTime - t > 600000) {
      if (current.length) groupedSamples.push(current);
      current = [];
    }
    current.push(s);
    lastTime = t;
  }
  if (current.length) groupedSamples.push(current);
  const latestSession = groupedSamples[0] || [];

  return (
    <>
      {isOffline && <div className="alert alert-danger"><AlertCircle size={18} /><div>Device offline.</div></div>}

      {inProgress && (
        <div className="alert" style={{ background: 'linear-gradient(135deg, #06b6d4, #0284c7)', color: 'white', border: 'none' }}>
          <RefreshCw size={18} className="spin" />
          <div>
            <strong>📊 Sampling sedang berjalan:</strong> Ikan ke-{(device.current_sample_index || 0) + 1} dari {device.target_sample_count || 10}.
            Lihat LCD untuk panduan.
          </div>
        </div>
      )}

      {/* Quick stats dari sampling terakhir */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--success-light)', color: 'var(--success-dark)' }}>
            <Scale size={20} />
          </div>
          <div className="stat-card-label">Avg Berat Ikan</div>
          <div className="stat-card-value">{device.avg_fish_g ? parseFloat(device.avg_fish_g).toFixed(1) : '0'}</div>
          <div className="stat-card-subtext">gram/ekor</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon"><Hash size={20} /></div>
          <div className="stat-card-label">Sample Tersimpan</div>
          <div className="stat-card-value">{device.saved_sample_count || 0}</div>
          <div className="stat-card-subtext">/ {device.target_sample_count || 10} ikan</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>📊</div>
          <div className="stat-card-label">Status Sampling</div>
          <div className="stat-card-value" style={{ fontSize: 18 }}>
            {device.sample_ready ? 'VALID' : 'BELUM'}
          </div>
          <div className="stat-card-subtext">{device.sample_ready ? 'Bisa untuk feed adaptif' : 'Min 3 ikan diperlukan'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><TrendingUp size={20} /></div>
          <div className="stat-card-label">Feeding Rate Auto</div>
          <div className="stat-card-value">{device.feeding_rate_percent ? parseFloat(device.feeding_rate_percent).toFixed(1) : '0'}<span style={{ fontSize: 16 }}>%</span></div>
          <div className="stat-card-subtext">/hari (dari curve)</div>
        </div>
      </div>

      {/* Control panel */}
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">Kontrol Sampling Remote</div>
            <div className="card-subtitle">Sesuai LCD: Timbang Biomassa → Mulai Sampling / Reset / Set Jml Sample</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleStart} disabled={busy || isOffline || inProgress || device.feeding_in_progress}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Play size={28} />
            <div style={{ fontWeight: 700 }}>Mulai Sampling</div>
            <div className="text-xs" style={{ opacity: 0.85 }}>{device.target_sample_count || 10} ikan</div>
          </button>

          {!editSample ? (
            <button className="btn btn-secondary" onClick={() => setEditSample(true)} disabled={isOffline}
              style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Hash size={28} />
              <div style={{ fontWeight: 700 }}>Set Jml Sample</div>
              <div className="text-xs text-muted">Saat ini: {device.target_sample_count || 10}</div>
            </button>
          ) : (
            <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 10 }}>
              <label className="form-label">Jumlah sample (3-30)</label>
              <input type="number" min="3" max="30" className="form-input" value={sampleCount}
                onChange={e => setSampleCount(+e.target.value)} />
              <div className="flex gap-2" style={{ marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveSampleCount} disabled={busy}><Send size={14} /> Kirim</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditSample(false)}>Batal</button>
              </div>
            </div>
          )}

          <button className="btn btn-danger" onClick={handleReset} disabled={busy || isOffline}
            style={{ padding: 18, flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Trash2 size={28} />
            <div style={{ fontWeight: 700 }}>Reset Sampling</div>
            <div className="text-xs" style={{ opacity: 0.85 }}>Hapus di device</div>
          </button>
        </div>
      </div>

      {/* Latest session detail */}
      {latestSession.length > 0 && (
        <div className="card mb-6">
          <div className="card-header">
            <div>
              <div className="card-title">Sampling Terakhir ({latestSession.length} ikan)</div>
              <div className="card-subtitle">{new Date(latestSession[0].sampled_at).toLocaleString('id-ID')}</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ikan #</th><th>Berat (g)</th><th>Selisih dari rata²</th></tr></thead>
              <tbody>
                {latestSession.slice().reverse().map((s, i) => {
                  const avg = latestSession.reduce((sum, x) => sum + parseFloat(x.fish_weight_g), 0) / latestSession.length;
                  const diff = parseFloat(s.fish_weight_g) - avg;
                  return (
                    <tr key={s.id}>
                      <td>{s.fish_no}</td>
                      <td style={{ fontWeight: 700 }}>{parseFloat(s.fish_weight_g).toFixed(2)}</td>
                      <td style={{ color: diff > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Growth chart */}
      {growth.length >= 2 && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">📈 Perkembangan Pertumbuhan</div>
              <div className="card-subtitle">{growth.length} sesi sampling tercatat</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={growth}>
              <defs>
                <linearGradient id="growthArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="recorded_at" tick={{ fontSize: 11 }} tickFormatter={t => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
              <YAxis tick={{ fontSize: 11 }} unit=" g" />
              <Tooltip formatter={v => `${parseFloat(v).toFixed(1)} g`} labelFormatter={t => new Date(t).toLocaleString('id-ID')} />
              <Area type="monotone" dataKey="average_fish_weight_g" stroke="#06b6d4" strokeWidth={2.5} fill="url(#growthArea)" name="Avg berat (g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
