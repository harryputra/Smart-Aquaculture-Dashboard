// ======================================================================
// Otorisasi terpusat: role guard + tenant scoping.
// Semua endpoint /api/* sudah melewati authGate (login wajib) di server.js.
// Middleware ini menambahkan lapisan kedua: cek PERAN dan KEPEMILIKAN resource.
//
// Pola: superadmin selalu bypass scoping (melihat semua organisasi).
// Peran lain dibatasi ke org_id masing-masing via join ke tabel farms.
// ======================================================================

/**
 * Middleware: tolak request jika role user tidak dalam daftar.
 * Superadmin selalu diizinkan.
 *   Contoh: requireRole('pemilik')  → hanya pemilik & superadmin.
 *           requireRole('pekerja','pemilik') → pekerja, pemilik, superadmin.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Belum login.' });
    if (req.auth.role === 'superadmin') return next();
    if (roles.includes(req.auth.role)) return next();
    return res.status(403).json({ error: 'Akses ditolak untuk peran Anda.' });
  };
}

/**
 * Middleware factory: verifikasi pondId milik organisasi user.
 * Jika superadmin → lewat. Jika bukan → cek pond → farm → org_id.
 * @param {string} paramName — nama parameter Express (default 'pondId')
 */
function requirePondAccess(paramName = 'pondId') {
  return async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Belum login.' });
    if (req.auth.role === 'superadmin') return next();
    const pondId = req.params[paramName];
    if (!pondId) return res.status(400).json({ error: 'pondId wajib.' });
    try {
      const r = await req.app.locals.pool.query(
        `SELECT 1 FROM ponds p JOIN farms f ON p.farm_id = f.farm_id
         WHERE p.pond_id = $1 AND f.org_id = $2`, [pondId, req.auth.org]);
      if (!r.rows.length) return res.status(404).json({ error: 'Kolam tidak ditemukan atau bukan milik organisasi Anda.' });
      next();
    } catch (e) { res.status(500).json({ error: e.message }); }
  };
}

/**
 * Middleware factory: verifikasi lele deviceId milik organisasi user.
 * Path: lele_devices → pond_id → ponds → farm_id → farms → org_id.
 * @param {string} paramName — nama parameter Express (default 'deviceId')
 */
function requireDeviceAccess(paramName = 'deviceId') {
  return async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Belum login.' });
    if (req.auth.role === 'superadmin') return next();
    const deviceId = req.params[paramName];
    if (!deviceId) return res.status(400).json({ error: 'deviceId wajib.' });
    try {
      const r = await req.app.locals.pool.query(
        `SELECT 1 FROM lele_devices ld
         JOIN ponds p ON ld.pond_id = p.pond_id
         JOIN farms f ON p.farm_id = f.farm_id
         WHERE ld.device_id = $1 AND f.org_id = $2`, [deviceId, req.auth.org]);
      if (!r.rows.length) return res.status(404).json({ error: 'Perangkat tidak ditemukan atau bukan milik organisasi Anda.' });
      next();
    } catch (e) { res.status(500).json({ error: e.message }); }
  };
}

/**
 * Helper: tambahkan filter org_id ke query SQL yang melibatkan ponds/farms.
 * Superadmin (org=null) → tidak difilter.
 * @param {string|null} orgId — req.auth.org
 * @param {Array} params — array parameter SQL yang akan di-push
 * @param {string} farmAlias — alias tabel farms dalam query (default 'f')
 * @returns {{ clause: string, paramIdx: number|null }}
 *   clause: string kosong atau ` AND f.org_id = $N`
 */
function orgFilter(orgId, params, farmAlias = 'f') {
  if (!orgId) return { clause: '', paramIdx: null };
  params.push(orgId);
  return { clause: ` AND ${farmAlias}.org_id = $${params.length}`, paramIdx: params.length };
}

module.exports = { requireRole, requirePondAccess, requireDeviceAccess, orgFilter };
