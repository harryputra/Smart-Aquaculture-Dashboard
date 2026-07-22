// ======================================================================
// DB Explorer — akses database dari dashboard (Super Admin, READ-ONLY).
// Keamanan: hanya SELECT/WITH, dijalankan dalam transaksi READ ONLY +
// statement_timeout, hasil dibatasi. Tak bisa mengubah/menghapus data.
// Export ke Excel (.xlsx) via exceljs.
// ======================================================================
const ROW_CAP = 5000;          // baris maksimum dikembalikan ke UI
const EXPORT_CAP = 100000;     // baris maksimum untuk export
const STMT_TIMEOUT = '15s';

// Jalankan query dalam transaksi READ ONLY (write apa pun ditolak DB).
async function runReadOnly(pool, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${STMT_TIMEOUT}'`);
    const r = await client.query(sql, params);
    await client.query('ROLLBACK');
    return r;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { client.release(); }
}

// Validasi: hanya satu perintah SELECT / WITH (baca).
function validSelect(sql) {
  const clean = String(sql || '').trim().replace(/;+\s*$/, '');
  if (!clean) return { ok: false, err: 'SQL kosong.' };
  if (clean.includes(';')) return { ok: false, err: 'Hanya satu perintah diizinkan (tanpa ";").' };
  if (!/^(select|with)\b/i.test(clean)) return { ok: false, err: 'Hanya perintah SELECT / WITH (baca) yang diizinkan.' };
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|vacuum|reindex)\b/i.test(clean))
    return { ok: false, err: 'Terdeteksi perintah yang mengubah data — ditolak (mode read-only).' };
  return { ok: true, sql: clean };
}

async function validTable(pool, name) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [name]);
  return r.rows.length > 0;
}

function registerDbExplorer({ app, pool }) {
  const requireSuper = (req, res, next) => {
    if (req.auth?.role !== 'superadmin') return res.status(403).json({ error: 'Hanya Super Admin.' });
    next();
  };

  // Daftar tabel + estimasi jumlah baris.
  app.get('/api/db/tables', requireSuper, async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT c.relname AS name,
               CASE WHEN c.reltuples < 0 THEN 0 ELSE c.reltuples::bigint END AS rows_estimate,
               c.relkind AS kind
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')
        ORDER BY c.relname`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Isi satu tabel (paginasi).
  app.get('/api/db/table/:name', requireSuper, async (req, res) => {
    try {
      const name = req.params.name;
      if (!(await validTable(pool, name))) return res.status(404).json({ error: 'Tabel tidak ditemukan.' });
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const r = await runReadOnly(pool, `SELECT * FROM "${name}" LIMIT ${limit} OFFSET ${offset}`);
      const cnt = await pool.query(`SELECT COUNT(*)::bigint c FROM "${name}"`).catch(() => ({ rows: [{ c: null }] }));
      res.json({ columns: r.fields.map(f => f.name), rows: r.rows, total: cnt.rows[0].c, limit, offset });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Jalankan SQL read-only.
  app.post('/api/db/query', requireSuper, async (req, res) => {
    const v = validSelect(req.body?.sql);
    if (!v.ok) return res.status(400).json({ error: v.err });
    try {
      const r = await runReadOnly(pool, v.sql);
      res.json({
        columns: r.fields.map(f => f.name),
        rows: r.rows.slice(0, ROW_CAP),
        truncated: r.rows.length > ROW_CAP, count: r.rows.length,
      });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Export ke Excel (.xlsx) — dari tabel atau hasil query.
  app.post('/api/db/export', requireSuper, async (req, res) => {
    try {
      let columns, rows, fname;
      if (req.body?.sql) {
        const v = validSelect(req.body.sql);
        if (!v.ok) return res.status(400).json({ error: v.err });
        const r = await runReadOnly(pool, v.sql);
        columns = r.fields.map(f => f.name); rows = r.rows.slice(0, EXPORT_CAP); fname = 'query';
      } else if (req.body?.table) {
        if (!(await validTable(pool, req.body.table))) return res.status(404).json({ error: 'Tabel tidak ditemukan.' });
        const r = await runReadOnly(pool, `SELECT * FROM "${req.body.table}" LIMIT ${EXPORT_CAP}`);
        columns = r.fields.map(f => f.name); rows = r.rows; fname = req.body.table;
      } else return res.status(400).json({ error: 'Sertakan "table" atau "sql".' });

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Data');
      ws.columns = columns.map(c => ({ header: c, key: c, width: Math.min(45, Math.max(12, c.length + 2)) }));
      for (const row of rows) {
        const o = {};
        for (const c of columns) { let val = row[c]; if (val != null && typeof val === 'object') val = JSON.stringify(val); o[c] = val; }
        ws.addRow(o);
      }
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}_${Date.now()}.xlsx"`);
      const buf = await wb.xlsx.writeBuffer();
      res.send(Buffer.from(buf));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ DB Explorer handlers terdaftar (Super Admin, read-only)');
}

module.exports = { registerDbExplorer };
