// ======================================================================
// Seed data: Kelompok Tani Ternak Tunas Mekar (Pak Tiana) — IDEMPOTEN.
// Membuat: organisasi + user Pemilik (Pak Tiana, quick-login) + peternakan +
// Kolam Lele C1 + siklus AKTIF (3000 benih, mulai 5 Jun 2026) + assign feeder +
// 3 siklus PANEN (riwayat) ber-HPP/keuntungan.
//
// Jalankan di server:  docker compose exec -T backend node scripts/seed-tiana.js
// (atau ./run.sh seed-tiana). Aman diulang.
// ======================================================================
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'aquaculture',
  password: process.env.DB_PASSWORD || 'aquaculture123',
  database: process.env.DB_NAME || 'aquaculture',
});

const ORG = 'org_tunas_mekar';
const FARM = 'farm_tunas_mekar';
const POND = 'pond_c1_tunas';
const DEV = 'lele_tunasc1';
const CYC_ACTIVE = 'cyc_tunas_active';
const FEED_PRICE = 12450;              // Rp/kg (1 kuintal = Rp 1.245.000)

// Riwayat panen (HPP & keuntungan bervariasi per siklus)
const HISTORY = [
  { id: 'cyc_tunas_h1', start: '2025-09-01', harvest: '2025-12-03', sr: 95.0, kg: 320, price: 25000, feed_kg: 320, fry: 1500000, op: 800000 },
  { id: 'cyc_tunas_h2', start: '2025-12-20', harvest: '2026-03-22', sr: 91.0, kg: 290, price: 23000, feed_kg: 319, fry: 1500000, op: 850000 },
  { id: 'cyc_tunas_h3', start: '2026-03-25', harvest: '2026-05-28', sr: 96.0, kg: 335, price: 26000, feed_kg: 318, fry: 1500000, op: 780000 },
];

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // 1) Organisasi
    await c.query(
      `INSERT INTO organizations (org_id, name) VALUES ($1,$2)
       ON CONFLICT (org_id) DO UPDATE SET name=EXCLUDED.name`,
      [ORG, 'Kelompok Tani Ternak Tunas Mekar']);

    // 2) User Pemilik: Pak Tiana (+ quick-login)
    const hash = bcrypt.hashSync('Tiana12345', 10);
    await c.query(
      `INSERT INTO users (user_id, org_id, email, name, password_hash, role, quick_login)
       VALUES ('usr_tiana', $1, 'tiana@tunasmekar.id', 'Pak Tiana', $2, 'pemilik', TRUE)
       ON CONFLICT (email) DO UPDATE SET org_id=EXCLUDED.org_id, name=EXCLUDED.name,
         role='pemilik', quick_login=TRUE, is_active=TRUE`,
      [ORG, hash]);

    // Aktifkan Quick-Login (tombol di halaman login)
    await c.query(
      `UPDATE quick_login_config
         SET enabled=TRUE, show_button_on_login=TRUE, url_token=COALESCE(url_token,$1), updated_at=NOW()
       WHERE id=1`, [crypto.randomBytes(16).toString('hex')]);

    // 3) Peternakan
    await c.query(
      `INSERT INTO farms (farm_id, name, location, owner, description, org_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (farm_id) DO UPDATE SET name=EXCLUDED.name, location=EXCLUDED.location,
         owner=EXCLUDED.owner, org_id=EXCLUDED.org_id`,
      [FARM, 'Kelompok Tani Ternak Tunas Mekar',
       'jl.Mekarwangi Rt.03 Rw.13 Desa Sariwangi Kec.Parongpong Kab. Bandung Barat',
       'Pak Tiana', 'Budidaya lele kelompok tani', ORG]);

    // 4) Kolam Lele C1
    await c.query(
      `INSERT INTO ponds (pond_id, farm_id, name, fish_type, size_m2, max_depth, fish_count, initial_fish_count, stocking_date, device_mode)
       VALUES ($1,$2,'Kolam Lele C1','Lele',60,150,3000,3000,'2026-06-05','dummy')
       ON CONFLICT (pond_id) DO UPDATE SET farm_id=EXCLUDED.farm_id, name=EXCLUDED.name,
         fish_count=3000, initial_fish_count=3000, stocking_date='2026-06-05'`,
      [POND, FARM]);
    await c.query(`INSERT INTO sensor_thresholds (pond_id) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM sensor_thresholds WHERE pond_id=$1)`, [POND]);
    await c.query(`INSERT INTO device_status (pond_id, device_id, is_connected) SELECT $1,$2,FALSE WHERE NOT EXISTS (SELECT 1 FROM device_status WHERE pond_id=$1)`, [POND, 'ESP32-' + POND]);

    // Stok pakan (beli 1 kuintal @ Rp 1.245.000 → Rp 12.450/kg; tersisa ~55 kg)
    await c.query(
      `INSERT INTO feed_stock (pond_id, current_stock_kg, low_threshold_kg, price_per_kg)
       VALUES ($1, 55, 10, $2)
       ON CONFLICT (pond_id) DO UPDATE SET current_stock_kg=55, low_threshold_kg=10, price_per_kg=$2`,
      [POND, FEED_PRICE]);

    // 5) Assign feeder (mesin pakan) ke kolam
    await c.query(
      `INSERT INTO lele_devices (device_id, pond_id, name, feeding_per_day, feeding_rate_percent, avg_fish_g, fish_count, next_schedule_hhmm)
       VALUES ($1,$2,'Feeder Kolam C1',3,4,72,3000,'17:00')
       ON CONFLICT (device_id) DO UPDATE SET pond_id=EXCLUDED.pond_id, name=EXCLUDED.name,
         feeding_per_day=3, feeding_rate_percent=4, avg_fish_g=72, fish_count=3000`,
      [DEV, POND]);

    // 6) Siklus AKTIF (mulai 5 Jun 2026, target panen 5 Sep 2026)
    await c.query(
      `INSERT INTO pond_cycles (cycle_id, pond_id, start_date, initial_stock, fry_size, fry_cost_total,
         initial_feed_kg, target_harvest_date, target_weight_g, feeding_rate_percent, status, notes)
       VALUES ($1,$2,'2026-06-05',3000,'5-7 cm',1500000,100,'2026-09-05',125,4,'active','Benih 3000 @Rp500 = Rp1.500.000')
       ON CONFLICT (cycle_id) DO UPDATE SET status='active', start_date='2026-06-05', initial_stock=3000, fry_cost_total=1500000`,
      [CYC_ACTIVE, POND]);

    // Data pendukung siklus aktif (idempoten: hapus lalu isi)
    await c.query(`DELETE FROM mortality_records WHERE cycle_id=$1`, [CYC_ACTIVE]);
    await c.query(`DELETE FROM feeding_logs WHERE cycle_id=$1`, [CYC_ACTIVE]);
    await c.query(`DELETE FROM biomass_samples WHERE cycle_id=$1`, [CYC_ACTIVE]);
    await c.query(`DELETE FROM operational_costs WHERE cycle_id=$1`, [CYC_ACTIVE]);

    // Kematian (~150 ekor → SR ~95%)
    for (const [d, n] of [['2026-06-12', 60], ['2026-06-28', 50], ['2026-07-15', 40]])
      await c.query(`INSERT INTO mortality_records (pond_id, cycle_id, death_count, cause, recorded_at) VALUES ($1,$2,$3,'stres',$4)`, [POND, CYC_ACTIVE, n, d]);

    // Feeding logs (~45 kg total)
    for (const [d, kg] of [['2026-06-10', 5], ['2026-06-18', 6], ['2026-06-26', 7], ['2026-07-04', 8], ['2026-07-12', 9], ['2026-07-20', 10]])
      await c.query(`INSERT INTO feeding_logs (pond_id, cycle_id, feed_amount_kg, feed_type, triggered_by, timestamp) VALUES ($1,$2,$3,'pelet apung','schedule',$4)`, [POND, CYC_ACTIVE, kg, d]);

    // Sampling biomassa (bobot rata² ~72 g)
    await c.query(
      `INSERT INTO biomass_samples (sample_id, cycle_id, pond_id, sample_count, total_weight_g, avg_weight_g, feeding_rate_percent, status, sampled_at)
       VALUES ($1,$2,$3,20,1440,72,4,'completed','2026-07-20')`,
      ['smp_tunas_1', CYC_ACTIVE, POND]);

    // Biaya operasional siklus aktif
    for (const [t, amt] of [['listrik', 150000], ['tenaga', 300000]])
      await c.query(`INSERT INTO operational_costs (cycle_id, pond_id, cost_type, amount, description) VALUES ($1,$2,$3,$4,$5)`, [CYC_ACTIVE, POND, t, amt, 'siklus aktif']);

    // 7) Riwayat panen (HPP & keuntungan)
    for (const h of HISTORY) {
      const revenue = h.kg * h.price;
      const feed_cost = h.feed_kg * FEED_PRICE;
      const total_cost = h.fry + feed_cost + h.op;
      const profit = revenue - total_cost;
      const roi = total_cost > 0 ? (profit / total_cost) * 100 : 0;
      const fcr = h.kg > 0 ? h.feed_kg / h.kg : null;
      await c.query(
        `INSERT INTO pond_cycles (cycle_id, pond_id, start_date, initial_stock, fry_size, fry_cost_total,
           target_weight_g, feeding_rate_percent, status,
           harvest_date, harvest_total_kg, harvest_price_per_kg, harvest_revenue,
           survival_rate, fcr, total_feed_kg, total_cost, profit, roi, notes)
         VALUES ($1,$2,$3,3000,'5-7 cm',$4,125,4,'completed',
           $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Panen selesai')
         ON CONFLICT (cycle_id) DO UPDATE SET status='completed',
           harvest_total_kg=EXCLUDED.harvest_total_kg, harvest_revenue=EXCLUDED.harvest_revenue,
           total_cost=EXCLUDED.total_cost, profit=EXCLUDED.profit, roi=EXCLUDED.roi`,
        [h.id, POND, h.start, h.fry, h.harvest, h.kg, h.price, revenue,
         h.sr, fcr, h.feed_kg, total_cost, profit, Math.round(roi * 100) / 100]);
    }

    await c.query('COMMIT');
    console.log('\n✅ Seed Tunas Mekar berhasil.');
    console.log('   Organisasi : Kelompok Tani Ternak Tunas Mekar');
    console.log('   Pemilik    : Pak Tiana → login  tiana@tunasmekar.id / Tiana12345  (Quick-Login aktif)');
    console.log('   Kolam      : Kolam Lele C1 (3000 benih, mulai 5 Jun 2026, target panen 5 Sep 2026)');
    console.log('   Feeder     : ' + DEV + ' ter-assign ke kolam');
    console.log('   Riwayat    : 3 siklus panen dengan HPP & keuntungan (lihat tab Keuangan / Perbandingan Kolam)\n');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('✖ Seed gagal:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main();
