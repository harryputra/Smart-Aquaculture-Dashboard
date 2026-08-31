import { useEffect, useState } from 'react';
import {
  Utensils, Scale, Fish, Plus, Trash2, Save, Percent, AlertTriangle,
  Check, RefreshCw, Zap, Calculator,
} from 'lucide-react';
import { getFeedPlan, saveFeedPlan, getFeedPlanLastSampling, testFeedPlanSession } from '../services/api';
import { getSyncedSchedules, getLeleDevice } from '../services/leleApi';

const DEFAULT_SESSIONS = [
  { session_name: 'Pagi', session_time: '09:00', percent: 20, enabled: true },
  { session_name: 'Sore', session_time: '17:00', percent: 35, enabled: true },
  { session_name: 'Malam', session_time: '21:00', percent: 45, enabled: true },
];

const clampFeed = (g) => Math.min(5000, Math.max(0, Math.round(g)));

// Normalisasi bentuk jadwal dari 2 sumber berbeda ke satu bentuk seragam:
// - live_data.schedules (dari status MQTT terkini): { index, hour, minute, enabled, gram }
// - getSyncedSchedules() / lele_device_schedules (DB mirror): { schedule_index, hour, minute, enabled }
function normalizeDeviceSchedules(raw) {
  return (raw || []).map((x) => ({
    index: Number(x.index ?? x.schedule_index),
    hour: Number(x.hour),
    minute: Number(x.minute),
    enabled: !!x.enabled,
  }));
}

// Bandingkan sesi yang didefinisikan (form Rencana Pakan) dengan jadwal yang
// dilaporkan alat. Dicocokkan BERDASARKAN URUTAN (index ke-0,1,2,...), BUKAN
// berdasarkan string jam -- supaya kalau jam di alat sudah bergeser (mis. hasil
// edit manual di tab Jadwal Pakan Aktif), itu KETAHUAN sebagai ketidakcocokan,
// bukan malah lolos diam-diam karena "jam beda jadi dianggap sesi lain".
function compareSchedules(sessions, deviceSchedules) {
  const enabledSorted = [...sessions]
    .filter((s) => s.enabled !== false && /^\d{2}:\d{2}$/.test(s.session_time || ''))
    .sort((a, b) => String(a.session_time).localeCompare(String(b.session_time)))
    .slice(0, 6);
  const mismatches = [];
  enabledSorted.forEach((s, i) => {
    const [h, m] = s.session_time.split(':').map(Number);
    const dev = deviceSchedules.find((x) => x.index === i);
    if (!dev || !dev.enabled || dev.hour !== h || dev.minute !== m) {
      mismatches.push(s.session_name || `Sesi ${i + 1}`);
    }
  });
  // Arah sebaliknya: slot di alat yang ENABLED tapi index-nya di luar jumlah
  // sesi aktif rencana -- sisa dari edit manual lama yang tak lagi terdaftar.
  const extraIndexes = deviceSchedules.filter((x) => x.enabled && x.index >= enabledSorted.length).length;
  return { mismatches, extraIndexes };
}

function formatSecondsAgo(sec) {
  if (sec == null || sec < 0) return 'tidak diketahui';
  if (sec < 60) return `${sec} detik lalu`;
  if (sec < 3600) return `${Math.round(sec / 60)} menit lalu`;
  return `${Math.round(sec / 3600)} jam lalu`;
}

// Firmware >= 3.9.0 menyimpan jadwal (jam+gram) di alat & jalankan via RTC
// lokal — tak butuh koneksi saat jam sesi tiba. Sama seperti pengecekan versi
// di backend/feed-plan.js (isOfflineCap) — cek ini murni untuk teks info,
// bukan untuk logika kirim pakan (itu keputusan backend).
function isOfflineCapableFw(v) {
  const pa = String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = [3, 9, 0];
  for (let i = 0; i < 3; i++) { const a = pa[i] || 0, b = pb[i]; if (a > b) return true; if (a < b) return false; }
  return true;
}

export default function FeedPlanCard({ pondId, device }) {
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [verify, setVerify] = useState(null);   // null | {status:'checking'|'ok'|'mismatch'|'error', mismatches?}
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);  // null | {status:'checking'|'ok'|'mismatch'|'offline'|'error', mismatches?, extraIndexes?, secondsAgo?}

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
    setSaving(true); setMsg(null); setVerify(null);
    try {
      await saveFeedPlan(pondId, { ...plan, sessions });
      setMsg({ kind: 'ok', text: 'Rencana pakan tersimpan. Feeder akan diberi pakan sesuai porsi di tiap jam sesi.' });
      if (isOfflineCapableFw(device?.firmware_version) && device?.device_id) verifySync();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); } finally { setSaving(false); }
  }

  // Cek apakah jam yang baru disimpan BENAR-BENAR tersimpan di alat (bukan cuma
  // di database) — device melapor balik jadwalnya sendiri lewat status berkala,
  // dan backend menyimpannya di lele_device_schedules. Beri jeda dulu supaya
  // alat sempat terima & lapor balik semua pesan config yang baru dikirim.
  async function verifySync() {
    setVerify({ status: 'checking' });
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const synced = await getSyncedSchedules(device.device_id);
      const { mismatches, extraIndexes } = compareSchedules(sessions, normalizeDeviceSchedules(synced));
      setVerify(mismatches.length || extraIndexes ? { status: 'mismatch', mismatches, extraIndexes } : { status: 'ok' });
    } catch (e) { setVerify({ status: 'error' }); }
  }

  // Cek kapan saja (TIDAK harus sesudah Simpan) apakah alat SAAT INI benar-benar
  // menyimpan jadwal yang sama dengan yang sedang didefinisikan di form. Beda
  // dengan verifySync(): tidak ada delay 2500ms (bukan menunggu efek Simpan,
  // cuma membaca kondisi terkini apa adanya) dan tegas menandai kalau alat
  // sedang offline (data lama TIDAK ditampilkan seolah masih berlaku).
  async function checkSyncNow() {
    setChecking(true); setCheckResult({ status: 'checking' });
    try {
      const dev = await getLeleDevice(device.device_id);
      if (!dev.is_online) {
        const secondsAgo = dev.last_seen ? Math.round((Date.now() - new Date(dev.last_seen).getTime()) / 1000) : null;
        setCheckResult({ status: 'offline', secondsAgo });
        return;
      }
      const liveSch = dev.live_data?.schedules;
      const devSchedules = Array.isArray(liveSch) && liveSch.length
        ? normalizeDeviceSchedules(liveSch)
        : normalizeDeviceSchedules(await getSyncedSchedules(device.device_id));
      const { mismatches, extraIndexes } = compareSchedules(sessions, devSchedules);
      const secondsAgo = dev.last_seen ? Math.round((Date.now() - new Date(dev.last_seen).getTime()) / 1000) : null;
      setCheckResult({
        status: (mismatches.length || extraIndexes) ? 'mismatch' : 'ok',
        mismatches, extraIndexes, secondsAgo,
      });
    } catch (e) {
      setCheckResult({ status: 'error' });
    } finally {
      setChecking(false);
    }
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

      {verify && (
        <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: verify.status === 'ok' ? 'rgba(34,197,94,0.12)' : verify.status === 'checking' ? 'var(--bg-elevated)' : 'rgba(239,68,68,0.12)',
          color: verify.status === 'ok' ? '#15803d' : verify.status === 'checking' ? 'var(--text-secondary)' : '#b91c1c',
          border: `1px solid ${verify.status === 'ok' ? '#22c55e' : verify.status === 'checking' ? 'var(--border-primary)' : '#ef4444'}`,
          display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          {verify.status === 'checking' && <>🔄 Memverifikasi tersimpan di alat…</>}
          {verify.status === 'ok' && <><Check size={14} style={{ flexShrink: 0, marginTop: 1 }} /> Terverifikasi: semua sesi sudah dikonfirmasi tersimpan di alat.</>}
          {verify.status === 'mismatch' && (
            <>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              Alat belum mengonfirmasi jam yang benar untuk sesi: <strong>{verify.mismatches.join(', ')}</strong>.
              Coba klik Simpan Rencana sekali lagi (pastikan alat online/tersambung).
            </>
          )}
          {verify.status === 'error' && <>Tidak bisa memeriksa status alat sekarang — cek manual di tab Diagnostik.</>}
        </div>
      )}

      {checkResult && (
        <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: checkResult.status === 'ok' ? 'rgba(34,197,94,0.12)' : checkResult.status === 'checking' ? 'var(--bg-elevated)' : 'rgba(239,68,68,0.12)',
          color: checkResult.status === 'ok' ? '#15803d' : checkResult.status === 'checking' ? 'var(--text-secondary)' : '#b91c1c',
          border: `1px solid ${checkResult.status === 'ok' ? '#22c55e' : checkResult.status === 'checking' ? 'var(--border-primary)' : '#ef4444'}` }}>
          {checkResult.status === 'checking' && <>🔄 Mengecek jadwal langsung ke alat…</>}
          {checkResult.status === 'offline' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Alat sedang <strong>OFFLINE</strong> — tidak bisa dipastikan konsisten sekarang. Data terakhir dari alat: {formatSecondsAgo(checkResult.secondsAgo)}.</span>
            </div>
          )}
          {checkResult.status === 'ok' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Semua sesi cocok dengan alat. Alat online, data {formatSecondsAgo(checkResult.secondsAgo)}.</span>
            </div>
          )}
          {checkResult.status === 'mismatch' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Alat online (data {formatSecondsAgo(checkResult.secondsAgo)}), tapi{' '}
                {checkResult.mismatches?.length > 0 && <>sesi <strong>{checkResult.mismatches.join(', ')}</strong> TIDAK cocok dengan yang didefinisikan di sini.{' '}</>}
                {checkResult.extraIndexes > 0 && <>Ada {checkResult.extraIndexes} jadwal aktif di alat yang tidak terdaftar di Rencana Pakan ini (sisa edit manual lama).</>}
              </span>
            </div>
          )}
          {checkResult.status === 'error' && <>Tidak bisa memeriksa status alat sekarang — cek manual di tab Diagnostik.</>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !pctOk}>
          <Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan Rencana'}
        </button>
        <button className="btn btn-secondary" onClick={checkSyncNow} disabled={checking || device?.is_online === false}
          title={device?.is_online === false ? 'Alat sedang offline' : 'Bandingkan rencana ini dengan jadwal yang saat ini dilaporkan alat'}>
          <RefreshCw size={16} /> {checking ? 'Mengecek…' : 'Cek ke Alat Sekarang'}
        </button>
        {!pctOk && <span className="text-xs" style={{ color: 'var(--danger)' }}>Perbaiki total persen ke 100% dulu.</span>}
      </div>

      {isOfflineCapableFw(device?.firmware_version) ? (
        <p className="text-xs text-muted" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Check size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--success)' }} />
          Mode <strong>offline (onboard)</strong>: firmware alat ({device.firmware_version}) mendukung jadwal mandiri —
          jam &amp; gram tiap sesi sudah dikirim &amp; tersimpan di alat saat Anda menekan Simpan. Alat memberi pakan
          sendiri tepat waktu pakai jam internalnya (RTC), <strong>walau internet/server sedang mati</strong>. Simpan ulang
          rencana kalau Anda mengubah jam/persen agar jadwal di alat ikut ter-update.
        </p>
      ) : (
        <p className="text-xs text-muted" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          Mode <strong>online</strong>: server yang mengirim perintah ke feeder di tiap jam sesi. Saat rencana aktif, <strong>auto-feed onboard dimatikan</strong> (agar feeder tak memberi porsi bawaannya sendiri) — perlu feeder online saat disimpan. Jika alat/internet mati saat jam sesi, pemberian itu terlewat.
          {device?.firmware_version && (
            <> Update firmware alat ke 3.9.0 ke atas agar bisa jalan offline (lihat tab Pengaturan/Firmware).</>
          )}
        </p>
      )}
    </div>
  );
}
