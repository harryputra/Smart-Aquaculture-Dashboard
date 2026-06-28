// ======================================================================
// Pengelolaan Siklus Budidaya (tebar → panen) — Fase 1
// Endpoint: /api/ponds/:pondId/cycle (aktif), POST (mulai), /cycle/harvest
// (panen+hitung SR/FCR/profit/ROI), /cycles (riwayat).
// ======================================================================
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000);

function registerCycleHandlers({ app, pool }) {
  function genCycleId(pondId) {
    return 'cyc_' + pondId + '_' + Date.now().toString(36);
  }

  // Metrik turunan untuk satu siklus (dipakai siklus aktif).
  async function cycleMetrics(cycle) {
    const [mort, feed, samp] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(death_count),0) AS d FROM mortality_records WHERE cycle_id=$1`, [cycle.cycle_id]),
      pool.query(`SELECT COALESCE(SUM(feed_amount_kg),0) AS kg FROM feeding_logs WHERE cycle_id=$1`, [cycle.cycle_id]),
      pool.query(`SELECT avg_weight_g FROM biomass_samples WHERE cycle_id=$1 AND status='completed' ORDER BY sampled_at DESC LIMIT 1`, [cycle.cycle_id]),
    ]);
    const deaths = parseInt(mort.rows[0].d) || 0;
    const initial = cycle.initial_stock || 0;
    const population = Math.max(0, initial - deaths);
    const survival_rate = initial > 0 ? (population / initial) * 100 : 0;
    const total_feed_kg = parseFloat(feed.rows[0].kg) || 0;

    let avg_weight_g = samp.rows[0] ? parseFloat(samp.rows[0].avg_weight_g) : null;
    if (avg_weight_g == null) {
      // fallback: ringkasan biomassa dari device lele (bila kolam pakai hardware)
      const lele = await pool.query(
        `SELECT average_fish_weight_g FROM lele_biomass_summary WHERE pond_id=$1 ORDER BY summarized_at DESC LIMIT 1`,
        [cycle.pond_id]).catch(() => ({ rows: [] }));
      if (lele.rows[0] && lele.rows[0].average_fish_weight_g) avg_weight_g = parseFloat(lele.rows[0].average_fish_weight_g);
    }
    const est_biomass_kg = avg_weight_g != null ? (population * avg_weight_g) / 1000 : null;
    const days = Math.max(0, Math.floor((Date.now() - new Date(cycle.start_date).getTime()) / 86400000));
    const fcr_est = est_biomass_kg && est_biomass_kg > 0 ? total_feed_kg / est_biomass_kg : null;

    // proyeksi hari ke target berat (asumsi laju linear dari berat skrg)
    let days_to_target = null;
    if (avg_weight_g != null && cycle.target_weight_g && days > 0 && avg_weight_g > 0) {
      const rate = avg_weight_g / days;                 // gram/hari
      if (rate > 0 && avg_weight_g < cycle.target_weight_g) {
        days_to_target = Math.ceil((cycle.target_weight_g - avg_weight_g) / rate);
      } else if (avg_weight_g >= cycle.target_weight_g) {
        days_to_target = 0;
      }
    }

    return {
      deaths, population,
      survival_rate: r2(survival_rate),
      total_feed_kg: r2(total_feed_kg),
      avg_weight_g: r2(avg_weight_g),
      est_biomass_kg: r2(est_biomass_kg),
      days, fcr_est: r3(fcr_est), days_to_target,
    };
  }

  // ---- Siklus aktif (+ metrik) ----
  app.get('/api/ponds/:pondId/cycle', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM pond_cycles WHERE pond_id=$1 AND status='active' ORDER BY start_date DESC LIMIT 1`,
        [req.params.pondId]);
      if (!r.rows.length) return res.json(null);
      const cycle = r.rows[0];
      const metrics = await cycleMetrics(cycle);
      res.json({ ...cycle, metrics });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Mulai siklus baru ----
  app.post('/api/ponds/:pondId/cycle', async (req, res) => {
    const pondId = req.params.pondId;
    try {
      const active = await pool.query(
        `SELECT 1 FROM pond_cycles WHERE pond_id=$1 AND status='active' LIMIT 1`, [pondId]);
      if (active.rows.length) {
        return res.status(400).json({ error: 'Masih ada siklus aktif. Lakukan panen / tutup siklus dulu.' });
      }
      const {
        initial_stock, fry_size = null, fry_cost_total = 0, initial_feed_kg = 0,
        target_harvest_date = null, target_weight_g = 125, feeding_rate_percent = 4,
        start_date = null, notes = null,
      } = req.body || {};
      if (!initial_stock || initial_stock <= 0) {
        return res.status(400).json({ error: 'Jumlah tebar (initial_stock) wajib > 0.' });
      }
      const cycleId = genCycleId(pondId);
      const r = await pool.query(
        `INSERT INTO pond_cycles
          (cycle_id, pond_id, start_date, initial_stock, fry_size, fry_cost_total, initial_feed_kg,
           target_harvest_date, target_weight_g, feeding_rate_percent, status, notes)
         VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6,$7,$8,$9,$10,'active',$11)
         RETURNING *`,
        [cycleId, pondId, start_date, initial_stock, fry_size, fry_cost_total, initial_feed_kg,
         target_harvest_date, target_weight_g, feeding_rate_percent, notes]);
      // Sinkronkan data kolam
      await pool.query(
        `UPDATE ponds SET initial_fish_count=$1, fish_count=$1,
           stocking_date=COALESCE($2, CURRENT_DATE) WHERE pond_id=$3`,
        [initial_stock, start_date, pondId]);
      // Set stok pakan awal bila diisi
      if (initial_feed_kg && initial_feed_kg > 0) {
        await pool.query(
          `UPDATE feed_stock SET current_stock_kg=$1, updated_at=NOW() WHERE pond_id=$2`,
          [initial_feed_kg, pondId]).catch(() => {});
      }
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Panen (tutup siklus + hitung performa & ekonomi) ----
  app.post('/api/ponds/:pondId/cycle/harvest', async (req, res) => {
    const pondId = req.params.pondId;
    try {
      const cr = await pool.query(
        `SELECT * FROM pond_cycles WHERE pond_id=$1 AND status='active' ORDER BY start_date DESC LIMIT 1`, [pondId]);
      if (!cr.rows.length) return res.status(400).json({ error: 'Tidak ada siklus aktif untuk dipanen.' });
      const cycle = cr.rows[0];

      const { harvest_total_kg, harvest_price_per_kg = 0, harvest_date = null, notes = null } = req.body || {};
      if (harvest_total_kg == null || harvest_total_kg < 0) {
        return res.status(400).json({ error: 'harvest_total_kg wajib diisi.' });
      }

      const m = await cycleMetrics(cycle);
      const revenue = harvest_total_kg * harvest_price_per_kg;
      const fcr = harvest_total_kg > 0 ? m.total_feed_kg / harvest_total_kg : null;

      // biaya: benih + pakan (total kg × harga) + operasional
      const fsR = await pool.query(`SELECT price_per_kg FROM feed_stock WHERE pond_id=$1`, [pondId]).catch(() => ({ rows: [] }));
      const feedPrice = fsR.rows[0] ? parseFloat(fsR.rows[0].price_per_kg) || 0 : 0;
      const feed_cost = m.total_feed_kg * feedPrice;
      const opR = await pool.query(`SELECT COALESCE(SUM(amount),0) AS s FROM operational_costs WHERE cycle_id=$1`, [cycle.cycle_id]);
      const op_cost = parseFloat(opR.rows[0].s) || 0;
      const fry_cost = parseFloat(cycle.fry_cost_total) || 0;
      const total_cost = fry_cost + feed_cost + op_cost;
      const profit = revenue - total_cost;
      const roi = total_cost > 0 ? (profit / total_cost) * 100 : null;

      const upd = await pool.query(
        `UPDATE pond_cycles SET status='completed',
           harvest_date=COALESCE($2,CURRENT_DATE), harvest_total_kg=$3, harvest_price_per_kg=$4,
           harvest_revenue=$5, survival_rate=$6, fcr=$7, total_feed_kg=$8,
           total_cost=$9, profit=$10, roi=$11, notes=COALESCE($12, notes)
         WHERE cycle_id=$1 RETURNING *`,
        [cycle.cycle_id, harvest_date, harvest_total_kg, harvest_price_per_kg, revenue,
         m.survival_rate, r3(fcr), m.total_feed_kg, r2(total_cost), r2(profit), r2(roi), notes]);

      res.json({
        ...upd.rows[0],
        breakdown: { revenue: r2(revenue), fry_cost: r2(fry_cost), feed_cost: r2(feed_cost),
          op_cost: r2(op_cost), total_cost: r2(total_cost), profit: r2(profit), roi: r2(roi),
          fcr: r3(fcr), survival_rate: m.survival_rate, population: m.population },
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Riwayat siklus ----
  app.get('/api/ponds/:pondId/cycles', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM pond_cycles WHERE pond_id=$1 ORDER BY created_at DESC`, [req.params.pondId]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Batalkan siklus aktif (tanpa panen) ----
  app.post('/api/ponds/:pondId/cycle/cancel', async (req, res) => {
    try {
      const r = await pool.query(
        `UPDATE pond_cycles SET status='cancelled', notes=COALESCE($2, notes)
         WHERE pond_id=$1 AND status='active' RETURNING *`,
        [req.params.pondId, req.body?.notes || null]);
      if (!r.rows.length) return res.status(400).json({ error: 'Tidak ada siklus aktif.' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ====================================================================
  // FASE 2 — Sampling Biomassa & Pertumbuhan
  // ====================================================================
  const genSampleId = (pondId) => 'bms_' + pondId + '_' + Date.now().toString(36);
  // Rekomendasi feeding rate dari berat rata-rata (gram).
  const recommendedRate = (avgG) => (avgG <= 0 ? 4 : avgG < 50 ? 5 : avgG <= 100 ? 4 : 3);

  async function recalcSample(sampleId) {
    await pool.query(
      `UPDATE biomass_samples SET
         sample_count   = (SELECT COUNT(*)            FROM biomass_sample_entries WHERE sample_id=$1),
         total_weight_g = (SELECT COALESCE(SUM(weight_g),0) FROM biomass_sample_entries WHERE sample_id=$1),
         avg_weight_g   = (SELECT COALESCE(AVG(weight_g),0) FROM biomass_sample_entries WHERE sample_id=$1)
       WHERE sample_id=$1`, [sampleId]);
  }
  async function sessionWithEntries(sampleId) {
    const s = await pool.query(`SELECT * FROM biomass_samples WHERE sample_id=$1`, [sampleId]);
    if (!s.rows.length) return null;
    const e = await pool.query(`SELECT * FROM biomass_sample_entries WHERE sample_id=$1 ORDER BY fish_no ASC`, [sampleId]);
    return { ...s.rows[0], entries: e.rows };
  }

  // Sesi sampling yang sedang berjalan (+ entries)
  app.get('/api/ponds/:pondId/biomass/current', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT sample_id FROM biomass_samples WHERE pond_id=$1 AND status='in_progress' ORDER BY sampled_at DESC LIMIT 1`,
        [req.params.pondId]);
      if (!r.rows.length) return res.json(null);
      res.json(await sessionWithEntries(r.rows[0].sample_id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Mulai sesi sampling (atau kembalikan yang sedang berjalan)
  app.post('/api/ponds/:pondId/biomass/start', async (req, res) => {
    const pondId = req.params.pondId;
    try {
      const ex = await pool.query(
        `SELECT sample_id FROM biomass_samples WHERE pond_id=$1 AND status='in_progress' ORDER BY sampled_at DESC LIMIT 1`, [pondId]);
      if (ex.rows.length) return res.json(await sessionWithEntries(ex.rows[0].sample_id));
      const cyc = await pool.query(`SELECT cycle_id FROM pond_cycles WHERE pond_id=$1 AND status='active' LIMIT 1`, [pondId]);
      const cycleId = cyc.rows[0]?.cycle_id || null;
      const sampleId = genSampleId(pondId);
      await pool.query(
        `INSERT INTO biomass_samples (sample_id, cycle_id, pond_id, status) VALUES ($1,$2,$3,'in_progress')`,
        [sampleId, cycleId, pondId]);
      res.json(await sessionWithEntries(sampleId));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Tambah timbangan satu ikan
  app.post('/api/ponds/:pondId/biomass/entry', async (req, res) => {
    const pondId = req.params.pondId;
    try {
      const w = parseFloat(req.body?.weight_g);
      if (!w || w <= 0 || w > 9999) return res.status(400).json({ error: 'weight_g tidak valid (0–9999 g).' });
      const r = await pool.query(
        `SELECT sample_id FROM biomass_samples WHERE pond_id=$1 AND status='in_progress' ORDER BY sampled_at DESC LIMIT 1`, [pondId]);
      if (!r.rows.length) return res.status(400).json({ error: 'Tidak ada sesi sampling aktif. Mulai dulu.' });
      const sampleId = r.rows[0].sample_id;
      const cnt = await pool.query(`SELECT COUNT(*) AS c FROM biomass_sample_entries WHERE sample_id=$1`, [sampleId]);
      const fishNo = (parseInt(cnt.rows[0].c) || 0) + 1;
      await pool.query(`INSERT INTO biomass_sample_entries (sample_id, fish_no, weight_g) VALUES ($1,$2,$3)`, [sampleId, fishNo, w]);
      await recalcSample(sampleId);
      res.json(await sessionWithEntries(sampleId));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Hapus satu entry
  app.delete('/api/ponds/:pondId/biomass/entry/:entryId', async (req, res) => {
    try {
      const er = await pool.query(`SELECT sample_id FROM biomass_sample_entries WHERE id=$1`, [req.params.entryId]);
      if (!er.rows.length) return res.status(404).json({ error: 'Entry tak ada.' });
      const sampleId = er.rows[0].sample_id;
      await pool.query(`DELETE FROM biomass_sample_entries WHERE id=$1`, [req.params.entryId]);
      await recalcSample(sampleId);
      res.json(await sessionWithEntries(sampleId));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Finalisasi: hitung rata-rata + auto feeding-rate + update siklus aktif
  app.post('/api/ponds/:pondId/biomass/finalize', async (req, res) => {
    const pondId = req.params.pondId;
    try {
      const r = await pool.query(
        `SELECT * FROM biomass_samples WHERE pond_id=$1 AND status='in_progress' ORDER BY sampled_at DESC LIMIT 1`, [pondId]);
      if (!r.rows.length) return res.status(400).json({ error: 'Tidak ada sesi sampling aktif.' });
      const s = r.rows[0];
      if ((s.sample_count || 0) < 1) return res.status(400).json({ error: 'Belum ada ikan ditimbang.' });
      const avg = parseFloat(s.avg_weight_g) || 0;
      const rate = recommendedRate(avg);
      await pool.query(
        `UPDATE biomass_samples SET status='completed', feeding_rate_percent=$2, sampled_at=NOW() WHERE sample_id=$1`,
        [s.sample_id, rate]);
      // Update siklus aktif: feeding rate ikut hasil sampling
      await pool.query(
        `UPDATE pond_cycles SET feeding_rate_percent=$2 WHERE pond_id=$1 AND status='active'`, [pondId, rate]);
      res.json({ ...(await sessionWithEntries(s.sample_id)), recommended_rate: rate });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Riwayat sampling selesai (untuk kurva pertumbuhan)
  app.get('/api/ponds/:pondId/biomass', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT sample_id, cycle_id, sample_count, avg_weight_g, feeding_rate_percent, sampled_at
         FROM biomass_samples WHERE pond_id=$1 AND status='completed' ORDER BY sampled_at ASC`,
        [req.params.pondId]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ Cycle/budidaya handlers registered');
}

module.exports = { registerCycleHandlers };
