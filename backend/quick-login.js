// ======================================================================
// Quick-Login aman (pola sim_pbl) — Fase 5.
// - Config DB singleton (quick_login_config). Toggle tanpa restart.
// - Saat enabled=false → SEMUA endpoint publik balas 404 (tak terlihat).
// - URL token acak /q/<token> (validasi constant-time). Token di-null saat off.
// - Opsional passphrase (SHA-256) + expiry. Audit tiap percobaan.
// - Hanya akun dgn flag quick_login=TRUE (akun demo) yang bisa dipakai.
// Admin config di /api/admin/quick-login (wajib login superadmin); endpoint
// publik di /api/quick-login/* (terbuka, tapi 404 saat fitur off).
// ======================================================================
const crypto = require('crypto');
const { issueSession } = require('./auth');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function ctEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}
const magicUrl = (c) => (c.url_token ? `/q/${c.url_token}` : null);
const isActive = (c) => !!c && c.enabled && (!c.expires_at || new Date(c.expires_at) > new Date());

function registerQuickLoginHandlers({ app, pool }) {
  const cfg = async () => (await pool.query(`SELECT * FROM quick_login_config WHERE id = 1`)).rows[0] || { enabled: false };
  const audit = (action, x = {}) => pool.query(
    `INSERT INTO auth_audit (action, user_id, email, ip, detail) VALUES ($1,$2,$3,$4,$5)`,
    [action, x.userId || null, x.email || null, x.ip || null, x.detail || null]).catch(() => {});
  const requireSuper = (req, res, next) => {
    if (req.auth?.role !== 'superadmin') return res.status(403).json({ error: 'Hanya Super Admin.' });
    next();
  };
  const adminView = (c) => ({
    enabled: c.enabled, show_button_on_login: c.show_button_on_login,
    passphrase_enabled: c.passphrase_enabled, expires_at: c.expires_at,
    url_token: c.url_token, magic_url: magicUrl(c),
  });

  // ----------------------- Admin config (superadmin) -----------------------
  app.get('/api/admin/quick-login', requireSuper, async (req, res) => {
    res.json(adminView(await cfg()));
  });

  app.put('/api/admin/quick-login', requireSuper, async (req, res) => {
    try {
      const c = await cfg();
      const enable = !!req.body.enabled;
      const showButton = !!req.body.show_button_on_login;
      const passphrase = req.body.passphrase;            // string | '' | undefined
      const hours = parseInt(req.body.expires_in_hours);

      let url_token = c.url_token;
      let ppEnabled = c.passphrase_enabled;
      let ppHash = c.passphrase_hash;
      let expires_at = c.expires_at;

      if (enable) {
        if (!url_token) url_token = crypto.randomBytes(16).toString('hex');   // ~128-bit
        if (passphrase !== undefined) {
          if (passphrase) { ppEnabled = true; ppHash = sha256(passphrase); }
          else { ppEnabled = false; ppHash = null; }
        }
        expires_at = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null;
      } else {
        url_token = null;   // matikan token saat dinonaktifkan
      }

      const stampCol = enable ? 'last_enabled_by = $7, last_enabled_at = NOW()'
                              : 'last_disabled_by = $7, last_disabled_at = NOW()';
      await pool.query(
        `UPDATE quick_login_config SET enabled=$1, show_button_on_login=$2, url_token=$3,
           passphrase_enabled=$4, passphrase_hash=$5, expires_at=$6, ${stampCol}, updated_at=NOW()
         WHERE id = 1`,
        [enable, showButton, url_token, ppEnabled, ppHash, expires_at, req.auth.uid]);
      audit(enable ? 'QL_ENABLE' : 'QL_DISABLE', { userId: req.auth.uid, ip: req.ip });
      res.json(adminView(await cfg()));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ----------------------- Publik (404 saat fitur off) -----------------------
  app.get('/api/quick-login/public', async (req, res) => {
    const c = await cfg();
    if (!isActive(c)) return res.status(404).json({ error: 'Not found' });
    const viaToken = ctEqual(req.query.token, c.url_token);
    if (!c.show_button_on_login && !viaToken) return res.status(404).json({ error: 'Not found' });
    const accounts = (await pool.query(
      `SELECT user_id, name, email, role FROM users WHERE quick_login = TRUE AND is_active = TRUE ORDER BY role`)).rows;
    res.json({ show_button: !!c.show_button_on_login, passphrase_required: !!c.passphrase_enabled, via_token: viaToken, accounts });
  });

  app.post('/api/quick-login/login', async (req, res) => {
    try {
      const c = await cfg();
      if (!isActive(c)) return res.status(404).json({ error: 'Not found' });
      const { account, token, passphrase } = req.body || {};
      const viaToken = ctEqual(token, c.url_token);
      if (!c.show_button_on_login && !viaToken) return res.status(404).json({ error: 'Not found' });
      if (c.passphrase_enabled && !ctEqual(sha256(passphrase || ''), c.passphrase_hash || '')) {
        audit('QL_FAIL', { ip: req.ip, detail: 'passphrase salah' });
        return res.status(401).json({ error: 'Passphrase salah.' });
      }
      const u = (await pool.query(
        `SELECT * FROM users WHERE user_id = $1 AND quick_login = TRUE AND is_active = TRUE`, [account])).rows[0];
      if (!u) return res.status(400).json({ error: 'Akun quick-login tidak valid.' });
      issueSession(res, u);
      pool.query(`UPDATE users SET last_login = NOW() WHERE user_id = $1`, [u.user_id]).catch(() => {});
      audit('QL_LOGIN', { userId: u.user_id, email: u.email, ip: req.ip });
      res.json({ user: { user_id: u.user_id, email: u.email, name: u.name, role: u.role, org_id: u.org_id } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ Quick-Login handlers terdaftar');
}

module.exports = { registerQuickLoginHandlers };
