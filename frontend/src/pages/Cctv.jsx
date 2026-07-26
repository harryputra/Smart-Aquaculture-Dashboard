import { useEffect, useState } from 'react';
import {
  Video, Camera, Copy, Check, ExternalLink, Eye, EyeOff, Plus, Trash2,
  Pencil, Save, X, Info, Settings, User, Lock, Globe, MapPin, AlertTriangle,
} from 'lucide-react';
import {
  getCctvConfig, setCctvConfig, getCctvCameras, createCctvCamera,
  updateCctvCamera, deleteCctvCamera, getPonds, getOrgs,
} from '../services/api';
import { useCan } from '../context/AuthContext';

export default function Cctv() {
  const { canManageUsers, isSuper } = useCan();
  const [cfg, setCfg] = useState(null);
  const [cams, setCams] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [camModal, setCamModal] = useState(null); // {id?,...} saat tambah/edit kamera

  const effOrg = isSuper ? (orgId || undefined) : undefined;

  async function load() {
    setLoading(true);
    try {
      const c = await getCctvConfig(effOrg);
      setCfg(c);
      if (!c._needsOrg) {
        const [cm, pd] = await Promise.all([
          getCctvCameras(effOrg).catch(() => []),
          getPonds().catch(() => []),
        ]);
        setCams(cm); setPonds(pd);
      } else { setCams([]); setPonds([]); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => { if (isSuper) getOrgs().then(setOrgs).catch(() => {}); }, [isSuper]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgId]);

  const openPortal = (url) => window.open(url || cfg?.portal_url, '_blank', 'noopener,noreferrer');

  if (loading && !cfg) {
    return <div className="page-container"><div className="loading"><div className="spinner" /></div></div>;
  }
  if (!cfg) {
    return <div className="page-container"><div className="card"><div className="empty-state">
      <div className="empty-state-icon"><AlertTriangle size={28} /></div>
      <h3>Gagal memuat CCTV</h3><p>Coba muat ulang halaman.</p>
    </div></div></div>;
  }

  const needsOrg = cfg?._needsOrg;
  const hasCreds = !!(cfg?.account || cfg?.password);
  const disabled = cfg && cfg.enabled === false;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title"><Video size={24} style={{ verticalAlign: -4, marginRight: 8, color: 'var(--accent-primary)' }} />CCTV</h1>
          <p className="page-subtitle">Pantau kolam lewat CCTV — akses terpusat dari dashboard.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isSuper && (
            <select className="form-select" value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">— Pilih organisasi —</option>
              {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
            </select>
          )}
          {canManageUsers && !needsOrg && (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing((v) => !v)}>
              <Settings size={15} /> {editing ? 'Tutup Pengaturan' : 'Pengaturan'}
            </button>
          )}
        </div>
      </div>

      {needsOrg && (
        <div className="card"><div className="empty-state">
          <div className="empty-state-icon"><Info size={30} /></div>
          <h3>Pilih organisasi</h3>
          <p>Sebagai Super Admin, pilih organisasi di kanan atas untuk melihat / mengatur CCTV‑nya.</p>
        </div></div>
      )}

      {!needsOrg && editing && (
        <ConfigForm cfg={cfg} orgId={effOrg}
          onSaved={(c) => { setCfg(c); setEditing(false); }}
          onCancel={() => setEditing(false)} />
      )}

      {!needsOrg && !editing && (
        <>
          {/* ---- Kartu peluncur portal + kredensial ---- */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div>
                <div className="card-title">{cfg.provider_label || 'Portal CCTV'}</div>
                <div className="card-subtitle">Portal kamera terpisah — buka lalu login dengan kredensial di bawah.</div>
              </div>
              {disabled
                ? <span className="badge badge-warning">Nonaktif</span>
                : <span className="badge badge-success">Aktif</span>}
            </div>

            {disabled ? (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <AlertTriangle size={18} />
                <div>CCTV dinonaktifkan. {canManageUsers ? 'Aktifkan lewat tombol Pengaturan.' : 'Hubungi pemilik untuk mengaktifkan.'}</div>
              </div>
            ) : (
              <>
                <button className="btn btn-primary" style={{ fontSize: 15, padding: '12px 22px' }} onClick={() => openPortal()}>
                  <ExternalLink size={18} /> Buka Portal CCTV
                </button>

                {hasCreds ? (
                  <div style={{ marginTop: 18, display: 'grid', gap: 10, maxWidth: 560 }}>
                    <CredRow icon={Globe} label="Country / Region" value={cfg.country_region} />
                    <CredRow icon={User} label="Account" value={cfg.account} />
                    <CredRow icon={Lock} label="Password" value={cfg.password} secret />
                  </div>
                ) : (
                  <div className="alert" style={{ marginTop: 16, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                    <Info size={18} />
                    <div>Kredensial login belum diisi. {canManageUsers ? 'Isi lewat tombol Pengaturan.' : 'Minta pemilik mengisinya.'}</div>
                  </div>
                )}

                {cfg.note && <p className="text-xs text-muted" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>{cfg.note}</p>}

                <p className="text-xs text-muted" style={{ marginTop: 14, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Portal CCTV membuka tab baru & butuh login sendiri (tak bisa disematkan langsung oleh kebijakan keamanan Bardi). Kredensial ini bersifat rahasia — jangan sebarkan.
                </p>
              </>
            )}
          </div>

          {/* ---- Katalog kamera per kolam ---- */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title"><Camera size={18} style={{ verticalAlign: -3 }} /> Kamera per Kolam</div>
                <div className="card-subtitle">{cams.length} kamera terdaftar</div>
              </div>
              {canManageUsers && (
                <button className="btn btn-secondary btn-sm" onClick={() => setCamModal({ name: '', pond_id: '', url: '', note: '', sort: cams.length })}>
                  <Plus size={15} /> Tambah Kamera
                </button>
              )}
            </div>

            {cams.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Camera size={28} /></div>
                <h3>Belum ada kamera terdaftar</h3>
                <p>Daftarkan kamera & petakan ke kolam agar mudah dikenali.{canManageUsers ? '' : ' Minta pemilik menambahkannya.'}</p>
                {canManageUsers && (
                  <button className="btn btn-primary" onClick={() => setCamModal({ name: '', pond_id: '', url: '', note: '', sort: 0 })}>
                    <Plus size={16} /> Tambah Kamera
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {cams.map((c) => (
                  <div key={c.id} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Camera size={16} /></span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      </div>
                      {canManageUsers && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button className="icon-btn" title="Ubah" onClick={() => setCamModal(c)} style={iconBtn}><Pencil size={14} /></button>
                          <button className="icon-btn" title="Hapus" onClick={async () => { if (confirm(`Hapus kamera "${c.name}"?`)) { await deleteCctvCamera(c.id); load(); } }} style={iconBtn}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                    {c.pond_name && <span className="text-xs" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {c.pond_name}</span>}
                    {c.note && <span className="text-xs text-muted">{c.note}</span>}
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 'auto' }} onClick={() => openPortal(c.url)} disabled={disabled}>
                      <ExternalLink size={14} /> Buka {c.url ? 'Kamera' : 'Portal'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {camModal && (
        <CameraModal cam={camModal} ponds={ponds} orgId={effOrg}
          onClose={() => setCamModal(null)}
          onSaved={() => { setCamModal(null); load(); }} />
      )}
    </div>
  );
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer',
  display: 'grid', placeItems: 'center',
};

// Baris kredensial dengan tombol salin + toggle lihat (untuk password).
function CredRow({ icon: Icon, label, value, secret }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const v = value || '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };
  const shown = !v ? '—' : (secret && !show ? '•'.repeat(Math.max(6, Math.min(v.length, 14))) : v);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
      <Icon size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-xs text-muted" style={{ marginBottom: 2 }}>{label}</div>
        <div style={{ fontWeight: 600, fontFamily: secret ? "'JetBrains Mono', monospace" : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</div>
      </div>
      {secret && v && (
        <button style={iconBtn} title={show ? 'Sembunyikan' : 'Lihat'} onClick={() => setShow((s) => !s)}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      <button style={{ ...iconBtn, color: copied ? 'var(--success)' : 'var(--text-secondary)' }} title="Salin" onClick={copy} disabled={!v}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

// Form pengaturan config CCTV (pemilik/superadmin).
function ConfigForm({ cfg, orgId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    enabled: cfg.enabled !== false,
    provider_label: cfg.provider_label || 'BARDI IPC',
    portal_url: cfg.portal_url || 'https://ipc.bardi.co.id/login',
    country_region: cfg.country_region || '+62 (Indonesia)',
    account: cfg.account || '',
    password: cfg.password || '',
    note: cfg.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save() {
    setSaving(true); setErr('');
    try { const c = await setCctvConfig({ ...form, org_id: orgId }); onSaved(c); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderColor: 'var(--accent-primary)' }}>
      <div className="card-header"><div className="card-title"><Settings size={18} style={{ verticalAlign: -3 }} /> Pengaturan CCTV</div></div>
      {err && <div className="alert alert-danger" style={{ marginBottom: 14 }}><X size={16} /> {err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nama Portal</label>
          <input className="form-input" value={form.provider_label} onChange={set('provider_label')} placeholder="BARDI IPC" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">URL Portal</label>
          <input className="form-input" value={form.portal_url} onChange={set('portal_url')} placeholder="https://ipc.bardi.co.id/login" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Country / Region</label>
          <input className="form-input" value={form.country_region} onChange={set('country_region')} placeholder="+62 (Indonesia)" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Account (email / no. HP)</label>
          <input className="form-input" value={form.account} onChange={set('account')} placeholder="cctv...@gmail.com" autoComplete="off" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Password</label>
          <input className="form-input" type="text" value={form.password} onChange={set('password')} placeholder="••••••" autoComplete="off" />
        </div>
        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={set('enabled')} /> Aktifkan CCTV
          </label>
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 14, marginBottom: 0 }}>
        <label className="form-label">Catatan (opsional)</label>
        <textarea className="form-input" rows={2} value={form.note} onChange={set('note')} placeholder="mis. petunjuk singkat / kontak" />
      </div>
      <p className="text-xs text-muted" style={{ marginTop: 10 }}>
        Password disimpan aman di server (hanya bisa dibaca lewat login dashboard organisasi ini), tidak pernah masuk kode.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan'}</button>
        <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Batal</button>
      </div>
    </div>
  );
}

// Modal tambah/edit kamera.
function CameraModal({ cam, ponds, orgId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: cam.name || '', pond_id: cam.pond_id || '', url: cam.url || '', note: cam.note || '', sort: cam.sort || 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      const payload = { ...form, org_id: orgId };
      if (cam.id) await updateCctvCamera(cam.id, payload); else await createCctvCamera(payload);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{cam.id ? 'Ubah Kamera' : 'Tambah Kamera'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={save}>
          {err && <div className="alert alert-danger" style={{ marginBottom: 12 }}><X size={16} /> {err}</div>}
          <div className="form-group">
            <label className="form-label">Nama Kamera</label>
            <input className="form-input" value={form.name} onChange={set('name')} placeholder="mis. Kamera Kolam C1" required />
          </div>
          <div className="form-group">
            <label className="form-label">Kolam</label>
            <select className="form-select" value={form.pond_id} onChange={set('pond_id')}>
              <option value="">— Tidak terkait kolam —</option>
              {ponds.map((p) => <option key={p.pond_id} value={p.pond_id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">URL langsung (opsional)</label>
            <input className="form-input" value={form.url} onChange={set('url')} placeholder="kosongkan → buka portal utama" />
          </div>
          <div className="form-group">
            <label className="form-label">Catatan (opsional)</label>
            <input className="form-input" value={form.note} onChange={set('note')} placeholder="mis. posisi/arah kamera" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
