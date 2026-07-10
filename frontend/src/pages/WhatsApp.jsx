import { useEffect, useState } from 'react';
import { MessageCircle, Plus, Trash2, Pencil, Send, X, Settings, History } from 'lucide-react';
import {
  getWaConfig, setWaConfig, getWaRecipients, createWaRecipient, updateWaRecipient,
  deleteWaRecipient, testWaRecipient, getWaLog, getFarms, getPonds,
} from '../services/api';
import { useCan } from '../context/AuthContext';

const CATS = [
  { key: 'sensor', label: 'Sensor kritis' },
  { key: 'offline', label: 'Device offline' },
  { key: 'feeding', label: 'Feeding' },
  { key: 'feed_stock', label: 'Stok pakan' },
];
const SEV = [{ v: 'all', l: 'Semua (termasuk info)' }, { v: 'risk', l: 'Peringatan & Kritis' }, { v: 'critical', l: 'Hanya Kritis' }];
const blank = { name: '', phone: '', scope: 'org', scope_id: '', categories: ['sensor', 'offline', 'feeding', 'feed_stock'], min_severity: 'risk', enabled: true };
const fdt = (d) => (d ? new Date(d).toLocaleString('id-ID') : '-');

export default function WhatsApp() {
  const { isSuper } = useCan();
  const [recipients, setRecipients] = useState([]);
  const [farms, setFarms] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [log, setLog] = useState([]);
  const [modal, setModal] = useState(null);

  async function load() {
    try {
      const [rc, fa, po, lg] = await Promise.all([
        getWaRecipients(), getFarms().catch(() => []), getPonds().catch(() => []), getWaLog().catch(() => []),
      ]);
      setRecipients(rc); setFarms(fa); setPonds(po); setLog(lg);
    } catch (e) { console.error(e); }
  }
  useEffect(() => { load(); }, []);

  const nameOf = (r) => {
    if (r.scope === 'org') return 'Semua kolam (UMKM)';
    if (r.scope === 'farm') return 'Peternakan: ' + (farms.find(f => f.farm_id === r.scope_id)?.name || r.scope_id);
    return 'Kolam: ' + (ponds.find(p => p.pond_id === r.scope_id)?.name || r.scope_id);
  };

  async function save(e) {
    e.preventDefault();
    const d = modal.data;
    try {
      if (modal.mode === 'create') await createWaRecipient(d);
      else await updateWaRecipient(d.id, d);
      setModal(null); load();
    } catch (err) { alert('Gagal: ' + err.message); }
  }
  async function remove(r) {
    if (!confirm(`Hapus penerima ${r.name || r.phone}?`)) return;
    try { await deleteWaRecipient(r.id); load(); } catch (e) { alert(e.message); }
  }
  async function test(r) {
    try { await testWaRecipient(r.id); alert('Pesan uji terkirim ke ' + r.phone); load(); }
    catch (e) { alert('Gagal kirim: ' + e.message); }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">💬 Notifikasi WhatsApp</h1>
          <p className="page-subtitle">Kirim peringatan ke nomor WhatsApp — atur per kolam atau per UMKM</p></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create', data: { ...blank } })}>
          <Plus size={18} /> Tambah Penerima
        </button>
      </div>

      {isSuper && <GatewayConfig />}

      {/* Penerima */}
      <div className="card mb-6">
        <div className="card-header"><div className="card-title"><MessageCircle size={18} /> Penerima Notifikasi</div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Nama</th><th>Nomor</th><th>Cakupan</th><th>Event</th><th>Min. Severity</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {recipients.length === 0 && <tr><td colSpan={7} className="text-muted" style={{ textAlign: 'center', padding: 18 }}>Belum ada penerima.</td></tr>}
              {recipients.map(r => (
                <tr key={r.id}>
                  <td>{r.name || '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.phone}</td>
                  <td className="text-xs">{nameOf(r)}</td>
                  <td className="text-xs">{(Array.isArray(r.categories) ? r.categories : []).map(c => CATS.find(x => x.key === c)?.label || c).join(', ')}</td>
                  <td className="text-xs">{SEV.find(s => s.v === r.min_severity)?.l || r.min_severity}</td>
                  <td>{r.enabled ? <span style={{ color: '#047857' }}>Aktif</span> : <span className="text-muted">Off</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-secondary" title="Kirim uji" onClick={() => test(r)}><Send size={13} /></button>
                    <button className="btn btn-sm btn-secondary" style={{ marginLeft: 6 }} onClick={() => setModal({ mode: 'edit', data: { ...r, categories: Array.isArray(r.categories) ? r.categories : [] } })}><Pencil size={13} /></button>
                    <button className="btn btn-sm btn-secondary" style={{ marginLeft: 6 }} onClick={() => remove(r)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Riwayat kirim */}
      <div className="card">
        <div className="card-header"><div className="card-title"><History size={18} /> Riwayat Pengiriman</div></div>
        <div style={{ overflowX: 'auto', maxHeight: 280 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Waktu</th><th>Nomor</th><th>Kategori</th><th>Status</th></tr></thead>
            <tbody>
              {log.length === 0 && <tr><td colSpan={4} className="text-muted" style={{ textAlign: 'center', padding: 14 }}>Belum ada.</td></tr>}
              {log.map(l => (
                <tr key={l.id}>
                  <td className="text-xs">{fdt(l.created_at)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.phone}</td>
                  <td className="text-xs">{l.category}</td>
                  <td><span className="badge" style={{ background: l.status === 'fail' ? '#fee2e2' : '#d1fae5', color: l.status === 'fail' ? '#b91c1c' : '#047857' }} title={l.error || ''}>{l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{modal.mode === 'create' ? 'Tambah' : 'Edit'} Penerima</h2>
              <button className="modal-close" onClick={() => setModal(null)}><X size={20} /></button>
            </div>
            <form onSubmit={save}>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Nama</label>
                  <input className="form-input" value={modal.data.name} onChange={e => setModal({ ...modal, data: { ...modal.data, name: e.target.value } })} placeholder="mis. Pak Andri" /></div>
                <div className="form-group"><label className="form-label">Nomor WhatsApp *</label>
                  <input className="form-input" required value={modal.data.phone} onChange={e => setModal({ ...modal, data: { ...modal.data, phone: e.target.value } })} placeholder="08xx / 62xx" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Cakupan</label>
                  <select className="form-select" value={modal.data.scope} onChange={e => setModal({ ...modal, data: { ...modal.data, scope: e.target.value, scope_id: '' } })}>
                    <option value="org">Semua kolam (UMKM)</option>
                    <option value="farm">Per peternakan</option>
                    <option value="pond">Per kolam</option>
                  </select></div>
                {modal.data.scope === 'farm' && (
                  <div className="form-group"><label className="form-label">Peternakan</label>
                    <select className="form-select" required value={modal.data.scope_id} onChange={e => setModal({ ...modal, data: { ...modal.data, scope_id: e.target.value } })}>
                      <option value="">— pilih —</option>
                      {farms.map(f => <option key={f.farm_id} value={f.farm_id}>{f.name}</option>)}
                    </select></div>
                )}
                {modal.data.scope === 'pond' && (
                  <div className="form-group"><label className="form-label">Kolam</label>
                    <select className="form-select" required value={modal.data.scope_id} onChange={e => setModal({ ...modal, data: { ...modal.data, scope_id: e.target.value } })}>
                      <option value="">— pilih —</option>
                      {ponds.map(p => <option key={p.pond_id} value={p.pond_id}>{p.name}</option>)}
                    </select></div>
                )}
              </div>
              <div className="form-group"><label className="form-label">Event yang dikirim</label>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {CATS.map(c => (
                    <label key={c.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                      <input type="checkbox" checked={modal.data.categories.includes(c.key)}
                        onChange={e => {
                          const set = new Set(modal.data.categories);
                          e.target.checked ? set.add(c.key) : set.delete(c.key);
                          setModal({ ...modal, data: { ...modal.data, categories: [...set] } });
                        }} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Minimal severity</label>
                  <select className="form-select" value={modal.data.min_severity} onChange={e => setModal({ ...modal, data: { ...modal.data, min_severity: e.target.value } })}>
                    {SEV.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select></div>
                <div className="form-group"><label className="form-label">Status</label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input type="checkbox" checked={!!modal.data.enabled} onChange={e => setModal({ ...modal, data: { ...modal.data, enabled: e.target.checked } })} /> Aktif
                  </label></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function GatewayConfig() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getWaConfig().then(setCfg).catch(() => {}); }, []);
  if (!cfg) return null;

  async function save() {
    setBusy(true);
    try { await setWaConfig(cfg); alert('Konfigurasi gateway disimpan.'); setCfg({ ...cfg, access_token: '', fonnte_token: '', wablas_token: '' }); }
    catch (e) { alert('Gagal: ' + e.message); } finally { setBusy(false); }
  }

  const provider = cfg.provider || 'cloud_api';
  const set = (k, v) => setCfg({ ...cfg, [k]: v });

  return (
    <div className="card mb-6">
      <div className="card-header"><div className="card-title"><Settings size={18} /> Gateway WhatsApp (global)</div></div>

      <div className="form-row">
        <div className="form-group"><label className="form-label">Provider aktif</label>
          <select className="form-select" value={provider} onChange={e => set('provider', e.target.value)}>
            <option value="cloud_api">WhatsApp Cloud API (Meta resmi)</option>
            <option value="fonnte">Fonnte (gateway Indonesia)</option>
            <option value="wablas">Wablas (gateway Indonesia)</option>
          </select></div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={!!cfg.enabled} onChange={e => set('enabled', e.target.checked)} /> Aktifkan pengiriman WhatsApp
          </label></div>
      </div>

      {/* Isi field sesuai provider; yang tak dipilih tetap tersimpan di server */}
      {provider === 'cloud_api' && (
        <>
          <div className="alert alert-info" style={{ margin: '4px 0 12px', fontSize: 12.5 }}>
            Cloud API WAJIB pakai <strong>message template</strong> disetujui Meta, body 1 variabel <code>{'{{1}}'}</code>.
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Phone Number ID</label>
              <input className="form-input" value={cfg.phone_number_id || ''} onChange={e => set('phone_number_id', e.target.value)} placeholder="dari Meta WhatsApp Manager" /></div>
            <div className="form-group"><label className="form-label">Access Token {cfg.has_token && <span className="text-xs text-muted">(tersimpan — isi utk ganti)</span>}</label>
              <input className="form-input" type="password" value={cfg.access_token || ''} onChange={e => set('access_token', e.target.value)} placeholder={cfg.has_token ? '••••••••' : 'token Meta'} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Nama Template</label>
              <input className="form-input" value={cfg.template_name || ''} onChange={e => set('template_name', e.target.value)} placeholder="mis. aquasmart_alert" /></div>
            <div className="form-group"><label className="form-label">Bahasa Template</label>
              <input className="form-input" value={cfg.template_lang || 'id'} onChange={e => set('template_lang', e.target.value)} placeholder="id / en" /></div>
          </div>
          <div className="form-group" style={{ maxWidth: 200 }}><label className="form-label">API Version</label>
            <input className="form-input" value={cfg.api_version || 'v21.0'} onChange={e => set('api_version', e.target.value)} /></div>
        </>
      )}

      {provider === 'fonnte' && (
        <>
          <div className="alert alert-info" style={{ margin: '4px 0 12px', fontSize: 12.5 }}>
            Fonnte: daftar di fonnte.com, hubungkan perangkat WA, salin <strong>Token</strong>. Kirim teks bebas (tanpa template).
          </div>
          <div className="form-group" style={{ maxWidth: 420 }}><label className="form-label">Fonnte Token {cfg.has_fonnte_token && <span className="text-xs text-muted">(tersimpan — isi utk ganti)</span>}</label>
            <input className="form-input" type="password" value={cfg.fonnte_token || ''} onChange={e => set('fonnte_token', e.target.value)} placeholder={cfg.has_fonnte_token ? '••••••••' : 'token dari dashboard Fonnte'} /></div>
        </>
      )}

      {provider === 'wablas' && (
        <>
          <div className="alert alert-info" style={{ margin: '4px 0 12px', fontSize: 12.5 }}>
            Wablas: daftar di wablas.com, salin <strong>domain server</strong> (mis. https://jogja.wablas.com) & <strong>Token</strong>. Kirim teks bebas.
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Domain Server</label>
              <input className="form-input" value={cfg.wablas_domain || ''} onChange={e => set('wablas_domain', e.target.value)} placeholder="https://xxx.wablas.com" /></div>
            <div className="form-group"><label className="form-label">Wablas Token {cfg.has_wablas_token && <span className="text-xs text-muted">(tersimpan — isi utk ganti)</span>}</label>
              <input className="form-input" type="password" value={cfg.wablas_token || ''} onChange={e => set('wablas_token', e.target.value)} placeholder={cfg.has_wablas_token ? '••••••••' : 'token dari dashboard Wablas'} /></div>
          </div>
        </>
      )}

      <button className="btn btn-primary btn-sm" disabled={busy} onClick={save} style={{ marginTop: 4 }}>Simpan Gateway</button>
    </div>
  );
}
