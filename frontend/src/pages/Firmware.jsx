import { useEffect, useState, useRef } from 'react';
import {
  Cpu, UploadCloud, Trash2, Star, Wifi, WifiOff, ArrowUpCircle, CheckCircle, XCircle, Loader,
  Rocket, History, Octagon,
} from 'lucide-react';
import {
  getFirmwareList, uploadFirmware, deleteFirmware, setLatestFirmware, triggerOta, getLeleDevices,
  createRollout, getRollouts, abortRollout, getOtaLog,
} from '../services/leleApi';
import { useCan } from '../context/AuthContext';

const kb = (b) => (b ? (b / 1024).toFixed(0) + ' KB' : '-');
const fdt = (d) => (d ? new Date(d).toLocaleString('id-ID') : '-');

export default function Firmware() {
  const { role } = useCan();
  const canOta = role === 'pemilik' || role === 'superadmin';
  const [firmwares, setFirmwares] = useState([]);
  const [devices, setDevices] = useState([]);
  const [rollouts, setRollouts] = useState([]);
  const [log, setLog] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [form, setForm] = useState({ version: '', model: 'pakan_lele', notes: '' });

  async function loadFw() {
    try {
      const fw = await getFirmwareList();
      setFirmwares(fw);
      if (!targetId) { const latest = fw.find(f => f.is_latest) || fw[0]; if (latest) setTargetId(String(latest.id)); }
    } catch (e) { /* mungkin bukan Pemilik */ }
  }
  async function loadDyn() {
    try {
      const [d, ro, lg] = await Promise.all([getLeleDevices(), getRollouts().catch(() => []), getOtaLog().catch(() => [])]);
      setDevices(d); setRollouts(ro); setLog(lg);
    } catch (e) { /* */ }
  }
  useEffect(() => { loadFw(); loadDyn(); const t = setInterval(loadDyn, 2500); return () => clearInterval(t); }, []);

  const target = firmwares.find(f => String(f.id) === String(targetId));

  async function doUpload(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Pilih file .bin dulu.');
    if (!form.version.trim()) return alert('Isi versi.');
    setBusy(true);
    try {
      await uploadFirmware({ file, model: form.model, version: form.version.trim(), notes: form.notes });
      setForm({ version: '', model: 'pakan_lele', notes: '' });
      if (fileRef.current) fileRef.current.value = '';
      await loadFw();
    } catch (e2) { alert('Gagal upload: ' + e2.message); } finally { setBusy(false); }
  }

  async function update(deviceId) {
    if (!target) return alert('Pilih firmware target dulu.');
    if (!confirm(`Kirim update ke "${deviceId}" → v${target.version}?`)) return;
    try { await triggerOta(deviceId, target.id); loadDyn(); }
    catch (e) { alert('Gagal: ' + e.message); }
  }
  async function rolloutCanary() {
    if (!target) return alert('Pilih firmware target dulu.');
    const ids = devices.filter(d => d.is_online && d.firmware_version !== target.version).map(d => d.device_id);
    if (!ids.length) return alert('Semua device online sudah di versi target.');
    if (!confirm(`Rollout CANARY → v${target.version}\n\nUji 1 device dulu (${ids[0]}). Bila sehat di versi baru, sistem OTOMATIS sebar ke ${ids.length - 1} device lainnya. Bila gagal/timeout → dibatalkan.\n\nLanjut?`)) return;
    setBusy(true);
    try { await createRollout(target.id, ids); loadDyn(); }
    catch (e) { alert('Gagal: ' + e.message); } finally { setBusy(false); }
  }
  async function abort(id) {
    if (!confirm('Batalkan rollout ini?')) return;
    try { await abortRollout(id); loadDyn(); } catch (e) { alert('Gagal: ' + e.message); }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">⬆️ Firmware (OTA)</h1>
          <p className="page-subtitle">Update firmware ESP32 jarak jauh — unggah, lacak versi, kirim update</p></div>
      </div>

      {/* Upload */}
      {canOta && (
        <div className="card mb-6">
          <div className="card-header"><div className="card-title"><UploadCloud size={18} /> Unggah Firmware (.bin)</div></div>
          <form onSubmit={doUpload}>
            <div className="form-row">
              <div className="form-group"><label className="form-label">File .bin *</label>
                <input ref={fileRef} type="file" accept=".bin" className="form-input" /></div>
              <div className="form-group"><label className="form-label">Versi *</label>
                <input className="form-input" value={form.version} placeholder="mis. 3.6.0"
                  onChange={e => setForm({ ...form, version: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Model</label>
                <input className="form-input" value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Catatan</label>
                <input className="form-input" value={form.notes} placeholder="perubahan di versi ini"
                  onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <button className="btn btn-primary" disabled={busy}><UploadCloud size={16} /> {busy ? 'Mengunggah…' : 'Unggah'}</button>
            <span className="text-xs text-muted" style={{ marginLeft: 10 }}>sha256 dihitung otomatis di server.</span>
          </form>
        </div>
      )}

      {/* Katalog firmware */}
      <div className="card mb-6">
        <div className="card-header"><div className="card-title"><Cpu size={18} /> Katalog Firmware</div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Versi</th><th>Model</th><th>Ukuran</th><th>sha256</th><th>Diunggah</th><th></th></tr></thead>
            <tbody>
              {firmwares.length === 0 && <tr><td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 18 }}>Belum ada firmware diunggah.</td></tr>}
              {firmwares.map(f => (
                <tr key={f.id}>
                  <td><strong>{f.version}</strong> {f.is_latest && <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}><Star size={11} /> latest</span>}</td>
                  <td>{f.model}</td>
                  <td>{kb(f.size_bytes)}</td>
                  <td title={f.sha256} style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.sha256?.slice(0, 10)}…</td>
                  <td className="text-xs">{fdt(f.created_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canOta && !f.is_latest && <button className="btn btn-sm btn-secondary" onClick={() => setLatestFirmware(f.id).then(loadFw)} title="Jadikan latest"><Star size={13} /></button>}
                    {canOta && <button className="btn btn-sm btn-secondary" style={{ marginLeft: 6 }} onClick={() => confirm(`Hapus firmware v${f.version}?`) && deleteFirmware(f.id).then(loadFw)}><Trash2 size={13} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rollout canary aktif */}
      {rollouts.filter(r => r.status === 'canary').map(r => (
        <div key={r.id} className="alert alert-info mb-6" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <Rocket size={16} style={{ verticalAlign: '-2px' }} /> <strong>Rollout #{r.id} → v{r.version}</strong> —
            uji canary di <code>{r.canary_device_id}</code>, menunggu konfirmasi sehat…
            {' '}lalu sebar ke {Array.isArray(r.remaining) ? r.remaining.length : 0} device.
          </div>
          {canOta && <button className="btn btn-sm btn-secondary" onClick={() => abort(r.id)}><Octagon size={13} /> Batalkan</button>}
        </div>
      ))}

      {/* Matriks versi per device + update */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Cpu size={18} /> Status Versi per Device</div>
          {canOta && (
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <span className="text-xs text-muted">Target:</span>
              <select className="form-select" style={{ width: 'auto' }} value={targetId} onChange={e => setTargetId(e.target.value)}>
                {firmwares.map(f => <option key={f.id} value={f.id}>v{f.version}{f.is_latest ? ' (latest)' : ''}</option>)}
              </select>
              <button className="btn btn-sm btn-primary" disabled={busy || !target} onClick={rolloutCanary}
                title="Uji 1 device dulu, bila sehat otomatis sebar ke sisanya">
                <Rocket size={14} /> Rollout Canary
              </button>
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Device</th><th>Kolam</th><th>Status</th><th>Versi sekarang</th><th>OTA</th><th></th></tr></thead>
            <tbody>
              {devices.length === 0 && <tr><td colSpan={6} className="text-muted" style={{ textAlign: 'center', padding: 18 }}>Belum ada device.</td></tr>}
              {devices.map(d => {
                const onTarget = target && d.firmware_version === target.version;
                return (
                  <tr key={d.device_id}>
                    <td><div style={{ fontWeight: 600 }}>{d.name || d.device_id}</div><div className="text-xs text-muted" style={{ fontFamily: 'monospace' }}>{d.device_id}</div></td>
                    <td>{d.pond_name || <span className="text-muted">—</span>}</td>
                    <td><span className="badge" style={{ background: d.is_online ? '#d1fae5' : '#fee2e2', color: d.is_online ? '#047857' : '#b91c1c' }}>{d.is_online ? <Wifi size={12} /> : <WifiOff size={12} />} {d.is_online ? 'ONLINE' : 'OFFLINE'}</span></td>
                    <td>
                      {d.firmware_version || <span className="text-muted">?</span>}
                      {target && (onTarget
                        ? <span className="badge" style={{ background: '#d1fae5', color: '#047857', marginLeft: 6 }}>✓</span>
                        : <span className="badge" style={{ background: '#fef3c7', color: '#92400e', marginLeft: 6 }}>perlu update</span>)}
                    </td>
                    <td><OtaCell d={d} /></td>
                    <td>{canOta && <button className="btn btn-sm btn-primary" disabled={!d.is_online || !target || onTarget} onClick={() => update(d.device_id)}><ArrowUpCircle size={14} /> Update</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Riwayat / audit OTA */}
      <div className="card mt-6">
        <div className="card-header"><div className="card-title"><History size={18} /> Riwayat OTA</div></div>
        <div style={{ overflowX: 'auto', maxHeight: 320 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Waktu</th><th>Device</th><th>Event</th><th>Versi</th><th>Catatan</th></tr></thead>
            <tbody>
              {log.length === 0 && <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 16 }}>Belum ada riwayat.</td></tr>}
              {log.map(l => (
                <tr key={l.id}>
                  <td className="text-xs">{fdt(l.created_at)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.device_id}</td>
                  <td><EventBadge ev={l.event} /></td>
                  <td className="text-xs">{l.from_version ? `${l.from_version} → ` : ''}{l.to_version || '-'}</td>
                  <td className="text-xs text-muted">{l.detail || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EventBadge({ ev }) {
  const map = {
    trigger: { t: 'dikirim', bg: '#dbeafe', c: '#1d4ed8' },
    canary_start: { t: 'canary mulai', bg: '#ede9fe', c: '#6d28d9' },
    canary_ok: { t: 'canary sehat → sebar', bg: '#d1fae5', c: '#047857' },
    canary_fail: { t: 'canary gagal', bg: '#fee2e2', c: '#b91c1c' },
    canary_timeout: { t: 'canary timeout', bg: '#fef3c7', c: '#92400e' },
    success: { t: 'sukses', bg: '#d1fae5', c: '#047857' },
    fail: { t: 'gagal', bg: '#fee2e2', c: '#b91c1c' },
  };
  const m = map[ev] || { t: ev, bg: '#f3f4f6', c: '#374151' };
  return <span className="badge" style={{ background: m.bg, color: m.c }}>{m.t}</span>;
}

function OtaCell({ d }) {
  const st = d.ota_state;
  if (!st) return <span className="text-muted">-</span>;
  if (st === 'success') return <span style={{ color: '#047857' }}><CheckCircle size={13} /> sukses {d.ota_target_version && `v${d.ota_target_version}`}</span>;
  if (st === 'fail') return <span style={{ color: '#b91c1c' }}><XCircle size={13} /> gagal</span>;
  // triggered / downloading
  const pct = d.ota_progress || 0;
  return (
    <div style={{ minWidth: 120 }}>
      <div className="text-xs" style={{ color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Loader size={12} /> {st === 'downloading' ? `unduh ${pct}%` : 'menunggu device…'} {d.ota_target_version && `→ v${d.ota_target_version}`}
      </div>
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, marginTop: 3, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: '#3b82f6' }} />
      </div>
    </div>
  );
}
