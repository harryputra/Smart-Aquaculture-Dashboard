import { useEffect, useState } from 'react';
import { Scale, TrendingUp, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { getLeleBiomassSamples, getLeleBiomassSummary, getLeleGrowth, getLeleConfig } from '../../services/leleApi';

export default function BiomassSamplingPanel({ deviceId }) {
  const [samples, setSamples] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [growth, setGrowth] = useState([]);
  const [config, setConfig] = useState(null);

  async function load() {
    try {
      const [s, sm, g, c] = await Promise.all([
        getLeleBiomassSamples(deviceId),
        getLeleBiomassSummary(deviceId),
        getLeleGrowth(deviceId),
        getLeleConfig(deviceId),
      ]);
      setSamples(s);
      setSummaries(sm);
      setGrowth(g);
      setConfig(c);
    } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [deviceId]);

  const latest = summaries[0];
  const minSample = config?.min_sample_count || 10;

  // Group sample by session (latest one)
  const latestSession = samples.length > 0
    ? samples.filter(s => {
        const t = new Date(s.sampled_at).getTime();
        const latestT = new Date(samples[0].sampled_at).getTime();
        return Math.abs(latestT - t) < 30 * 60 * 1000; // dalam 30 menit
      })
    : [];

  const growthData = growth.map(g => ({
    date: new Date(g.recorded_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    weight: parseFloat(g.average_fish_weight_g),
    biomass: parseFloat(g.estimated_biomass_kg),
  }));

  return (
    <>
      {/* Warning kalau sampel < minimum */}
      {latestSession.length > 0 && latestSession.length < minSample && (
        <div className="alert alert-warning">
          <AlertCircle size={18} />
          <div>
            <strong>Sampling kurang valid.</strong> Sesi sampling terakhir hanya {latestSession.length} ikan,
            sedangkan minimum yang disarankan adalah {minSample} ikan untuk kolam berisi 1000-3000 ekor.
            Data masih dipakai tapi kurang representatif.
          </div>
        </div>
      )}

      {/* Stats Biomassa */}
      {latest && (
        <div className="mortality-summary">
          <div className="mortality-stat">
            <div className="mortality-stat-label">Avg Berat</div>
            <div className="mortality-stat-value">{parseFloat(latest.average_fish_weight_g).toFixed(1)}</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>gram/ekor</div>
          </div>
          <div className="mortality-stat success">
            <div className="mortality-stat-label">Total Biomassa</div>
            <div className="mortality-stat-value">{parseFloat(latest.estimated_biomass_kg).toFixed(1)}</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>kg</div>
          </div>
          <div className="mortality-stat">
            <div className="mortality-stat-label">Jumlah Sampel</div>
            <div className="mortality-stat-value">{latest.sample_count}</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>ekor di-sample</div>
          </div>
          <div className="mortality-stat">
            <div className="mortality-stat-label">Pakan/Jadwal</div>
            <div className="mortality-stat-value">{Math.round(latest.estimated_feed_per_schedule_g)}</div>
            <div className="text-xs text-muted" style={{ marginTop: 4 }}>gram</div>
          </div>
        </div>
      )}

      {/* Grafik Pertumbuhan */}
      {growthData.length >= 2 && (
        <div className="card mb-6">
          <div className="card-header">
            <div>
              <div className="card-title">📈 Riwayat Pertumbuhan Ikan</div>
              <div className="card-subtitle">Tren bobot rata-rata dari waktu ke waktu</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={growthData}>
              <defs>
                <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5edf2" />
              <XAxis dataKey="date" stroke="#7b94a8" fontSize={12} />
              <YAxis stroke="#7b94a8" fontSize={12} label={{ value: 'gram', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #dbe7ef', borderRadius: 8 }}
                formatter={(v, name) => name === 'weight' ? [`${v.toFixed(1)} g`, 'Avg Berat'] : [`${v.toFixed(2)} kg`, 'Biomassa']}
              />
              <Area type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2} fill="url(#growthGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Riwayat Sampling */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Riwayat Sampling Ikan</div>
            <div className="card-subtitle">100 sampel terakhir</div>
          </div>
        </div>
        {samples.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Scale size={28} /></div>
            <h3>Belum ada sampling</h3>
            <p>Lakukan sampling dari menu LCD device. Minimum {minSample} ikan untuk hasil valid.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Ikan ke-</th><th>Berat (gram)</th></tr>
              </thead>
              <tbody>
                {samples.map(s => (
                  <tr key={s.id}>
                    <td>{new Date(s.sampled_at).toLocaleString('id-ID')}</td>
                    <td>#{s.fish_no}</td>
                    <td><strong>{parseFloat(s.fish_weight_g).toFixed(1)} g</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
