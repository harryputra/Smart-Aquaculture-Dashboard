import { useEffect, useState, Fragment } from 'react';
import { Cpu, Wifi, WifiOff, Utensils, History } from 'lucide-react';
import { getPondFeeder } from '../services/api';

const MODE = { manual: 'Manual', jadwal: 'Jadwal', auto: 'Auto' };
const fdate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }) : '-');
const ftime = (d) => (d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-');
const g = (v) => (v == null ? '–' : Math.round(Number(v)) + ' g');

function StatusBadge({ s, done }) {
  if (s === true) return <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}>Berhasil</span>;
  if (s === false) return <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>Gagal</span>;
  return <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>{done ? 'Selesai' : 'Proses'}</span>;
}

export default function FeederDetail({ pondId }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    let on = true;
    async function load() { try { const r = await getPondFeeder(pondId); if (on) setD(r); } catch (e) { /* */ } }
    load(); const t = setInterval(load, 8000);
    return () => { on = false; clearInterval(t); };
  }, [pondId]);

  if (!d) return null;
  if (!d.has_device) {
    return (
      <div className="alert alert-info mb-6" style={{ fontSize: 12.5 }}>
        <Cpu size={16} /> Kolam ini belum terhubung ke <strong>feeder lele</strong>. Hubungkan perangkat di menu <strong>Perangkat</strong> untuk melihat gramasi & riwayat sesi otomatis. (Pencatatan manual di bawah tetap bisa dipakai.)
      </div>
    );
  }

  const s = d.settings;
  const tiles = [
    { l: 'Mode pakan', v: MODE[s.feed_mode] || s.feed_mode },
    { l: 'Feeding rate', v: s.feeding_rate_percent != null ? s.feeding_rate_percent + ' %' : '–' },
    { l: 'Pemberian/hari', v: s.feeding_per_day || '–' },
    { l: 'Bobot rata²', v: s.avg_fish_g ? s.avg_fish_g.toFixed(0) + ' g' : 'belum sampling' },
    { l: 'Populasi', v: s.fish_count || '–' },
    { l: 'Pakan/hari', v: g(s.daily_feed_g) },
    { l: 'Per pemberian', v: g(s.per_schedule_g) },
    { l: 'Berikutnya', v: s.next_schedule_hhmm || '–' },
  ];

  let lastDate = null;

  return (
    <>
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title"><Utensils size={18} /> Detail Feeder &amp; Gramasi</div>
          <span className="badge" style={{ background: s.is_online ? '#d1fae5' : '#fee2e2', color: s.is_online ? '#047857' : '#b91c1c' }}>
            {s.is_online ? <Wifi size={12} /> : <WifiOff size={12} />} {s.name || s.device_id}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
          {tiles.map(t => (
            <div key={t.l} style={{ background: 'var(--bg-tertiary,#f1f5f9)', borderRadius: 10, padding: '9px 10px' }}>
              <div className="text-xs text-muted">{t.l}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.v}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>
          Gramasi dihitung otomatis: pakan/hari = populasi × bobot rata² × feeding rate; per pemberian = pakan/hari ÷ pemberian per hari.
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header"><div className="card-title"><History size={18} /> Riwayat Sesi Feeder (per tanggal)</div></div>
        {(!d.sessions || d.sessions.length === 0) ? (
          <div className="empty-state"><p>Belum ada sesi pemberian pakan dari feeder.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead><tr><th>Waktu</th><th>Sesi</th><th style={{ textAlign: 'right' }}>Target</th><th style={{ textAlign: 'right' }}>Aktual</th><th style={{ textAlign: 'right' }}>Batch</th><th>Status</th></tr></thead>
              <tbody>
                {d.sessions.map((x, i) => {
                  const dt = fdate(x.started_at);
                  const showDate = dt !== lastDate; lastDate = dt;
                  return (
                    <Fragment key={i}>
                      {showDate && (
                        <tr><td colSpan={6} style={{ background: 'var(--bg-tertiary,#f1f5f9)', fontWeight: 700, fontSize: 12 }}>{dt}</td></tr>
                      )}
                      <tr>
                        <td>{ftime(x.started_at)}</td>
                        <td>{x.session_name || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{g(x.target_total_g)}</td>
                        <td style={{ textAlign: 'right' }}>{g(x.actual_total_g)}</td>
                        <td style={{ textAlign: 'right' }}>{x.actual_batch_count ?? '–'}{x.planned_batch_count ? '/' + x.planned_batch_count : ''}</td>
                        <td><StatusBadge s={x.success} done={!!x.completed_at} /></td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
