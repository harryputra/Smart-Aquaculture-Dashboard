// ======================================================================
// Manajemen pengguna & organisasi (Fase 4).
// Endpoint di bawah /api/users & /api/orgs → terlindungi authGate (wajib login).
// Aturan: hanya Pemilik/Superadmin yang boleh kelola user; organisasi hanya
// Superadmin. Pemilik dibatasi pada organisasinya sendiri.
// ======================================================================
const bcrypt = require('bcryptjs');

const MANAGE_ROLES = ['pemilik', 'superadmin'];
const ASSIGNABLE = ['pemilik', 'pekerja', 'pengamat'];   // selain superadmin
const isSuper = (req) => req.auth?.role === 'superadmin';
const strongPassword = (pw) =>
  typeof pw === 'string' && pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
const publicUser = (u) => ({
  user_id: u.user_id, org_id: u.org_id, org_name: u.org_name, email: u.email, name: u.name,
  role: u.role, is_active: u.is_active, last_login: u.last_login, created_at: u.created_at,
});

function registerUserHandlers({ app, pool }) {
  function requireManage(req, res, next) {
    if (!req.auth) return res.status(401).json({ error: 'Belum login.' });
    if (!MANAGE_ROLES.includes(req.auth.role)) return res.status(403).json({ error: 'Hanya Pemilik/Super Admin.' });
    next();
  }
  function requireSuper(req, res, next) {
    if (req.auth?.role !== 'superadmin') return res.status(403).json({ error: 'Hanya Super Admin.' });
    next();
  }

  // ------------------------------ USERS ------------------------------
  app.get('/api/users', requireManage, async (req, res) => {
    try {
      let q = `SELECT u.*, o.name AS org_name FROM users u LEFT JOIN organizations o ON u.org_id = o.org_id`;
      const params = [], where = [];
      if (!isSuper(req)) { params.push(req.auth.org); where.push(`u.org_id = $${params.length}`); }
      else if (req.query.org_id) { params.push(req.query.org_id); where.push(`u.org_id = $${params.length}`); }
      if (where.length) q += ` WHERE ` + where.join(' AND ');
      q += ` ORDER BY u.created_at DESC`;
      const r = await pool.query(q, params);
      res.json(r.rows.map(publicUser));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/users', requireManage, async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 255);
      const name = String(req.body?.name || '').trim().slice(0, 100);
      const password = String(req.body?.password || '');
      let role = String(req.body?.role || 'pekerja');
      let org_id = req.body?.org_id || null;

      if (!email || !password) return res.status(400).json({ error: 'Email & password wajib.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Format email tidak valid.' });
      if (!strongPassword(password)) return res.status(400).json({ error: 'Password minimal 8 karakter, dengan huruf besar, kecil, dan angka.' });

      if (isSuper(req)) {
        if (![...ASSIGNABLE, 'superadmin'].includes(role)) return res.status(400).json({ error: 'Peran tidak valid.' });
        if (role === 'superadmin') org_id = null;
        else if (!org_id) return res.status(400).json({ error: 'Organisasi wajib untuk peran ini.' });
      } else {
        if (!ASSIGNABLE.includes(role)) return res.status(400).json({ error: 'Peran tidak valid.' });
        org_id = req.auth.org;   // pemilik terkunci ke org-nya
      }
      if (org_id) {
        const o = await pool.query(`SELECT 1 FROM organizations WHERE org_id = $1`, [org_id]);
        if (!o.rows.length) return res.status(400).json({ error: 'Organisasi tidak ditemukan.' });
      }
      const dup = await pool.query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [email]);
      if (dup.rows.length) return res.status(409).json({ error: 'Email sudah terpakai.' });

      const user_id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const hash = bcrypt.hashSync(password.slice(0, 200), 10);
      const r = await pool.query(
        `INSERT INTO users (user_id, org_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [user_id, org_id, email, name || email, hash, role]);
      res.json(publicUser(r.rows[0]));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/users/:id', requireManage, async (req, res) => {
    try {
      const target = (await pool.query(`SELECT * FROM users WHERE user_id = $1`, [req.params.id])).rows[0];
      if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
      if (!isSuper(req)) {
        if (target.org_id !== req.auth.org) return res.status(403).json({ error: 'Bukan anggota organisasi Anda.' });
        if (target.role === 'superadmin') return res.status(403).json({ error: 'Tidak diizinkan.' });
      }
      const fields = [], params = []; let i = 1;
      if (req.body.name != null) { fields.push(`name = $${i++}`); params.push(String(req.body.name).slice(0, 100)); }
      if (req.body.role != null) {
        if (target.user_id === req.auth.uid) return res.status(400).json({ error: 'Tidak bisa mengubah peran akun sendiri.' });
        const role = String(req.body.role);
        const allowed = isSuper(req) ? [...ASSIGNABLE, 'superadmin'] : ASSIGNABLE;
        if (!allowed.includes(role)) return res.status(400).json({ error: 'Peran tidak valid.' });
        fields.push(`role = $${i++}`); params.push(role);
      }
      if (req.body.is_active != null) {
        if (target.user_id === req.auth.uid) return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri.' });
        fields.push(`is_active = $${i++}`); params.push(!!req.body.is_active);
      }
      if (req.body.password) {
        if (!strongPassword(req.body.password)) return res.status(400).json({ error: 'Password minimal 8 karakter, dengan huruf besar, kecil, dan angka.' });
        fields.push(`password_hash = $${i++}`); params.push(bcrypt.hashSync(String(req.body.password).slice(0, 200), 10));
      }
      if (!fields.length) return res.status(400).json({ error: 'Tidak ada perubahan.' });
      params.push(req.params.id);
      const r = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE user_id = $${i} RETURNING *`, params);
      res.json(publicUser(r.rows[0]));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/users/:id', requireManage, async (req, res) => {
    try {
      if (req.params.id === req.auth.uid) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
      const target = (await pool.query(`SELECT * FROM users WHERE user_id = $1`, [req.params.id])).rows[0];
      if (!target) return res.status(404).json({ error: 'User tidak ditemukan.' });
      if (!isSuper(req)) {
        if (target.org_id !== req.auth.org) return res.status(403).json({ error: 'Bukan anggota organisasi Anda.' });
        if (target.role === 'superadmin') return res.status(403).json({ error: 'Tidak diizinkan.' });
      }
      await pool.query(`DELETE FROM users WHERE user_id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // --------------------------- ORGANIZATIONS -------------------------
  app.get('/api/orgs', async (req, res) => {
    try {
      if (isSuper(req)) {
        const r = await pool.query(
          `SELECT o.*,
             (SELECT COUNT(*) FROM users WHERE org_id = o.org_id) AS user_count,
             (SELECT COUNT(*) FROM farms WHERE org_id = o.org_id) AS farm_count
           FROM organizations o ORDER BY o.created_at DESC`);
        return res.json(r.rows);
      }
      if (req.auth?.org) {
        const r = await pool.query(`SELECT * FROM organizations WHERE org_id = $1`, [req.auth.org]);
        return res.json(r.rows);
      }
      res.json([]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/orgs', requireSuper, async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim().slice(0, 120);
      if (!name) return res.status(400).json({ error: 'Nama organisasi wajib.' });
      const org_id = 'org_' + Date.now().toString(36);
      const r = await pool.query(`INSERT INTO organizations (org_id, name) VALUES ($1,$2) RETURNING *`, [org_id, name]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/orgs/:id', requireSuper, async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim().slice(0, 120);
      if (!name) return res.status(400).json({ error: 'Nama organisasi wajib.' });
      const r = await pool.query(`UPDATE organizations SET name = $1 WHERE org_id = $2 RETURNING *`, [name, req.params.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Tidak ditemukan.' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/orgs/:id', requireSuper, async (req, res) => {
    try {
      if (req.params.id === 'org_default') return res.status(400).json({ error: 'Organisasi default tidak boleh dihapus.' });
      const f = await pool.query(`SELECT COUNT(*)::int AS n FROM farms WHERE org_id = $1`, [req.params.id]);
      if (f.rows[0].n > 0) return res.status(400).json({ error: 'Masih ada peternakan di organisasi ini. Pindahkan/hapus dulu.' });
      await pool.query(`DELETE FROM organizations WHERE org_id = $1`, [req.params.id]);   // users ikut cascade
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ User/Org management handlers terdaftar');
}

module.exports = { registerUserHandlers };
