import { useEffect, useState } from 'react';
import { Plus, Users as UsersIcon, Building2, Trash2, Pencil, X, Shield, Zap, Copy } from 'lucide-react';
import {
  getUsers, createUser, updateUser, deleteUser,
  getOrgs, createOrg, updateOrg, deleteOrg,
  getQuickLoginConfig, setQuickLoginConfig,
} from '../services/api';
import { useAuth, useCan, ROLE_LABEL } from '../context/AuthContext';

const ROLE_BADGE = {
  superadmin: { bg: '#ede9fe', c: '#6d28d9' },
  pemilik: { bg: '#dbeafe', c: '#1d4ed8' },
  pekerja: { bg: '#d1fae5', c: '#047857' },
  pengamat: { bg: '#f3f4f6', c: '#374151' },
};
const fdt = (d) => (d ? new Date(d).toLocaleDateString('id-ID') : '-');
const blankUser = { name: '', email: '', password: '', role: 'pekerja', org_id: '', is_active: true, quick_login: false };

export default function Users() {
  const { user } = useAuth();
  const { isSuper } = useCan();
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [filterOrg, setFilterOrg] = useState('');
  const [modal, setModal] = useState(null);   // { mode:'create'|'edit', data }
  const [newOrg, setNewOrg] = useState('');
  const [qlCfg, setQlCfg] = useState(null);

  const roleOptions = isSuper ? ['superadmin', 'pemilik', 'pekerja', 'pengamat'] : ['pemilik', 'pekerja', 'pengamat'];

  async function load() {
    try {
      const [u, o] = await Promise.all([getUsers(isSuper ? filterOrg : undefined), getOrgs().catch(() => [])]);
      setUsers(u); setOrgs(o);
      if (isSuper) getQuickLoginConfig().then(setQlCfg).catch(() => {});
    } catch (e) { console.error(e); }
  }
  useEffect(() => { load(); }, [filterOrg]);

  async function saveUser(e) {
    e.preventDefault();
    const d = modal.data;
    try {
      if (modal.mode === 'create') {
        const body = { name: d.name, email: d.email, password: d.password, role: d.role };
        if (isSuper && d.role !== 'superadmin') body.org_id = d.org_id;
        if (isSuper) body.quick_login = !!d.quick_login;
        await createUser(body);
      } else {
        const body = { name: d.name, role: d.role, is_active: d.is_active };
        if (d.password) body.password = d.password;
        if (isSuper) body.quick_login = !!d.quick_login;
        await updateUser(d.user_id, body);
      }
      setModal(null); load();
    } catch (err) { alert('Gagal: ' + err.message); }
  }
  async function removeUser(u) {
    if (!confirm(`Hapus pengguna "${u.name || u.email}"?`)) return;
    try { await deleteUser(u.user_id); load(); } catch (e) { alert('Gagal: ' + e.message); }
  }

  async function addOrg() {
    if (!newOrg.trim()) return;
    try { await createOrg({ name: newOrg.trim() }); setNewOrg(''); load(); } catch (e) { alert('Gagal: ' + e.message); }
  }
  async function renameOrg(o) {
    const name = prompt('Nama organisasi baru:', o.name);
    if (!name) return;
    try { await updateOrg(o.org_id, { name }); load(); } catch (e) { alert('Gagal: ' + e.message); }
  }
  async function removeOrg(o) {
    if (!confirm(`Hapus organisasi "${o.name}"? Semua penggunanya ikut terhapus.`)) return;
    try { await deleteOrg(o.org_id); load(); } catch (e) { alert('Gagal: ' + e.message); }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">👥 Pengguna</h1>
          <p className="page-subtitle">Kelola akun & hak akses{isSuper ? ' lintas organisasi' : ' di organisasi Anda'}</p></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create', data: { ...blankUser, org_id: orgs[0]?.org_id || '' } })}>
          <Plus size={18} /> Tambah Pengguna
        </button>
      </div>

      {/* Organisasi — hanya superadmin */}
      {isSuper && (
        <div className="card mb-6">
          <div className="card-header"><div className="card-title"><Building2 size={18} /> Organisasi (UMKM)</div></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input className="form-input" style={{ maxWidth: 320 }} placeholder="Nama organisasi baru…"
              value={newOrg} onChange={e => setNewOrg(e.target.value)} onKeyDown={e => e.key === 'Enter' && addOrg()} />
            <button className="btn btn-secondary" onClick={addOrg}><Plus size={15} /> Tambah</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
            {orgs.map(o => (
              <div key={o.org_id} className="card" style={{ padding: 12, margin: 0 }}>
                <div style={{ fontWeight: 600 }}>{o.name}</div>
                <div className="text-xs text-muted" style={{ margin: '2px 0 8px' }}>
                  {o.user_count ?? 0} pengguna · {o.farm_count ?? 0} peternakan
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => renameOrg(o)}><Pencil size={13} /></button>
                  {o.org_id !== 'org_default' &&
                    <button className="btn btn-sm btn-secondary" onClick={() => removeOrg(o)}><Trash2 size={13} /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick-Login config — superadmin */}
      {isSuper && qlCfg && (
        <QuickLoginCard cfg={qlCfg} onSave={async (body) => {
          try { setQlCfg(await setQuickLoginConfig(body)); } catch (e) { alert('Gagal: ' + e.message); }
        }} />
      )}

      {/* Filter org (superadmin) */}
      {isSuper && (
        <div style={{ marginBottom: 12 }}>
          <select className="form-select" style={{ maxWidth: 280 }} value={filterOrg} onChange={e => setFilterOrg(e.target.value)}>
            <option value="">Semua organisasi</option>
            {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {/* Tabel pengguna */}
      <div className="card">
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr>
              <th>Nama</th><th>Email</th><th>Peran</th>{isSuper && <th>Organisasi</th>}
              <th>Status</th><th>Login terakhir</th><th></th>
            </tr></thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={isSuper ? 7 : 6} className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Belum ada pengguna.</td></tr>}
              {users.map(u => {
                const b = ROLE_BADGE[u.role] || ROLE_BADGE.pengamat;
                return (
                  <tr key={u.user_id}>
                    <td>{u.name} {u.user_id === user?.user_id && <span className="text-xs text-muted">(Anda)</span>}</td>
                    <td>{u.email}</td>
                    <td><span className="badge" style={{ background: b.bg, color: b.c }}><Shield size={12} /> {ROLE_LABEL[u.role] || u.role}</span></td>
                    {isSuper && <td>{u.org_name || <span className="text-muted">—</span>}</td>}
                    <td>{u.is_active ? <span style={{ color: '#047857' }}>Aktif</span> : <span style={{ color: '#b91c1c' }}>Nonaktif</span>}</td>
                    <td className="text-xs">{fdt(u.last_login)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setModal({ mode: 'edit', data: { ...u, password: '' } })}><Pencil size={13} /></button>
                      {u.user_id !== user?.user_id &&
                        <button className="btn btn-sm btn-secondary" style={{ marginLeft: 6 }} onClick={() => removeUser(u)}><Trash2 size={13} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal tambah/edit */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{modal.mode === 'create' ? 'Tambah Pengguna' : 'Edit Pengguna'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}><X size={20} /></button>
            </div>
            <form onSubmit={saveUser}>
              <div className="form-group"><label className="form-label">Nama</label>
                <input className="form-input" value={modal.data.name}
                  onChange={e => setModal({ ...modal, data: { ...modal.data, name: e.target.value } })} placeholder="Nama lengkap" /></div>
              <div className="form-group"><label className="form-label">Email *</label>
                <input className="form-input" type="email" required disabled={modal.mode === 'edit'} value={modal.data.email}
                  onChange={e => setModal({ ...modal, data: { ...modal.data, email: e.target.value } })} placeholder="nama@contoh.com" /></div>
              <div className="form-group">
                <label className="form-label">{modal.mode === 'create' ? 'Password *' : 'Reset Password (kosongkan jika tak diubah)'}</label>
                <input className="form-input" type="password" required={modal.mode === 'create'} value={modal.data.password}
                  onChange={e => setModal({ ...modal, data: { ...modal.data, password: e.target.value } })} placeholder="Min. 8 char, ada huruf besar/kecil + angka" />
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Peran</label>
                  <select className="form-select" value={modal.data.role}
                    onChange={e => setModal({ ...modal, data: { ...modal.data, role: e.target.value } })}>
                    {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select></div>
                {isSuper && modal.data.role !== 'superadmin' && (
                  <div className="form-group"><label className="form-label">Organisasi</label>
                    <select className="form-select" value={modal.data.org_id} required
                      disabled={modal.mode === 'edit'}
                      onChange={e => setModal({ ...modal, data: { ...modal.data, org_id: e.target.value } })}>
                      <option value="">— pilih —</option>
                      {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
                    </select></div>
                )}
              </div>
              {modal.mode === 'edit' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={!!modal.data.is_active}
                    onChange={e => setModal({ ...modal, data: { ...modal.data, is_active: e.target.checked } })} />
                  Akun aktif
                </label>
              )}
              {isSuper && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={!!modal.data.quick_login}
                    onChange={e => setModal({ ...modal, data: { ...modal.data, quick_login: e.target.checked } })} />
                  <span><Zap size={13} style={{ verticalAlign: '-2px' }} /> Izinkan Quick-Login (tandai sbg akun demo)</span>
                </label>
              )}
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

function QuickLoginCard({ cfg, onSave }) {
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [showButton, setShowButton] = useState(cfg.show_button_on_login);
  const [usePass, setUsePass] = useState(cfg.passphrase_enabled);
  const [passphrase, setPassphrase] = useState('');
  const [hours, setHours] = useState('');
  const magic = cfg.magic_url ? window.location.origin + cfg.magic_url : null;

  function save() {
    const body = { enabled, show_button_on_login: showButton, expires_in_hours: hours ? parseInt(hours) : 0 };
    if (!usePass) body.passphrase = '';
    else if (passphrase) body.passphrase = passphrase;
    onSave(body);
    setPassphrase('');
  }

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div className="card-title"><Zap size={18} /> Quick-Login (Demo)</div>
        <span className="badge" style={{ background: cfg.enabled ? '#d1fae5' : '#f3f4f6', color: cfg.enabled ? '#047857' : '#6b7280' }}>
          {cfg.enabled ? 'AKTIF' : 'NONAKTIF'}
        </span>
      </div>
      <p className="text-xs text-muted" style={{ marginTop: 0 }}>
        Login cepat untuk demo/dukungan. Saat nonaktif, semua endpoint quick-login balas 404 (tak terlihat).
        Hanya akun bertanda <Zap size={11} style={{ verticalAlign: '-1px' }} /> di tabel yang bisa dipakai.
      </p>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Aktifkan quick-login
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, opacity: enabled ? 1 : 0.5 }}>
        <input type="checkbox" disabled={!enabled} checked={showButton} onChange={e => setShowButton(e.target.checked)} />
        Tampilkan tombol di halaman login (matikan utk produksi → hanya via URL rahasia)
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, opacity: enabled ? 1 : 0.5 }}>
        <input type="checkbox" disabled={!enabled} checked={usePass} onChange={e => setUsePass(e.target.checked)} />
        Wajib passphrase
      </label>
      {enabled && usePass && (
        <input className="form-input" type="text" value={passphrase} onChange={e => setPassphrase(e.target.value)}
          placeholder={cfg.passphrase_enabled ? 'Isi untuk mengganti passphrase' : 'Passphrase baru'} style={{ marginBottom: 8, maxWidth: 320 }} />
      )}
      {enabled && (
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label className="form-label">Kedaluwarsa (jam, 0 = tanpa batas)</label>
          <input className="form-input" type="number" min="0" value={hours} onChange={e => setHours(e.target.value)} placeholder="0" />
        </div>
      )}

      {cfg.enabled && magic && (
        <div className="alert alert-info" style={{ marginBottom: 10, wordBreak: 'break-all', fontSize: 12.5 }}>
          🔑 URL rahasia: <code>{magic}</code>
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }}
            onClick={() => navigator.clipboard?.writeText(magic)}><Copy size={12} /> Salin</button>
        </div>
      )}

      <button className="btn btn-primary btn-sm" onClick={save}>Simpan Pengaturan</button>
    </div>
  );
}
