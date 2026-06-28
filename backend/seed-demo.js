// ======================================================================
// Seed DEMO (Fase 6) — HANYA dijalankan bila SEED_DEMO=true (mode demo).
// DILARANG jalan di produksi. Idempoten (aman diulang).
// Membuat: organisasi demo + akun contoh tiap peran (quick_login=TRUE) +
// peternakan/kolam contoh + mengaktifkan Quick-Login (tombol di login).
// Seed ESENSIAL (admin dari .env, quick-login OFF) ada di auth.js (selalu).
// ======================================================================
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DEMO_PASS = 'Demo12345';   // memenuhi kebijakan: ≥8 + huruf besar/kecil + angka
const DEMO_ORG = 'org_demo';
const DEMO_ACCOUNTS = [
  { id: 'usr_demo_super', email: 'superdemo@demo.test', name: 'Super Admin (Demo)', role: 'superadmin', org: null },
  { id: 'usr_demo_pemilik', email: 'andri@demo.test', name: 'Pak Andri (Pemilik)', role: 'pemilik', org: DEMO_ORG },
  { id: 'usr_demo_pekerja', email: 'pekerja@demo.test', name: 'Budi (Pekerja)', role: 'pekerja', org: DEMO_ORG },
  { id: 'usr_demo_pengamat', email: 'pengamat@demo.test', name: 'Pengamat (Demo)', role: 'pengamat', org: DEMO_ORG },
];

async function ensureDemoSeed(pool) {
  // 1) Organisasi demo
  await pool.query(
    `INSERT INTO organizations (org_id, name) SELECT $1,$2
     WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE org_id=$1)`,
    [DEMO_ORG, 'UMKM Lele Pak Andri']);

  // 2) Akun contoh tiap peran (quick_login=TRUE)
  const hash = bcrypt.hashSync(DEMO_PASS, 10);
  for (const a of DEMO_ACCOUNTS) {
    await pool.query(
      `INSERT INTO users (user_id, org_id, email, name, password_hash, role, quick_login)
       SELECT $1,$2,$3,$4,$5,$6,TRUE
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email)=lower($3))`,
      [a.id, a.org, a.email, a.name, hash, a.role]);
  }

  // 3) Peternakan + kolam contoh (agar pemilik melihat data)
  await pool.query(
    `INSERT INTO farms (farm_id, name, location, owner, description, org_id) SELECT
       'farm_demo','Budidaya Lele Pak Andri','Bandung, Jawa Barat','Pak Andri','Data contoh untuk demo',$1
     WHERE NOT EXISTS (SELECT 1 FROM farms WHERE farm_id='farm_demo')`, [DEMO_ORG]);
  const ponds = [
    ['pond_demo1', 'Kolam Lele A1', 1200],
    ['pond_demo2', 'Kolam Lele A2', 1500],
  ];
  for (const [pid, pname, count] of ponds) {
    await pool.query(
      `INSERT INTO ponds (pond_id, farm_id, name, fish_type, size_m2, max_depth, fish_count, initial_fish_count, stocking_date)
       SELECT $1,'farm_demo',$2,'Lele',50,150,$3,$3, NOW() - INTERVAL '30 days'
       WHERE NOT EXISTS (SELECT 1 FROM ponds WHERE pond_id=$1)`, [pid, pname, count]);
    await pool.query(`INSERT INTO sensor_thresholds (pond_id) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM sensor_thresholds WHERE pond_id=$1)`, [pid]);
    await pool.query(`INSERT INTO device_status (pond_id, device_id, is_connected) SELECT $1,$2,FALSE WHERE NOT EXISTS (SELECT 1 FROM device_status WHERE pond_id=$1)`, [pid, 'ESP32-' + pid]);
  }

  // 4) Aktifkan Quick-Login (tombol muncul di halaman login)
  const token = crypto.randomBytes(16).toString('hex');
  await pool.query(
    `UPDATE quick_login_config
       SET enabled=TRUE, show_button_on_login=TRUE, url_token=COALESCE(url_token,$1), updated_at=NOW()
     WHERE id=1`, [token]);

  console.log(`✓ Seed DEMO siap — akun: ${DEMO_ACCOUNTS.map(a => a.email).join(', ')} (password: ${DEMO_PASS})`);
}

module.exports = { ensureDemoSeed };
