// ======================================================================
// Backfill RIWAYAT PEMBERIAN PAKAN — isi hari-hari KOSONG dari tanggal tebar
// sampai hari ini untuk tiap kolam yang punya feeder. Mengikuti pola data
// sebelumnya (sesi "AUTO FEED", target ~200 g, mayoritas SUKSES, sedikit GAGAL).
// Hanya mengisi hari yang BELUM punya sesi (tak menimpa data asli).
//
// Jalankan: ./run.sh backfill-feed
//   (atau: docker compose exec -T backend node scripts/backfill-feed-history.js)
// Aman diulang (idempoten): hari yang sudah terisi dilewati; id sesi deterministik.
//
// Penanda backfill: feed_session_id 'feed_bf_...'. Karena diawali 'feed_' →
// TIDAK ikut terhapus saat seed-tiana diulang (seed hanya hapus 'sess_tunas_%').
// ======================================================================
'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'aquaculture',
  password: process.env.DB_PASSWORD || 'aquaculture123',
  database: process.env.DB_NAME || 'aquaculture',
});

(async () => {
  const c = await pool.connect();
  try {
    console.log('▶ Backfill riwayat pemberian pakan (isi hari kosong: tebar → hari ini)...');
    const feeders = (await c.query(`
      SELECT ld.device_id, ld.pond_id, COALESCE(ld.feeding_per_day, 2) AS fpd,
             to_char(p.stocking_date, 'YYYY-MM-DD') AS stocking, p.name AS pond_name
      FROM lele_devices ld JOIN ponds p ON ld.pond_id = p.pond_id
      WHERE p.stocking_date IS NOT NULL AND ld.pond_id IS NOT NULL`)).rows;

    if (!feeders.length) { console.log('  (Tak ada feeder ter-assign + tanggal tebar. Selesai.)'); return; }

    const todayStr = new Date().toISOString().slice(0, 10);
    const end = new Date(todayStr + 'T00:00:00Z');
    let grand = 0;

    for (const f of feeders) {
      const existing = new Set((await c.query(
        `SELECT DISTINCT to_char(started_at, 'YYYY-MM-DD') AS d FROM lele_feed_sessions WHERE pond_id=$1`,
        [f.pond_id])).rows.map((r) => r.d));

      const startD = new Date(f.stocking + 'T00:00:00Z');
      const totalDays = Math.max(1, Math.round((end - startD) / 86400000));
      const n = Math.min(3, Math.max(1, Number(f.fpd) || 2));
      const times = n === 1 ? [8] : n === 2 ? [7, 17] : [7, 12, 17];

      let filled = 0, emptyDays = 0, idx = 0;
      for (let d = new Date(startD); d <= end; d.setUTCDate(d.getUTCDate() + 1), idx++) {
        const ymd = d.toISOString().slice(0, 10);
        if (existing.has(ymd)) continue;                       // hari sudah ada data → lewati
        emptyDays++;
        const base = 180 + Math.round((idx / totalDays) * 70); // target naik 180 → ~250 g (ikan tumbuh)
        for (let i = 0; i < n; i++) {
          const target = Math.max(50, base + Math.round((Math.random() - 0.5) * 20));
          const fail = Math.random() < 0.04;                   // ~4% gagal (realistis)
          const actual = fail ? 0 : Math.round(target * (0.96 + Math.random() * 0.07));
          const batches = Math.max(1, Math.ceil(target / 100));
          const sid = `feed_bf_${f.pond_id}_${ymd.replace(/-/g, '')}_${i}`;
          await c.query(
            `INSERT INTO lele_feed_sessions
               (feed_session_id, device_id, pond_id, session_name, target_total_g, actual_total_g,
                planned_batch_count, actual_batch_count, success, started_at, completed_at)
             VALUES ($1,$2,$3,'AUTO FEED',$4,$5,$6,$7,$8,
               ($9::date + ($10||' hours')::interval),
               ($9::date + ($10||' hours')::interval + '3 minutes'::interval))
             ON CONFLICT (feed_session_id) DO NOTHING`,
            [sid, f.device_id, f.pond_id, target, actual, batches, fail ? 1 : batches, !fail, ymd, times[i]]);
          filled++;
        }
      }
      grand += filled;
      console.log(`  ✔ ${f.pond_name} (${f.pond_id}): ${filled} sesi mengisi ${emptyDays} hari kosong (tebar ${f.stocking}, ${n}×/hari).`);
    }
    console.log(`✔ Selesai. Total ${grand} sesi backfill. Lihat di tab "Riwayat Akhir" / "Full History".`);
  } catch (e) {
    console.error('✖ Backfill gagal:', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
