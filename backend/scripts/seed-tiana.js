// ======================================================================
// Seed data DEMO: Kelompok Tani Ternak Tunas Mekar (Pak Tiana) — IDEMPOTEN.
// Untuk showcase ke UMKM peternak lele: 1 organisasi, 1 pemilik (quick-login),
// 3 KOLAM di tahap berbeda + feeder + data sensor + riwayat panen ber-HPP
// (termasuk 1 siklus RUGI untuk edukasi).
//
// Jalankan di server:  ./run.sh seed-tiana
//   (atau: docker compose exec -T backend node scripts/seed-tiana.js)
// Aman diulang.
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
const FEED_PRICE = 12450;                 // Rp/kg (1 kuintal = Rp 1.245.000)

// --- Definisi 3 kolam Pak Tiana (tahap berbeda) ---
const PONDS = [
  {
    key: 'c1', name: 'Kolam Lele C1', benih: 3000, size: 60, stock: '2026-06-05', target: '2026-09-05',
    feeder: 'lele_tunasc1', avg_g: 78, deaths: 150, feed_kg: 48,
    ops: [['listrik', 150000], ['tenaga', 300000]],
    sensor: { t: 28.4, do: 5.6, ph: 7.2, tur: 18, dep: 82 },
    today: [['Pagi 07:00', 7, true, 600, 610], ['Sore 17:00', 17, true, 600, 592]],
    history: [
      { start: '2025-09-01', harvest: '2025-12-03', sr: 95, kg: 320, price: 25000, feed: 320, fry: 1500000, op: 800000 },
      { start: '2025-12-20', harvest: '2026-03-22', sr: 91, kg: 290, price: 23000, feed: 319, fry: 1500000, op: 850000 },
      { start: '2026-03-25', harvest: '2026-05-28', sr: 96, kg: 335, price: 26000, feed: 318, fry: 1500000, op: 780000 },
    ],
  },
  {
    key: 'c2', name: 'Kolam Lele C2', benih: 2500, size: 50, stock: '2026-04-20', target: '2026-07-25',
    feeder: 'lele_tunasc2', avg_g: 118, deaths: 120, feed_kg: 230,   // menjelang panen
    ops: [['listrik', 180000], ['tenaga', 350000], ['obat', 90000]],
    sensor: { t: 29.1, do: 4.7, ph: 7.4, tur: 38, dep: 74 },          // DO rendah + keruh → alert (demo)
    today: [['Pagi 07:00', 7, true, 720, 715], ['Siang 12:00', 12, false, 720, 0], ['Sore 17:00', 17, true, 720, 700]],
    history: [
      { start: '2025-10-05', harvest: '2026-01-10', sr: 93, kg: 250, price: 24000, feed: 255, fry: 1250000, op: 700000 },
      { start: '2026-01-25', harvest: '2026-04-15', sr: 88, kg: 230, price: 21000, feed: 260, fry: 1250000, op: 820000 }, // RUGI
    ],
  },
  {
    key: 'c3', name: 'Kolam Lele C3', benih: 3500, size: 70, stock: '2026-07-08', target: '2026-10-08',
    feeder: null, avg_g: 22, deaths: 60, feed_kg: 9,                  // baru tebar (manual, tanpa feeder)
    ops: [['tenaga', 150000]],
    sensor: { t: 27.8, do: 6.1, ph: 7.0, tur: 12, dep: 88 },
    today: [],
    history: [
      { start: '2025-11-10', harvest: '2026-02-12', sr: 94, kg: 360, price: 25500, feed: 355, fry: 1750000, op: 900000 },
      { start: '2026-03-01', harvest: '2026-06-05', sr: 90, kg: 330, price: 22000, feed: 360, fry: 1750000, op: 950000 },
    ],
  },
];

const pid = (k) => 'pond_' + k + '_tunas';
const r2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // 1) Organisasi + Pemilik Pak Tiana (+ quick-login)
    await c.query(`INSERT INTO organizations (org_id, name) VALUES ($1,$2) ON CONFLICT (org_id) DO UPDATE SET name=EXCLUDED.name`,
      [ORG, 'Kelompok Tani Ternak Tunas Mekar']);
    const hash = bcrypt.hashSync('Tiana12345', 10);
    await c.query(
      `INSERT INTO users (user_id, org_id, email, name, password_hash, role, quick_login)
       VALUES ('usr_tiana',$1,'tiana@tunasmekar.id','Pak Tiana',$2,'pemilik',TRUE)
       ON CONFLICT (email) DO UPDATE SET org_id=EXCLUDED.org_id, name=EXCLUDED.name, role='pemilik', quick_login=TRUE, is_active=TRUE`,
      [ORG, hash]);
    await c.query(`UPDATE quick_login_config SET enabled=TRUE, show_button_on_login=TRUE, url_token=COALESCE(url_token,$1), updated_at=NOW() WHERE id=1`,
      [crypto.randomBytes(16).toString('hex')]);

    // 2) Peternakan
    await c.query(
      `INSERT INTO farms (farm_id, name, location, owner, description, org_id) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (farm_id) DO UPDATE SET name=EXCLUDED.name, location=EXCLUDED.location, owner=EXCLUDED.owner, org_id=EXCLUDED.org_id`,
      [FARM, 'Kelompok Tani Ternak Tunas Mekar',
       'jl.Mekarwangi Rt.03 Rw.13 Desa Sariwangi Kec.Parongpong Kab. Bandung Barat',
       'Pak Tiana', 'Budidaya lele kelompok tani (demo UMKM)', ORG]);

    // Bersihkan data seed lama untuk kolam ini (idempoten + hapus skema id lama)
    const pondIds = PONDS.map(p => pid(p.key));
    await c.query(`DELETE FROM pond_cycles WHERE pond_id = ANY($1)`, [pondIds]);
    await c.query(`DELETE FROM mortality_records WHERE pond_id = ANY($1)`, [pondIds]);
    await c.query(`DELETE FROM feeding_logs WHERE pond_id = ANY($1)`, [pondIds]);
    await c.query(`DELETE FROM biomass_samples WHERE pond_id = ANY($1)`, [pondIds]);
    await c.query(`DELETE FROM operational_costs WHERE pond_id = ANY($1)`, [pondIds]);
    await c.query(`DELETE FROM lele_feed_sessions WHERE pond_id = ANY($1)`, [pondIds]);
    await c.query(`DELETE FROM sensor_data WHERE pond_id = ANY($1) AND source='seed'`, [pondIds]);

    for (const p of PONDS) {
      const P = pid(p.key);
      const CA = 'cyc_' + p.key + '_active';

      // Kolam
      await c.query(
        `INSERT INTO ponds (pond_id, farm_id, name, fish_type, size_m2, max_depth, fish_count, initial_fish_count, stocking_date, device_mode)
         VALUES ($1,$2,$3,'Lele',$4,150,$5,$5,$6,'dummy')
         ON CONFLICT (pond_id) DO UPDATE SET farm_id=EXCLUDED.farm_id, name=EXCLUDED.name, size_m2=EXCLUDED.size_m2,
           fish_count=EXCLUDED.fish_count, initial_fish_count=EXCLUDED.initial_fish_count, stocking_date=EXCLUDED.stocking_date`,
        [P, FARM, p.name, p.size, p.benih, p.stock]);
      if (!(await c.query(`SELECT 1 FROM sensor_thresholds WHERE pond_id=$1`, [P])).rows.length)
        await c.query(`INSERT INTO sensor_thresholds (pond_id) VALUES ($1)`, [P]);
      if (!(await c.query(`SELECT 1 FROM device_status WHERE pond_id=$1`, [P])).rows.length)
        await c.query(`INSERT INTO device_status (pond_id, device_id, is_connected) VALUES ($1,$2,FALSE)`, [P, 'ESP32-' + P]);
      await c.query(
        `INSERT INTO feed_stock (pond_id, current_stock_kg, low_threshold_kg, price_per_kg) VALUES ($1,$2,10,$3)
         ON CONFLICT (pond_id) DO UPDATE SET current_stock_kg=EXCLUDED.current_stock_kg, low_threshold_kg=10, price_per_kg=$3`,
        [P, p.feeder ? 55 : 40, FEED_PRICE]);

      // Feeder (bila ada)
      if (p.feeder) {
        await c.query(
          `INSERT INTO lele_devices (device_id, pond_id, name, feeding_per_day, feeding_rate_percent, avg_fish_g, fish_count, next_schedule_hhmm)
           VALUES ($1,$2,$3,3,4,$4,$5,'17:00')
           ON CONFLICT (device_id) DO UPDATE SET pond_id=EXCLUDED.pond_id, name=EXCLUDED.name, avg_fish_g=EXCLUDED.avg_fish_g, fish_count=EXCLUDED.fish_count`,
          [p.feeder, P, 'Feeder ' + p.name, p.avg_g, p.benih]);
      }

      // Siklus AKTIF
      const fry = p.benih * 500;
      await c.query(
        `INSERT INTO pond_cycles (cycle_id, pond_id, start_date, initial_stock, fry_size, fry_cost_total, initial_feed_kg,
           target_harvest_date, target_weight_g, feeding_rate_percent, status, notes)
         VALUES ($1,$2,$3,$4,'5-7 cm',$5,100,$6,125,4,'active',$7)
         ON CONFLICT (cycle_id) DO UPDATE SET status='active', start_date=EXCLUDED.start_date, initial_stock=EXCLUDED.initial_stock, fry_cost_total=EXCLUDED.fry_cost_total`,
        [CA, P, p.stock, p.benih, fry, p.target, `Benih ${p.benih} @Rp500 = Rp${fry.toLocaleString('id-ID')}`]);

      // Data pendukung siklus aktif
      for (const [i, part] of [0.4, 0.35, 0.25].entries())
        await c.query(`INSERT INTO mortality_records (pond_id, cycle_id, death_count, cause, recorded_at) VALUES ($1,$2,$3,'stres',NOW()-($4||' days')::interval)`,
          [P, CA, Math.round(p.deaths * part), (i + 1) * 12]);
      const nFeed = 6;
      for (let i = 0; i < nFeed; i++)
        await c.query(`INSERT INTO feeding_logs (pond_id, cycle_id, feed_amount_kg, feed_type, triggered_by, timestamp) VALUES ($1,$2,$3,'pelet apung','schedule',NOW()-($4||' days')::interval)`,
          [P, CA, r2(p.feed_kg / nFeed), (nFeed - i) * 5]);
      await c.query(`INSERT INTO biomass_samples (sample_id, cycle_id, pond_id, sample_count, total_weight_g, avg_weight_g, feeding_rate_percent, status, sampled_at) VALUES ($1,$2,$3,20,$4,$5,4,'completed',NOW()-'3 days'::interval)`,
        ['smp_' + p.key, CA, P, p.avg_g * 20, p.avg_g]);
      for (const [t, amt] of p.ops)
        await c.query(`INSERT INTO operational_costs (cycle_id, pond_id, cost_type, amount, description) VALUES ($1,$2,$3,$4,'siklus aktif')`, [CA, P, t, amt]);

      // Data sensor kualitas air (10 titik terakhir, untuk grafik/kartu)
      const s = p.sensor;
      for (let i = 9; i >= 0; i--) {
        const j = () => (Math.random() - 0.5);
        await c.query(
          `INSERT INTO sensor_data (farm_id, pond_id, temperature, depth, dissolved_oxygen, turbidity, ph, source, timestamp)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'seed',NOW()-($8||' minutes')::interval)`,
          [FARM, P, r2(s.t + j()), r2(s.dep + j() * 3), r2(s.do + j() * 0.4), r2(s.tur + j() * 4), r2(s.ph + j() * 0.15), i * 20]);
      }

      // Sesi feeder hari ini + 2 hari lalu (bila ada feeder)
      if (p.feeder) {
        let n = 0;
        for (const [name, hour, ok, tg, ac] of p.today) {
          n++;
          await c.query(
            `INSERT INTO lele_feed_sessions (feed_session_id, device_id, pond_id, session_name, target_total_g, actual_total_g, planned_batch_count, actual_batch_count, success, started_at, completed_at)
             VALUES ($1,$2,$3,$4,$5,$6,2,$7,$8, CURRENT_DATE+($9||' hours')::interval, CURRENT_DATE+($9||' hours')::interval+'3 minutes'::interval)
             ON CONFLICT (feed_session_id) DO NOTHING`,
            [`sess_tunas_${p.key}_t${n}`, p.feeder, P, name, tg, ac, ok ? 2 : 1, ok, hour]);
        }
        // 2 hari sebelumnya, 2 sesi sukses/hari
        for (let d = 1; d <= 2; d++) for (const [name, hour] of [['Pagi 07:00', 7], ['Sore 17:00', 17]]) {
          await c.query(
            `INSERT INTO lele_feed_sessions (feed_session_id, device_id, pond_id, session_name, target_total_g, actual_total_g, planned_batch_count, actual_batch_count, success, started_at, completed_at)
             VALUES ($1,$2,$3,$4,650,640,2,2,TRUE, CURRENT_DATE-($5||' days')::interval+($6||' hours')::interval, CURRENT_DATE-($5||' days')::interval+($6||' hours')::interval+'3 minutes'::interval)
             ON CONFLICT (feed_session_id) DO NOTHING`,
            [`sess_tunas_${p.key}_d${d}_${hour}`, p.feeder, P, name, d, hour]);
        }
      }

      // Riwayat panen (HPP & keuntungan)
      let hi = 0;
      for (const h of p.history) {
        hi++;
        const revenue = h.kg * h.price;
        const feed_cost = h.feed * FEED_PRICE;
        const total_cost = h.fry + feed_cost + h.op;
        const profit = revenue - total_cost;
        const roi = total_cost > 0 ? (profit / total_cost) * 100 : 0;
        const fcr = h.kg > 0 ? h.feed / h.kg : null;
        await c.query(
          `INSERT INTO pond_cycles (cycle_id, pond_id, start_date, initial_stock, fry_size, fry_cost_total, target_weight_g, feeding_rate_percent, status,
             harvest_date, harvest_total_kg, harvest_price_per_kg, harvest_revenue, survival_rate, fcr, total_feed_kg, total_cost, profit, roi, notes)
           VALUES ($1,$2,$3,$4,'5-7 cm',$5,125,4,'completed',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (cycle_id) DO UPDATE SET status='completed', harvest_total_kg=EXCLUDED.harvest_total_kg,
             harvest_revenue=EXCLUDED.harvest_revenue, total_cost=EXCLUDED.total_cost, profit=EXCLUDED.profit, roi=EXCLUDED.roi`,
          [`cyc_${p.key}_h${hi}`, P, h.start, p.benih, h.fry, h.harvest, h.kg, h.price, revenue,
           h.sr, r2(fcr * 100) / 100, h.feed, total_cost, profit, r2(roi), profit < 0 ? 'Panen — rugi (harga jatuh)' : 'Panen selesai']);
      }
    }

    await c.query('COMMIT');
    console.log('\n✅ Seed DEMO Tunas Mekar berhasil.');
    console.log('   Pemilik : Pak Tiana → login  tiana@tunasmekar.id / Tiana12345  (Quick-Login aktif)');
    console.log('   Kolam   :');
    console.log('     • Kolam Lele C1 — mid-cycle, feeder, kualitas air normal');
    console.log('     • Kolam Lele C2 — menjelang panen, feeder, DO rendah + keruh (alert), ada sesi feeding GAGAL hari ini');
    console.log('     • Kolam Lele C3 — baru tebar, tanpa feeder (manual)');
    console.log('   Tiap kolam: siklus aktif + data sensor + riwayat panen ber-HPP (C2 ada 1 siklus RUGI utk edukasi).');
    console.log('   Lihat: Dashboard, Perbandingan Kolam, Detail Kolam (Siklus/Keuangan/Pakan/Monitor), Perangkat Air.\n');
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
