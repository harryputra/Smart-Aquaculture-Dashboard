import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, History, Utensils, Scale } from 'lucide-react';
import { getLeleLastActivity, getLeleSessions, getLeleErrors } from '../../services/leleApi';

export default function LastActivityPanel({ deviceId }) {
  const [last, setLast] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [errors, setErrors] = useState([]);
  const [subTab, setSubTab] = useState('summary');
  const [expanded, setExpanded] = useState(null);

  async function load() {
    try {
      const [l, s, e] = await Promise.all([
        getLeleLastActivity(deviceId),
        getLeleSessions(deviceId),
        getLeleErrors(deviceId),
      ]);
      setLast(l);
      setSessions(s);
      setErrors(e);
    } catch (e) { /* */ }
  }

  useEffect(() => { load(); }, [deviceId]);

  return (
    <>
      {/* Mirror LCD: ringkasan terakhir */}
      {last && (
        <div className="stats-grid">
          {last.last_feed ? (
            <div className="stat-card" style={{ background: last.last_feed.success ? 'linear-gradient(135deg, #d1fae5, #fff)' : 'linear-gradient(135deg, #fee2e2, #fff)' }}>
              <div className="stat-card-icon" style={{ background: last.last_feed.success ? '#10b981' : '#ef4444', color: 'white' }}>
                {last.last_feed.success ? <CheckCircle size={22} /> : <XCircle size={22} />}
              </div>
              <div className="stat-card-label">Feeding Terakhir</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>
                {last.last_feed.success ? 'OK' : 'GAGAL'}
              </div>
              <div className="stat-card-subtext">
                Total: {last.last_feed.actual_total_g ? parseFloat(last.last_feed.actual_total_g).toFixed(0) : '-'} g
                {' · '}
                {last.last_feed.completed_at && new Date(last.last_feed.completed_at).toLocaleTimeString('id-ID')}
              </div>
            </div>
          ) : (
            <div className="stat-card">
              <div className="stat-card-icon"><Utensils size={22} /></div>
              <div className="stat-card-label">Feeding Terakhir</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>-</div>
              <div className="stat-card-subtext">Belum ada</div>
            </div>
          )}

          {last.last_biomass ? (
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><Scale size={22} /></div>
              <div className="stat-card-label">Sampling Terakhir</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>
                {parseFloat(last.last_biomass.average_fish_weight_g).toFixed(1)} g
              </div>
              <div className="stat-card-subtext">
                {last.last_biomass.sample_count} ikan · {new Date(last.last_biomass.summarized_at).toLocaleDateString('id-ID')}
              </div>
            </div>
          ) : (
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: '#fef3c7', color: '#b45309' }}><Scale size={22} /></div>
              <div className="stat-card-label">Sampling Terakhir</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>-</div>
              <div className="stat-card-subtext">Belum ada</div>
            </div>
          )}

          {last.last_error ? (
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #fee2e2, #fff)' }}>
              <div className="stat-card-icon" style={{ background: '#ef4444', color: 'white' }}><AlertTriangle size={22} /></div>
              <div className="stat-card-label">Error Terakhir</div>
              <div className="stat-card-value" style={{ fontSize: 14 }}>{last.last_error.code}</div>
              <div className="stat-card-subtext" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {new Date(last.last_error.occurred_at).toLocaleString('id-ID')}
              </div>
            </div>
          ) : (
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: '#d1fae5', color: '#047857' }}><CheckCircle size={22} /></div>
              <div className="stat-card-label">Error Terakhir</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>Tidak ada</div>
              <div className="stat-card-subtext">Sistem sehat</div>
            </div>
          )}
        </div>
      )}

      {/* Sub tabs */}
      <div className="tabs">
        <button className={'tab' + (subTab === 'summary' ? ' active' : '')} onClick={() => setSubTab('summary')}>
          <History size={16} /> Riwayat Feeding
        </button>
        <button className={'tab' + (subTab === 'batch' ? ' active' : '')} onClick={() => setSubTab('batch')}>
          <Utensils size={16} /> Detail Batch
        </button>
        <button className={'tab' + (subTab === 'errors' ? ' active' : '')} onClick={() => setSubTab('errors')}>
          <AlertTriangle size={16} /> Log Error
        </button>
      </div>

      {subTab === 'summary' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Riwayat Sesi Feeding</div>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state"><p>Belum ada riwayat</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Mulai</th><th>Selesai</th><th>Sesi</th><th>Target</th><th>Aktual</th><th>Batch</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id}>
                      <td>{new Date(s.started_at).toLocaleString('id-ID')}</td>
                      <td>{s.completed_at ? new Date(s.completed_at).toLocaleTimeString('id-ID') : '-'}</td>
                      <td>{s.session_name}</td>
                      <td>{parseFloat(s.target_total_g).toFixed(0)} g</td>
                      <td><strong>{s.actual_total_g ? parseFloat(s.actual_total_g).toFixed(0) : '-'} g</strong></td>
                      <td>{s.actual_batch_count || s.planned_batch_count}</td>
                      <td>
                        <span className={`badge ${s.success === null ? 'badge-neutral' : s.success ? 'badge-success' : 'badge-danger'}`}>
                          {s.success === null ? 'Berjalan' : s.success ? 'Sukses' : 'Gagal'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'batch' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Detail Batch per Sesi</div>
            <div className="card-subtitle">Klik sesi untuk lihat detail batch</div>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state"><p>Belum ada data</p></div>
          ) : (
            <div className="notification-list">
              {sessions.map(s => (
                <div key={s.id} className={`notification-item ${s.success === false ? 'critical' : s.success ? 'success' : 'info'}`}>
                  <div className={`notification-icon ${s.success === false ? 'critical' : 'success'}`}>
                    {s.success === false ? <XCircle size={18} /> : <CheckCircle size={18} />}
                  </div>
                  <div className="notification-content" style={{ cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    <div className="notification-title">
                      {s.session_name} — {parseFloat(s.target_total_g).toFixed(0)}g target / {s.actual_total_g ? parseFloat(s.actual_total_g).toFixed(0) : 0}g aktual
                    </div>
                    <div className="notification-message">
                      {s.actual_batch_count || s.planned_batch_count} batch · klik untuk {expanded === s.id ? 'sembunyikan' : 'lihat'} detail
                    </div>
                    <div className="notification-time">{new Date(s.started_at).toLocaleString('id-ID')}</div>

                    {expanded === s.id && s.batches && (
                      <div className="table-wrap" style={{ marginTop: 12 }}>
                        <table>
                          <thead>
                            <tr><th>Batch</th><th>Target</th><th>Aktual</th><th>Arah</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {s.batches.map(b => (
                              <tr key={b.id}>
                                <td>#{b.batch_no}/{b.total_batches}</td>
                                <td>{parseFloat(b.target_g).toFixed(1)}g</td>
                                <td>{parseFloat(b.actual_g).toFixed(1)}g</td>
                                <td><span className="badge badge-info">{b.spinner_direction}</span></td>
                                <td><span className={`badge ${b.success ? 'badge-success' : 'badge-danger'}`}>
                                  {b.success ? 'OK' : 'Gagal'}
                                </span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'errors' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Log Error</div>
            <div className="card-subtitle">50 error terakhir</div>
          </div>
          {errors.length === 0 ? (
            <div className="empty-state"><p>✅ Tidak ada error tercatat</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Waktu</th><th>Kode</th><th>Pesan</th></tr>
                </thead>
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
          )}
        </div>
      )}
    </>
  );
}
