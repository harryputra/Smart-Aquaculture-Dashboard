import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Calendar, History, Scale, Bug, Fish } from 'lucide-react';
import { getLeleSessions, getLeleErrors, getLeleBiomassSummary, getLeleBiomassSamples } from '../../services/leleApi';

export default function RiwayatAkhirPanel({ device }) {
  const [sessions, setSessions] = useState([]);
  const [errors, setErrors] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [samples, setSamples] = useState([]);
  const [activeTab, setActiveTab] = useState('summary');

  async function load() {
    try {
      const [s, e, sm, sp] = await Promise.all([
        getLeleSessions(device.device_id),
        getLeleErrors(device.device_id),
        getLeleBiomassSummary(device.device_id),
        getLeleBiomassSamples(device.device_id),
      ]);
      setSessions(s); setErrors(e); setSummaries(sm); setSamples(sp);
    } catch (e) { /* */ }
  }

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [device.device_id]);

  const sessionsBatched = sessions.flatMap(s => (s.batches || []).map(b => ({ ...b, session_name: s.session_name })));

  // Kelompokkan sample ikan per sesi sampling (sample tidak punya session_id eksplisit,
  // jadi dikelompokkan berdasarkan jarak waktu — gap > 10 menit dianggap sesi baru)
  const samplingSessions = [];
  {
    let current = [];
    let lastTime = null;
    for (const sm of samples) {
      const t = new Date(sm.sampled_at).getTime();
      if (lastTime && lastTime - t > 600000) {
        if (current.length) samplingSessions.push(current);
        current = [];
      }
      current.push(sm);
      lastTime = t;
    }
    if (current.length) samplingSessions.push(current);
  }
  const samplesFlat = samplingSessions.flatMap((group, idx) =>
    group.map(s => ({ ...s, session_label: `Sesi ${samplingSessions.length - idx}` }))
  );

  return (
    <>
      {/* Last 3 (mirror LCD history menu) */}
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">📍 Last Activity (sesuai LCD)</div>
            <div className="card-subtitle">LCD: Riwayat Akhir → Feed / Sampling / Error Terakhir</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {/* Last Feed */}
          <div style={{ padding: 16, background: device.last_feed_success ? 'var(--success-light)' : 'var(--danger-light)', borderRadius: 12, border: '2px solid ' + (device.last_feed_success ? 'var(--success)' : 'var(--danger)') }}>
            <div className="flex items-center gap-2 mb-2">
              {device.last_feed_success ? <CheckCircle size={18} /> : <XCircle size={18} />}
              <strong>Feed Terakhir</strong>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {device.last_feed_success ? 'SUKSES' : (device.last_feed_target_g > 0 ? 'GAGAL' : 'BELUM ADA')}
            </div>
            {device.last_feed_target_g > 0 && (
              <>
                <div className="text-xs" style={{ marginTop: 6 }}>Target: <strong>{parseFloat(device.last_feed_target_g).toFixed(0)}g</strong> | Aktual: <strong>{parseFloat(device.last_feed_actual_g).toFixed(0)}g</strong></div>
                <div className="text-xs">Batch: {device.last_feed_batch_count}</div>
                <div className="text-xs text-muted">{device.last_feed_time}</div>
              </>
            )}
          </div>

          {/* Last Sampling */}
          <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 12, border: '2px solid var(--accent-primary)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Scale size={18} />
              <strong>Sampling Akhir</strong>
            </div>
            {summaries[0] ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                  {parseFloat(summaries[0].average_fish_weight_g).toFixed(1)} g
                </div>
                <div className="text-xs">N: {summaries[0].sample_count} ikan × {summaries[0].fish_count} ekor</div>
                <div className="text-xs">Biomassa: <strong>{parseFloat(summaries[0].estimated_biomass_kg).toFixed(2)} kg</strong></div>
                <div className="text-xs text-muted">{new Date(summaries[0].summarized_at).toLocaleString('id-ID')}</div>
              </>
            ) : (
              <div className="text-xs text-muted">Belum ada</div>
            )}
          </div>

          {/* Last Error */}
          <div style={{ padding: 16, background: device.last_error_code === 'NONE' ? 'var(--success-light)' : 'var(--danger-light)', borderRadius: 12, border: '2px solid ' + (device.last_error_code === 'NONE' ? 'var(--success)' : 'var(--danger)') }}>
            <div className="flex items-center gap-2 mb-2">
              {device.last_error_code === 'NONE' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              <strong>Error Terakhir</strong>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{device.last_error_code || 'NONE'}</div>
            <div className="text-xs" style={{ marginTop: 6 }}>{device.last_error_msg || 'Tidak ada error'}</div>
            {device.last_error_time && device.last_error_time !== '-' && (
              <div className="text-xs text-muted">{device.last_error_time}</div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-tabs untuk full history */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">📊 Full History (dari dashboard)</div>
            <div className="card-subtitle">Data lengkap dari MQTT stream</div>
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={'tab' + (activeTab === 'summary' ? ' active' : '')} onClick={() => setActiveTab('summary')}>
            <History size={14} /> Sesi Pakan ({sessions.length})
          </button>
          <button className={'tab' + (activeTab === 'batch' ? ' active' : '')} onClick={() => setActiveTab('batch')}>
            <Calendar size={14} /> Batch Detail
          </button>
          <button className={'tab' + (activeTab === 'sampling' ? ' active' : '')} onClick={() => setActiveTab('sampling')}>
            <Scale size={14} /> Riwayat Sampling ({summaries.length})
          </button>
          <button className={'tab' + (activeTab === 'fish' ? ' active' : '')} onClick={() => setActiveTab('fish')}>
            <Fish size={14} /> Detail per Ikan
          </button>
          <button className={'tab' + (activeTab === 'errors' ? ' active' : '')} onClick={() => setActiveTab('errors')}>
            <Bug size={14} /> Error ({errors.length})
          </button>
        </div>

        {activeTab === 'summary' && (sessions.length === 0 ? (
          <div className="empty-state"><p>Belum ada sesi feeding</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Mulai</th><th>Sesi</th><th>Target (g)</th><th>Aktual (g)</th><th>Batch</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.feed_session_id}>
                    <td>{new Date(s.started_at).toLocaleString('id-ID')}</td>
                    <td><span className="badge badge-info">{s.session_name}</span></td>
                    <td>{parseFloat(s.target_total_g).toFixed(0)}</td>
                    <td>{s.actual_total_g ? parseFloat(s.actual_total_g).toFixed(0) : '-'}</td>
                    <td>{s.actual_batch_count || s.planned_batch_count}</td>
                    <td>{s.success ? <span className="badge badge-success">Sukses</span> :
                                     (s.completed_at ? <span className="badge badge-danger">Gagal</span> :
                                                       <span className="badge badge-warning">Berjalan</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {activeTab === 'batch' && (sessionsBatched.length === 0 ? (
          <div className="empty-state"><p>Belum ada batch tercatat</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Sesi</th><th>Batch</th><th>Target (g)</th><th>Aktual (g)</th><th>Spinner</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sessionsBatched.slice(0, 100).map((b, i) => (
                  <tr key={i}>
                    <td>{b.recorded_at ? new Date(b.recorded_at).toLocaleTimeString('id-ID') : '-'}</td>
                    <td className="text-xs">{b.session_name}</td>
                    <td>{b.batch_no}/{b.total_batches}</td>
                    <td>{parseFloat(b.target_g).toFixed(1)}</td>
                    <td style={{ fontWeight: 700 }}>{parseFloat(b.actual_g).toFixed(1)}</td>
                    <td><span className="badge badge-info">{b.spinner_direction}</span></td>
                    <td>{b.success ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {activeTab === 'sampling' && (summaries.length === 0 ? (
          <div className="empty-state"><p>Belum ada riwayat sampling</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Rata-rata Berat (g)</th><th>Jml Sample</th><th>Jml Ikan Kolam</th><th>Estimasi Biomassa (kg)</th><th>Pakan/Jadwal (g)</th></tr>
              </thead>
              <tbody>
                {summaries.map(sm => (
                  <tr key={sm.id}>
                    <td>{new Date(sm.summarized_at).toLocaleString('id-ID')}</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{parseFloat(sm.average_fish_weight_g).toFixed(2)}</td>
                    <td>{sm.sample_count}</td>
                    <td>{sm.fish_count}</td>
                    <td>{parseFloat(sm.estimated_biomass_kg).toFixed(2)}</td>
                    <td>{Math.round(sm.estimated_feed_per_schedule_g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {activeTab === 'fish' && (samplesFlat.length === 0 ? (
          <div className="empty-state"><p>Belum ada data berat ikan tercatat</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Sesi</th><th>Ikan #</th><th>Berat Aktual (g)</th></tr>
              </thead>
              <tbody>
                {samplesFlat.slice(0, 200).map((s, i) => (
                  <tr key={s.id || i}>
                    <td>{new Date(s.sampled_at).toLocaleString('id-ID')}</td>
                    <td><span className="badge badge-info">{s.session_label}</span></td>
                    <td>{s.fish_no}</td>
                    <td style={{ fontWeight: 700 }}>{parseFloat(s.fish_weight_g).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {activeTab === 'errors' && (errors.length === 0 ? (
          <div className="empty-state"><p>🎉 Tidak ada error tercatat</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Waktu</th><th>Code</th><th>Pesan</th></tr></thead>
              <tbody>
                {errors.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.occurred_at).toLocaleString('id-ID')}</td>
                    <td><span className="badge badge-danger">{e.code}</span></td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
