import { useEffect, useState } from 'react';
import { Database as DbIcon, Table2, Play, Download, Search, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { dbTables, dbTable, dbQuery, dbExport } from '../services/api';

function cell(v) {
  if (v === null || v === undefined) return <span className="text-muted">null</span>;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return <code style={{ fontSize: 11 }}>{JSON.stringify(v)}</code>;
  const s = String(v);
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

function DataGrid({ columns, rows }) {
  if (!columns?.length) return <div className="empty-state"><p>Tidak ada data.</p></div>;
  return (
    <div style={{ overflow: 'auto', maxHeight: '55vh', border: '1px solid var(--border-primary)', borderRadius: 10 }}>
      <table className="data-table" style={{ width: '100%', fontSize: 12.5 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>{columns.map(c => <th key={c} style={{ whiteSpace: 'nowrap', background: 'var(--bg-tertiary)' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="text-muted" style={{ textAlign: 'center', padding: 16 }}>0 baris.</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>{columns.map(c => <td key={c} style={{ whiteSpace: 'nowrap', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Database() {
  const [tables, setTables] = useState([]);
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState(null);
  const [td, setTd] = useState(null);          // { columns, rows, total, limit, offset }
  const [mode, setMode] = useState('table');   // table | query
  const [sql, setSql] = useState('SELECT * FROM ponds LIMIT 50;');
  const [qr, setQr] = useState(null);          // query result
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { dbTables().then(setTables).catch(e => setErr(e.message)); }, []);

  async function openTable(name, offset = 0) {
    setBusy(true); setErr(''); setMode('table'); setSel(name);
    try { setTd(await dbTable(name, 100, offset)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function runQuery() {
    setBusy(true); setErr(''); setMode('query');
    try { setQr(await dbQuery(sql)); } catch (e) { setErr(e.message); setQr(null); } finally { setBusy(false); }
  }
  async function doExport(body) {
    try { await dbExport(body); } catch (e) { alert('Export gagal: ' + e.message); }
  }

  const shown = tables.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1 className="page-title">🗄️ Database</h1>
          <p className="page-subtitle">Jelajah tabel & query (read-only) + export Excel — khusus Super Admin</p></div>
      </div>

      <div className="alert" style={{ marginBottom: 14, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
        <ShieldAlert size={18} />
        <div><strong>Mode read-only.</strong> Hanya perintah <code>SELECT</code> yang diizinkan (dijalankan dalam transaksi read-only + batas waktu). Data tidak bisa diubah/dihapus dari sini.</div>
      </div>

      {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,240px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Daftar tabel */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 30, fontSize: 13 }} placeholder="Cari tabel…" value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {shown.map(t => (
              <button key={t.name} onClick={() => openTable(t.name)}
                className={'nav-item' + (sel === t.name && mode === 'table' ? ' active' : '')}
                style={{ width: '100%', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
                  <Table2 size={14} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>{t.name}</span>
                </span>
                <span className="text-xs text-muted">{Number(t.rows_estimate).toLocaleString('id-ID')}</span>
              </button>
            ))}
            {shown.length === 0 && <div className="text-xs text-muted" style={{ padding: 8 }}>Tak ada tabel.</div>}
          </div>
        </div>

        {/* Konten */}
        <div style={{ minWidth: 0 }}>
          {/* Query SQL */}
          <div className="card mb-6">
            <div className="card-header"><div className="card-title"><Play size={16} /> Query SQL (read-only)</div></div>
            <textarea className="form-input" rows={3} style={{ fontFamily: 'monospace', fontSize: 13 }} value={sql} onChange={e => setSql(e.target.value)} placeholder="SELECT ... FROM ..." />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={runQuery}><Play size={14} /> Jalankan</button>
              <button className="btn btn-secondary btn-sm" disabled={busy || !sql.trim()} onClick={() => doExport({ sql })}><Download size={14} /> Export Excel</button>
            </div>
          </div>

          {mode === 'query' && qr && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Hasil ({qr.count} baris{qr.truncated ? `, tampil ${qr.rows.length}` : ''})</div>
                <button className="btn btn-sm btn-secondary" onClick={() => doExport({ sql })}><Download size={13} /> Excel</button>
              </div>
              <DataGrid columns={qr.columns} rows={qr.rows} />
            </div>
          )}

          {mode === 'table' && td && (
            <div className="card">
              <div className="card-header">
                <div><div className="card-title"><Table2 size={16} /> {sel}</div>
                  <div className="card-subtitle">Total {td.total != null ? Number(td.total).toLocaleString('id-ID') : '?'} baris</div></div>
                <button className="btn btn-sm btn-secondary" onClick={() => doExport({ table: sel })}><Download size={13} /> Excel</button>
              </div>
              <DataGrid columns={td.columns} rows={td.rows} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <span className="text-xs text-muted">baris {td.offset + 1}–{td.offset + td.rows.length}</span>
                <button className="btn btn-sm btn-secondary" disabled={busy || td.offset === 0} onClick={() => openTable(sel, Math.max(0, td.offset - td.limit))}><ChevronLeft size={14} /></button>
                <button className="btn btn-sm btn-secondary" disabled={busy || td.rows.length < td.limit} onClick={() => openTable(sel, td.offset + td.limit)}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}

          {!td && mode === 'table' && (
            <div className="card"><div className="empty-state"><div className="empty-state-icon"><DbIcon size={30} /></div>
              <h3>Pilih tabel</h3><p>Klik tabel di kiri untuk melihat isinya, atau jalankan query di atas.</p></div></div>
          )}
        </div>
      </div>
    </div>
  );
}
