import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Trash2, Download, Archive, ArchiveRestore } from 'lucide-react';
import {
  getLogbook, addLogbook, deleteLogbook, exportUrl, archivePond, getPond,
} from '../services/api';

const TYPES = ['observasi', 'insiden', 'tindakan'];
const EXPORTS = [
  { type: 'sensors', label: 'Data Sensor' },
  { type: 'feeding', label: 'Log Pakan' },
  { type: 'mortality', label: 'Mortalitas' },
  { type: 'cycles', label: 'Riwayat Siklus' },
];

export default function LogbookTab({ pondId }) {
  const nav = useNavigate();
  const [entries, setEntries] = useState([]);
  const [pond, setPond] = useState(null);
  const [type, setType] = useState('observasi');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [e, p] = await Promise.all([getLogbook(pondId), getPond(pondId).catch(() => null)]);
      setEntries(e); setPond(p);
    } catch (err) { console.error(err); }
  }
  useEffect(() => { load(); }, [pondId]);

  async function submit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try { await addLogbook(pondId, { entry_type: type, content }); setContent(''); await load(); }
    catch (err) { alert(err.message); } finally { setBusy(false); }
  }
  async function del(id) { setBusy(true); try { await deleteLogbook(pondId, id); await load(); } catch (e) { alert(e.message); } finally { setBusy(false); } }

  async function toggleArchive() {
    const archiving = pond?.is_active !== false;
    if (archiving && !confirm('Arsipkan kolam ini? Akan hilang dari daftar kolam aktif (data tetap tersimpan).')) return;
    setBusy(true);
    try {
      await archivePond(pondId, !archiving);   // archiving → is_active false
      if (archiving) { alert('Kolam diarsipkan.'); nav(`/farms/${pond?.farm_id || ''}`); }
      else { await load(); }
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  const archived = pond?.is_active === false;

  return (
    <>
      {/* CATATAN / LOGBOOK */}
      <div className="card mb-6">
        <div className="card-header">
          <div><div className="card-title"><ClipboardList size={18} style={{ verticalAlign: -3 }} /> Logbook / Catatan</div>
            <div className="card-subtitle">Observasi, insiden, tindakan — tertaut ke siklus aktif</div></div>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}><label className="form-label">Jenis</label>
            <select className="form-select" value={type} onChange={e => setType(e.target.value)}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}><label className="form-label">Catatan</label>
            <input className="form-input" value={content} onChange={e => setContent(e.target.value)} placeholder="mis. air keruh setelah hujan, beri probiotik..." /></div>
          <button className="btn btn-primary" disabled={busy}><Plus size={16} /> Tambah</button>
        </form>
        {entries.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}><div className="text-muted">Belum ada catatan.</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map(en => (
              <div key={en.id} style={{ display: 'flex', gap: 10, padding: 12, background: 'var(--bg-elevated)', borderRadius: 10 }}>
                <span className="badge badge-neutral" style={{ alignSelf: 'flex-start' }}>{en.entry_type}</span>
                <div style={{ flex: 1 }}>
                  <div>{en.content}</div>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>{new Date(en.recorded_at).toLocaleString('id-ID')}</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => del(en.id)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EKSPOR CSV */}
      <div className="card mb-6">
        <div className="card-header"><div className="card-title"><Download size={18} style={{ verticalAlign: -3 }} /> Ekspor Data (CSV)</div></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {EXPORTS.map(x => (
            <a key={x.type} className="btn btn-secondary" href={exportUrl(pondId, x.type)} download>
              <Download size={15} /> {x.label}
            </a>
          ))}
        </div>
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>Unduh sebagai file .csv untuk dibuka di Excel / analisis lanjut.</div>
      </div>

      {/* ARSIP KOLAM */}
      <div className="card">
        <div className="card-header"><div className="card-title"><Archive size={18} style={{ verticalAlign: -3 }} /> Arsip Kolam</div></div>
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="text-muted text-xs" style={{ maxWidth: 460 }}>
            {archived
              ? 'Kolam ini diarsipkan (tersembunyi dari daftar aktif). Data tetap tersimpan.'
              : 'Mengarsipkan kolam menyembunyikannya dari daftar tanpa menghapus data. Cocok untuk kolam yang sedang tidak dipakai / sudah panen.'}
          </div>
          <button className={'btn ' + (archived ? 'btn-primary' : 'btn-secondary')} onClick={toggleArchive} disabled={busy}>
            {archived ? <><ArchiveRestore size={16} /> Aktifkan Kembali</> : <><Archive size={16} /> Arsipkan Kolam</>}
          </button>
        </div>
      </div>
    </>
  );
}
