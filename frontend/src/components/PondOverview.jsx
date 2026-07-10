import { useEffect, useState } from 'react';
import { Droplet, Utensils, Skull, Wallet, ChevronRight, Wind } from 'lucide-react';
import { getPondOverview } from '../services/api';

const CSS = `
.pov-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin-bottom:14px;}
.pov-card{text-align:left;background:var(--bg-elevated,#fff);border:1px solid var(--border-primary,#e2e8f0);
  border-radius:14px;padding:14px 15px;cursor:pointer;transition:border-color .16s,box-shadow .16s,transform .16s;}
.pov-card:hover{border-color:#22c3dd;box-shadow:0 8px 20px rgba(6,182,212,.12);transform:translateY(-1px);}
.pov-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.pov-titl{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--text-secondary,#475569);
  text-transform:uppercase;letter-spacing:.04em;}
.pov-ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;}
.pov-more{color:#94a3b8;display:flex;align-items:center;gap:2px;font-size:11px;}
.pov-card:hover .pov-more{color:#06b6d4;}
.pov-sg{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;}
.pov-s{border-radius:8px;padding:6px 4px;text-align:center;background:var(--bg-tertiary,#f1f5f9);}
.pov-s b{display:block;font-size:14px;font-weight:700;line-height:1.15;}
.pov-s span{font-size:9.5px;opacity:.7;}
.pov-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;margin:0 5px 5px 0;}
.pov-big{font-size:22px;font-weight:800;line-height:1.1;letter-spacing:-.01em;}
.pov-muted{font-size:12px;color:var(--text-muted,#94a3b8);}
.pov-row{display:flex;justify-content:space-between;font-size:12.5px;padding:2px 0;}
`;

const fnum = (v, d = 1) => (v == null ? '–' : Number(v).toFixed(d));
const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

function sensColor(key, v, t) {
  if (v == null || !t) return { bg: 'var(--bg-tertiary,#f1f5f9)', c: 'var(--text-primary,#0f172a)' };
  const n = Number(v);
  const bad = { bg: '#fee2e2', c: '#b91c1c' }, warn = { bg: '#fef3c7', c: '#92400e' }, ok = { bg: '#f1f5f9', c: '#0f172a' };
  if (key === 'temperature') return n > t.temp_max ? bad : n < t.temp_min ? warn : ok;
  if (key === 'dissolved_oxygen') return n < t.do_min ? bad : ok;
  if (key === 'turbidity') return n > t.turbidity_max ? bad : ok;
  if (key === 'ph') return (n < t.ph_min || n > t.ph_max) ? warn : ok;
  if (key === 'depth') return n < t.depth_min ? warn : ok;
  return ok;
}

export default function PondOverview({ pondId, onGoTab }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    let on = true;
    async function load() { try { const r = await getPondOverview(pondId); if (on) setD(r); } catch (e) { /* */ } }
    load(); const t = setInterval(load, 6000);
    return () => { on = false; clearInterval(t); };
  }, [pondId]);

  if (!d) return null;
  const s = d.sensor, t = d.threshold, c = d.cycle, f = d.feeding, m = d.financial;
  const SENS = [
    { k: 'temperature', l: 'Suhu', u: '°C', dc: 1 },
    { k: 'dissolved_oxygen', l: 'DO', u: '', dc: 1 },
    { k: 'ph', l: 'pH', u: '', dc: 1 },
    { k: 'turbidity', l: 'Keruh', u: '', dc: 0 },
    { k: 'depth', l: 'Dalam', u: 'cm', dc: 0 },
  ];

  return (
    <div>
      <style>{CSS}</style>
      <div className="pov-grid">

        {/* Kualitas Air */}
        <div className="pov-card" onClick={() => onGoTab('monitor')}>
          <div className="pov-head">
            <div className="pov-titl"><span className="pov-ico" style={{ background: '#e0f2fe', color: '#0369a1' }}><Droplet size={16} /></span> Kualitas Air</div>
            <span className="pov-more">Monitor <ChevronRight size={13} /></span>
          </div>
          {s ? (
            <>
              <div className="pov-sg">
                {SENS.slice(0, 3).map(x => { const cc = sensColor(x.k, s[x.k], t); return (
                  <div key={x.k} className="pov-s" style={{ background: cc.bg, color: cc.c }}><b>{fnum(s[x.k], x.dc)}</b><span>{x.l}{x.u ? ' ' + x.u : ''}</span></div>); })}
              </div>
              <div className="pov-sg" style={{ marginTop: 5 }}>
                {SENS.slice(3).map(x => { const cc = sensColor(x.k, s[x.k], t); return (
                  <div key={x.k} className="pov-s" style={{ background: cc.bg, color: cc.c }}><b>{fnum(s[x.k], x.dc)}</b><span>{x.l}{x.u ? ' ' + x.u : ''}</span></div>); })}
                <div className="pov-s" style={{ background: s.aerator_on ? '#d1fae5' : 'var(--bg-tertiary,#f1f5f9)', color: s.aerator_on ? '#047857' : 'inherit' }}>
                  <b><Wind size={13} style={{ verticalAlign: -2 }} /></b><span>{s.aerator_on ? 'Aerator ON' : 'Aerator'}</span></div>
              </div>
            </>
          ) : <div className="pov-muted">Belum ada data sensor (Mode Dummy).</div>}
        </div>

        {/* Pakan Hari Ini */}
        <div className="pov-card" onClick={() => onGoTab('feeding')}>
          <div className="pov-head">
            <div className="pov-titl"><span className="pov-ico" style={{ background: '#fef3c7', color: '#92400e' }}><Utensils size={16} /></span> Pakan Hari Ini</div>
            <span className="pov-more">Pakan <ChevronRight size={13} /></span>
          </div>
          {!f.has_device ? (
            <div className="pov-muted">Belum ada feeder terhubung ke kolam ini.</div>
          ) : (
            <>
              <div style={{ marginBottom: 6, fontSize: 13 }}>
                Jadwal <b>{f.scheduled_per_day || '?'}×/hari</b>
                {f.next_hhmm ? <span className="pov-muted"> · berikutnya {f.next_hhmm}</span> : null}
              </div>
              {f.today_total === 0 ? (
                <div className="pov-muted">Belum ada pemberian hari ini.</div>
              ) : (
                <div>
                  {f.sessions.map((x, i) => (
                    <span key={i} className="pov-pill" title={x.actual_g != null ? `${x.actual_g} g` : ''}
                      style={x.success === true ? { background: '#d1fae5', color: '#047857' } : x.success === false ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#f1f5f9', color: '#64748b' }}>
                      {new Date(x.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · {x.success === true ? 'berhasil' : x.success === false ? 'gagal' : 'proses'}
                    </span>
                  ))}
                  <div className="pov-muted" style={{ marginTop: 2 }}>{f.today_success} berhasil · {f.today_fail} gagal · {f.today_total} total</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Kematian & SR */}
        <div className="pov-card" onClick={() => onGoTab('mortality')}>
          <div className="pov-head">
            <div className="pov-titl"><span className="pov-ico" style={{ background: '#fee2e2', color: '#b91c1c' }}><Skull size={16} /></span> Kematian & SR</div>
            <span className="pov-more">Kematian <ChevronRight size={13} /></span>
          </div>
          {c ? (
            <>
              <div className="pov-big" style={{ color: c.survival_rate >= 85 ? '#047857' : c.survival_rate < 70 ? '#b91c1c' : 'inherit' }}>{fnum(c.survival_rate)}% <span style={{ fontSize: 12, fontWeight: 500 }} className="pov-muted">SR</span></div>
              <div className="pov-muted" style={{ marginTop: 3 }}>Mati {c.deaths} ekor · hidup {c.population} / {c.initial_stock}</div>
            </>
          ) : <div className="pov-muted">Belum ada siklus aktif.</div>}
        </div>

        {/* Keuangan */}
        <div className="pov-card" onClick={() => onGoTab('financial')}>
          <div className="pov-head">
            <div className="pov-titl"><span className="pov-ico" style={{ background: '#dcfce7', color: '#15803d' }}><Wallet size={16} /></span> Keuangan</div>
            <span className="pov-more">Keuangan <ChevronRight size={13} /></span>
          </div>
          {m ? (
            <>
              <div className="pov-big">{rp(m.total_cost)}</div>
              <div className="pov-muted" style={{ marginBottom: 4 }}>total biaya siklus</div>
              <div className="pov-row"><span className="pov-muted">Benih</span><span>{rp(m.fry_cost)}</span></div>
              <div className="pov-row"><span className="pov-muted">Pakan</span><span>{rp(m.feed_cost)}</span></div>
              <div className="pov-row"><span className="pov-muted">Operasional</span><span>{rp(m.op_cost)}</span></div>
            </>
          ) : <div className="pov-muted">Belum ada siklus aktif.</div>}
        </div>

      </div>
    </div>
  );
}
