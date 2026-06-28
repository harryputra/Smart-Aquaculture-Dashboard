// ======================================================================
// Auth multi-tenant: bcrypt + JWT (cookie HttpOnly) + role + audit.
// Lihat docs/RENCANA-AUTH-MULTITENANT.md
// Fase 1: endpoint + middleware + bootstrap admin. Belum di-enforce global
// (route-protection & scoping = Fase 2).
// ======================================================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const SECRET = process.env.AUTH_SECRET || 'dev-secret-ganti-di-produksi';
const ACCESS_MS = 15 * 60 * 1000;          // 15 menit
const REFRESH_MS = 7 * 24 * 3600 * 1000;   // 7 hari
const isProd = process.env.NODE_ENV === 'production';

const ROLES = ['superadmin', 'pemilik', 'pekerja', 'pengamat'];
const cookieOpts = (maxAge) => ({ httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge });
const signAccess = (u) => jwt.sign({ uid: u.user_id, role: u.role, org: u.org_id, typ: 'access' }, SECRET, { expiresIn: '15m' });
const signRefresh = (u) => jwt.sign({ uid: u.user_id, typ: 'refresh' }, SECRET, { expiresIn: '7d' });
const publicUser = (u) => u && { user_id: u.user_id, email: u.email, name: u.name, role: u.role, org_id: u.org_id };

// Set cookie sesi (access + refresh). Dipakai login biasa & quick-login.
function issueSession(res, u) {
  res.cookie('at', signAccess(u), cookieOpts(ACCESS_MS));
  res.cookie('rt', signRefresh(u), cookieOpts(REFRESH_MS));
}

// Path yang boleh diakses tanpa login (termasuk endpoint OTA yang diakses device).
const OPEN_PATHS = [
  /^\/api\/auth\//, /^\/api\/quick-login/, /^\/api\/health$/, /^\/health$/,
  /^\/api\/lele\/firmware\/latest/,      // self-check device
  /^\/api\/lele\/firmware\/download\//,  // unduh .bin oleh device
];

// Gerbang global: semua /api/ wajib login (kecuali OPEN_PATHS). Set req.auth.
function authGate(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const p = req.path;
  if (!p.startsWith('/api/')) return next();
  if (OPEN_PATHS.some((re) => re.test(p))) return next();
  const tok = req.cookies?.at;
  if (!tok) return res.status(401).json({ error: 'Belum login.' });
  try {
    const d = jwt.verify(tok, SECRET);
    if (d.typ !== 'access') throw new Error('typ');
    req.auth = d;
    next();
  } catch { return res.status(401).json({ error: 'Sesi tidak valid / kedaluwarsa.' }); }
}

// Kebijakan peran kasar: Pengamat read-only; hapus (DELETE) hanya Pemilik+.
function rolePolicy(req, res, next) {
  if (!req.auth) return next(); // path terbuka
  const role = req.auth.role;
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (role === 'pengamat' && isWrite)
    return res.status(403).json({ error: 'Akun Pengamat hanya bisa melihat (read-only).' });
  if (req.method === 'DELETE' && !['pemilik', 'superadmin'].includes(role))
    return res.status(403).json({ error: 'Hanya Pemilik yang boleh menghapus.' });
  next();
}

function registerAuthHandlers({ app, pool }) {
  const audit = (action, x = {}) => pool.query(
    `INSERT INTO auth_audit (action, user_id, email, ip, user_agent, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
    [action, x.userId || null, x.email || null, x.ip || null, x.ua || null, x.detail || null],
  ).catch(() => {});

  const userByEmail = async (email) =>
    (await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1) AND is_active=TRUE LIMIT 1`, [email])).rows[0] || null;
  const userById = async (uid) =>
    (await pool.query(`SELECT * FROM users WHERE user_id=$1 AND is_active=TRUE LIMIT 1`, [uid])).rows[0] || null;

  // ---- Middleware (dipakai modul lain via app.locals.auth pada Fase 2) ----
  function requireAuth(req, res, next) {
    const tok = req.cookies?.at;
    if (!tok) return res.status(401).json({ error: 'Belum login.' });
    try {
      const p = jwt.verify(tok, SECRET);
      if (p.typ !== 'access') throw new Error('typ');
      req.auth = p;
      next();
    } catch { return res.status(401).json({ error: 'Sesi tidak valid / kedaluwarsa.' }); }
  }
  function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Belum login.' });
      if (req.auth.role === 'superadmin' || roles.includes(req.auth.role)) return next();
      return res.status(403).json({ error: 'Akses ditolak untuk peran Anda.' });
    };
  }

  // Lockout sederhana: maks 8 percobaan/menit/IP.
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi sebentar.' },
  });

  // ---- Endpoints ----
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const ip = req.ip, ua = req.headers['user-agent'];
    try {
      const email = String(req.body?.email || '').trim().slice(0, 255);
      const password = String(req.body?.password || '').slice(0, 200);
      if (!email || !password) return res.status(400).json({ error: 'Email & password wajib.' });
      const u = await userByEmail(email);
      const ok = u && bcrypt.compareSync(password, u.password_hash);
      if (!ok) { audit('LOGIN_FAIL', { email, ip, ua }); return res.status(401).json({ error: 'Email atau password salah.' }); }
      issueSession(res, u);
      pool.query(`UPDATE users SET last_login=NOW() WHERE user_id=$1`, [u.user_id]).catch(() => {});
      audit('LOGIN_OK', { userId: u.user_id, email: u.email, ip, ua });
      res.json({ user: publicUser(u) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    const tok = req.cookies?.rt;
    if (!tok) return res.status(401).json({ error: 'Tidak ada sesi.' });
    try {
      const p = jwt.verify(tok, SECRET);
      if (p.typ !== 'refresh') throw new Error('typ');
      const u = await userById(p.uid);
      if (!u) return res.status(401).json({ error: 'User tidak aktif.' });
      issueSession(res, u);
      res.json({ user: publicUser(u) });
    } catch { return res.status(401).json({ error: 'Sesi kedaluwarsa, silakan login ulang.' }); }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const u = await userById(req.auth.uid);
    if (!u) return res.status(401).json({ error: 'User tidak ditemukan.' });
    res.json({ user: publicUser(u) });
  });

  app.post('/api/auth/logout', (req, res) => {
    audit('LOGOUT', { ip: req.ip, ua: req.headers['user-agent'] });
    res.clearCookie('at', { path: '/' });
    res.clearCookie('rt', { path: '/' });
    res.json({ success: true });
  });

  // Ekspos middleware untuk modul lain (Fase 2).
  app.locals.auth = { requireAuth, requireRole, ROLES };

  ensureBootstrap(pool).catch((e) => console.error('⚠ Auth bootstrap error:', e.message));
  console.log('✓ Auth handlers terdaftar (Fase 1 — belum di-enforce global)');
}

// Pastikan organisasi default + akun superadmin dari .env (idempoten).
async function ensureBootstrap(pool) {
  await pool.query(
    `INSERT INTO organizations (org_id, name) SELECT 'org_default','Organisasi Default'
     WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE org_id='org_default')`,
  );
  const email = (process.env.ADMIN_EMAIL || 'admin@aquaculture.local').trim();
  const pass = process.env.ADMIN_PASSWORD || 'admin123';
  const ex = await pool.query(`SELECT 1 FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
  if (!ex.rows.length) {
    const hash = bcrypt.hashSync(String(pass).slice(0, 200), 10);
    await pool.query(
      `INSERT INTO users (user_id, org_id, email, name, password_hash, role)
       VALUES ('usr_admin', NULL, $1, 'Administrator', $2, 'superadmin')`,
      [email, hash],
    );
    console.log(`✓ Superadmin dibuat: ${email}`);
    if (pass === 'admin123') console.warn('⚠ ADMIN_PASSWORD masih default "admin123" — WAJIB ganti di .env sebelum produksi!');
  }
}

module.exports = { registerAuthHandlers, authGate, rolePolicy, issueSession, ROLES };
