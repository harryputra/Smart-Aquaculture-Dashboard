import { useEffect, useState } from 'react';
import {
  Utensils, Scale, Fish, Plus, Trash2, Save, Percent, AlertTriangle,
  Check, RefreshCw, Zap, Calculator,
} from 'lucide-react';
import { getFeedPlan, saveFeedPlan, getFeedPlanLastSampling, testFeedPlanSession } from '../services/api';

const DEFAULT_SESSIONS = [
  { session_name: 'Pagi', session_time: '09:00', percent: 20, enabled: true },
  { session_name: 'Sore', session_time: '17:00', percent: 35, enabled: true },
  { session_name: 'Malam', session_time: '21:00', percent: 45, enabled: true },
];

const clampFeed = (g) => Math.min(5000, Math.max(0, Math.round(g)));

export default function FeedPlanCard({ pondId }) {
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await getFeedPlan(pondId);
      setPlan({
        enabled: r.plan.enabled !== false,
        fish_count: r.plan.fish_count || 0,
        avg_weight_g: r.plan.avg_weight_g || 0,
        feeding_rate_percent: r.plan.feeding_rate_percent || 3,
        biomass_source: r.plan.biomass_source || 'manual',
      });
      const s = (r.sessions && r.sessions.length ? r.sessions : DEFAULT_SESSIONS).map((x) => ({
        session_name: x.session_name || '', session_time: (x.session_time || '').slice(0, 5),
        percent: Number(x.percent) || 0, enabled: x.enabled !== false,
      }));
      setSessions(s);
    } catch (e) { setMsg({ kind: 'err', text: e.message }); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pondId]);

  if (loading || !plan) return <div className="card"><div className="loading"><div className="spinner" /></div></div>;

  const num = (v) => Number(v) || 0;
  const daily = Math.round(num(plan.fish_count) * num(plan.avg_weight_g) * num(plan.feeding_rate_percent) / 100);
  const biomassaKg = Math.round(num(plan.fish_count) * num(plan.avg_weight_g) / 100) / 10;
  const totalPct = Math.round(sessions.reduce((a, s) => a + num(s.percent), 0) * 10) / 10;
  const gramsOf = (pct) => clampFeed(daily * num(pct) / 100);
  const pctOk = Math.abs(totalPct - 100) < 0.1;

  const setP = (k, v) => setPlan((p) => ({ ...p, [k]: v }));
  const setS = (i, k, v) => setSessions((arr) => arr.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const addSession = () => setSessions((a) => [...a, { session_name: '', session_time: '12:00', percent: 0, enabled: true }]);
  const delSession = (i) => setSessions((a) => a.filter((_, j) => j !== i));

  function presetTiga() { setSessions(DEFAULT_SESSIONS.map((x) => ({ ...x }))); }
  function presetMerata() {
    const n = sessions.length || 1;
    const base = Math.floor((100 / n) * 10) / 10;
    setSessions((a) => a.map((s, i) => ({ ...s, percent: i === n - 1 ? Math.round((100 - base * (n - 1)) * 10) / 10 : base })));
  }

  async function pullSampling() {
    try {
      const r = await getFeedPlanLastSampling(pondId);
      if (!r.avg_weight_g) { setMsg({ kind: 'err', text: 'Belum ada data sampling biomassa di feeder kolam ini.' }); return; }
      setPlan((p) => ({
        ...p, avg_weight_g: r.avg_weight_g, biomass_source: 'sampling',
        fish_count: p.fish_count || r.fish_count || 0,
        feeding_rate_percent: r.rate_suggest || p.feeding_rate_percent,
      }));
      setMsg({ kind: 'ok', text: `Bobot rata² ${r.avg_weight_g} g diambil dari sampling. Laju pakan disarankan ${r.rate_suggest}%.` });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await saveFeedPlan(pondId, { ...plan, sessions });
      setMsg({ kind: 'ok', text: 'Rencana pakan tersimpan. Feeder akan diberi pakan sesuai porsi di tiap jam sesi.' });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); } finally { setSaving(false); }
  }

  async function testFeed(pct, name) {
    const grams = gramsOf(pct);
    if (grams < 10) { setMsg({ kind: 'err', text: 'Porsi < 10 g, tak bisa diuji.' }); return; }
    if (!confirm(`Uji beri pakan ${grams} g (${name || 'sesi'}) SEKARANG?`)) return;
    try { const r = await testFeedPlanSession(pondId, grams); setMsg({ kind: 'ok', text: `Perintah beri ${r.grams} g dikirim ke feeder.` }); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  }

  const fld = { padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', width: '100%', fontSize: 14 };

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div>
          <div className="card-title"><Utensils size={18} style={{ verticalAlign: -3 }} /> Rencana Pakan Harian</div>
          <div className="card-subtitle">Bagi kebutuhan harian ke beberapa sesi berdasarkan persen — sistem beri pakan otomatis di tiap jam.</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          <input type="checkbox" checked={plan.enabled} onChange={(e) => setP('enabled', e.target.checked)} /> Aktif
        </label>
      </div>

      {/* ---- BIOMASSA & KEBUTUHAN HARIAN ---- */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Scale size={15} /> Biomassa &amp; Kebutuhan Pakan
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <label><div className="text-xs text-muted" style={{ marginBottom: 4 }}><Fish size={12} style={{ verticalAlign: -2 }} /> Jumlah ikan (ekor)</div>
            <input style={fld} type="number" min="0" value={plan.fish_count} onChange={(e) => setP('fish_count', e.target.value)} /></label>
          <label><div className="text-xs text-muted" style={{ marginBottom: 4 }}>Bobot rata² (g/ekor)</div>
            <input style={fld} type="number" min="0" step="0.1" value={plan.avg_weight_g}
              onChange={(e) => { setP('avg_weight_g', e.target.value); setP('biomass_source', 'manual'); }} /></label>
          <label><div className="text-xs text-muted" style={{ marginBottom: 4 }}>Laju pakan (% biomassa/hari)</div>
            <input style={fld} type="number" min="0" step="0.1" value={plan.feeding_rate_percent} onChange={(e) => setP('feeding_rate_percent', e.target.value)} /></label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={pullSampling}>
              <RefreshCw size={14} /> Ambil dari sampling
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><span className="text-xs text-muted">Biomassa total</span><div style={{ fontWeight: 800, fontSize: 18 }}>{biomassaKg.toLocaleString('id-ID')} kg</div></div>
          <div style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent-primary)' }}>
            <span className="text-xs" style={{ opacity: 0.8 }}><Calculator size={12} style={{ verticalAlign: -2 }} /> Kebutuhan pakan / hari</span>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{daily.toLocaleString('id-ID')} g <span style={{ fontSize: 13, fontWeight: 600 }}>({(daily / 1000).toFixed(2)} kg)</span></div>
          </div>
          <span className="text-xs text-muted">sumber bobot: {plan.biomass_source === 'sampling' ? 'sampling alat' : 'input manual'}</span>
        </div>
      </div>

      {/* ---- SESI (PERSEN → GRAM) ---- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}><Percent size={14} style={{ verticalAlign: -2 }} /> Distribusi per Sesi</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={presetTiga} title="Pagi 20% / Sore 35% / Malam 45%">Preset 20·35·45</button>
          <button className="btn btn-secondary btn-sm" onClick={presetMerata}>Bagi rata</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: 520 }}>
          <thead><tr>
            <th style={{ textAlign: 'left' }}>Sesi</th><th>Jam</th><th style={{ width: 90 }}>Persen</th>
            <th style={{ textAlign: 'right' }}>Gram</th><th>Aktif</th><th></th>
          </tr></thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={i}>
                <td><input style={{ ...fld, minWidth: 90 }} value={s.session_name} placeholder={`Sesi ${i + 1}`} onChange={(e) => setS(i, 'session_name', e.target.value)} /></td>
                <td><input style={{ ...fld, width: 105 }} type="time" value={s.session_time} onChange={(e) => setS(i, 'session_time', e.target.value)} /></td>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><input style={{ ...fld, width: 64, textAlign: 'right' }} type="number" min="0" max="100" step="0.5" value={s.percent} onChange={(e) => setS(i, 'percent', e.target.value)} /><span className="text-xs">%</span></div></td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{gramsOf(s.percent).toLocaleString('id-ID')} g</td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={s.enabled} onChange={(e) => setS(i, 'enabled', e.target.checked)} /></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-secondary btn-sm" title="Uji beri sekarang" onClick={() => testFeed(s.percent, s.session_name)} style={{ padding: '4px 8px' }}><Zap size={13} /></button>
                  <button className="btn btn-secondary btn-sm" title="Hapus sesi" onClick={() => delSession(i)} style={{ padding: '4px 8px', marginLeft: 4 }}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr style={{ borderTop: '2px solid var(--border-primary)' }}>
            <td colSpan={2}><button className="btn btn-secondary btn-sm" onClick={addSession}><Plus size={14} /> Tambah sesi</button></td>
            <td style={{ textAlign: 'right', fontWeight: 800, color: pctOk ? 'var(--success)' : 'var(--danger)' }}>{totalPct}%</td>
            <td style={{ textAlign: 'right', fontWeight: 800 }}>{sessions.reduce((a, s) => a + gramsOf(s.percent), 0).toLocaleString('id-ID')} g</td>
            <td colSpan={2}>{pctOk ? <span className="text-xs" style={{ color: 'var(--success)' }}><Check size={12} /> pas 100%</span> : <span className="text-xs" style={{ color: 'var(--danger)' }}><AlertTriangle size={12} /> total harus 100%</span>}</td>
          </tr></tfoot>
        </table>
      </div>

      {msg && (
        <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: msg.kind === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: msg.kind === 'ok' ? '#15803d' : '#b91c1c', border: `1px solid ${msg.kind === 'ok' ? '#22c55e' : '#ef4444'}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !pctOk}>
          <Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan Rencana'}
        </button>
        {!pctOk && <span className="text-xs" style={{ color: 'var(--danger)' }}>Perbaiki total persen ke 100% dulu.</span>}
      </div>

      <p className="text-xs text-muted" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        Mode <strong>online</strong>: server yang mengirim perintah ke feeder di tiap jam sesi (feeder otomatis diset ke Manual agar tak dobel dengan jadwal onboard). Jika alat/internet mati saat jam sesi, pemberian itu terlewat — nanti akan dipindah ke firmware agar jalan offline.
      </p>
    </div>
  );
}
