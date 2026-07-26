// ======================================================================
// CCTV — peluncur portal (mis. BARDI IPC) + kredensial per organisasi.
//
// Portal CCTV OEM (Bardi/Tuya) tak bisa di-embed (X-Frame-Options: deny) &
// tak bisa auto-login lintas-origin (Same-Origin Policy). Jadi dashboard:
//   1) menyimpan kredensial portal per-org (aman di server, di balik authGate),
//   2) membuka portal di tab baru + menyediakan tombol "salin akun/sandi",
//   3) memetakan kamera ke kolam sebagai katalog.
//
// Password disimpan plaintext KARENA harus bisa ditampilkan ulang (kredensial
// layanan pihak ketiga, bukan password akun kita). Perlindungan: authGate +
// scope org + tidak pernah masuk bundle frontend.
// ======================================================================
const { requireRole } = require('./authorize');

function registerCctvHandlers({ app, pool }) {
  const DEFAULTS = {
    enabled: true,
    portal_url: 'https://ipc.bardi.co.id/login',
    provider_label: 'BARDI IPC',
    country_region: '+62 (Indonesia)',
    account: '', password: '', note: '',
  };

  // Org efektif: non-super memakai org sesi; superadmin boleh menyebut ?org_id / body.org_id.
  const targetOrg = (req) =>
    req.auth?.role === 'superadmin' ? (req.query.org_id || req.body?.org_id || null) : (req.auth?.org || null);

  const s = (v, n) => String(v ?? '').slice(0, n);

  // GET config org (auth wajib via authGate global). Password ikut — dibutuhkan
  // pengguna org untuk login ke portal CCTV.
  app.get('/api/cctv/config', async (req, res) => {
    try {
      const org = targetOrg(req);
      if (!org) return res.json({ ...DEFAULTS, org_id: null, _needsOrg: req.auth?.role === 'superadmin' });
      const r = await pool.query(`SELECT * FROM cctv_config WHERE org_id=$1`, [org]);
      res.json(r.rows[0] || { ...DEFAULTS, org_id: org, _isNew: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUT config (pemilik+). Upsert per org.
  app.put('/api/cctv/config', requireRole('pemilik'), async (req, res) => {
    try {
      const org = targetOrg(req);
      if (!org) return res.status(400).json({ error: 'org_id wajib (pilih organisasi).' });
      const b = req.body || {};
      const r = await pool.query(
        `INSERT INTO cctv_config (org_id, enabled, portal_url, provider_label, country_region, account, password, note, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (org_id) DO UPDATE SET
           enabled=EXCLUDED.enabled, portal_url=EXCLUDED.portal_url, provider_label=EXCLUDED.provider_label,
           country_region=EXCLUDED.country_region, account=EXCLUDED.account, password=EXCLUDED.password,
           note=EXCLUDED.note, updated_at=NOW()
         RETURNING *`,
        [org, b.enabled !== false, s(b.portal_url || DEFAULTS.portal_url, 500), s(b.provider_label || DEFAULTS.provider_label, 100),
         s(b.country_region, 100), s(b.account, 255), s(b.password, 255), s(b.note, 1000)]
      );
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET daftar kamera (auth). Ikutkan nama kolam.
  app.get('/api/cctv/cameras', async (req, res) => {
    try {
      const org = targetOrg(req);
      if (!org) return res.json([]);
      const r = await pool.query(
        `SELECT c.*, p.name AS pond_name FROM cctv_cameras c
         LEFT JOIN ponds p ON c.pond_id = p.pond_id
         WHERE c.org_id=$1 ORDER BY c.sort ASC, c.id ASC`, [org]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST kamera (pemilik+).
  app.post('/api/cctv/cameras', requireRole('pemilik'), async (req, res) => {
    try {
      const org = targetOrg(req);
      if (!org) return res.status(400).json({ error: 'org_id wajib.' });
      const b = req.body || {};
      const r = await pool.query(
        `INSERT INTO cctv_cameras (org_id, pond_id, name, url, note, sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [org, b.pond_id || null, s(b.name || 'Kamera', 120), s(b.url, 500), s(b.note, 500), b.sort | 0]
      );
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Helper: pastikan kamera milik org pemanggil (super bypass).
  async function ownedCamera(req, res) {
    const cur = (await pool.query(`SELECT * FROM cctv_cameras WHERE id=$1`, [req.params.id])).rows[0];
    if (!cur) { res.status(404).json({ error: 'Kamera tidak ditemukan.' }); return null; }
    if (req.auth.role !== 'superadmin' && cur.org_id !== req.auth.org) {
      res.status(403).json({ error: 'Bukan milik organisasi Anda.' }); return null;
    }
    return cur;
  }

  app.put('/api/cctv/cameras/:id', requireRole('pemilik'), async (req, res) => {
    try {
      if (!(await ownedCamera(req, res))) return;
      const b = req.body || {};
      const r = await pool.query(
        `UPDATE cctv_cameras SET pond_id=$1, name=$2, url=$3, note=$4, sort=$5 WHERE id=$6 RETURNING *`,
        [b.pond_id || null, s(b.name || 'Kamera', 120), s(b.url, 500), s(b.note, 500), b.sort | 0, req.params.id]
      );
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/cctv/cameras/:id', requireRole('pemilik'), async (req, res) => {
    try {
      if (!(await ownedCamera(req, res))) return;
      await pool.query(`DELETE FROM cctv_cameras WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ CCTV handlers registered');
}

module.exports = { registerCctvHandlers };
