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

  // ---- Perbandingan antar-kolam (KPI siklus aktif) ----
  app.get('/api/cycles/compare', async (req, res) => {
    try {
      const org = req.auth?.org || null;   // null = superadmin
      const params = [];
      let where = `WHERE (p.is_active IS DISTINCT FROM FALSE)`;
      if (org) { params.push(org); where += ` AND fa.org_id = $${params.length}`; }
      const ponds = (await pool.query(
        `SELECT p.pond_id, p.name AS pond_name, p.fish_type, fa.name AS farm_name
         FROM ponds p LEFT JOIN farms fa ON p.farm_id = fa.farm_id ${where}
         ORDER BY fa.name, p.name`, params)).rows;

      const out = [];
      for (const p of ponds) {
        const c = (await pool.query(
          `SELECT * FROM pond_cycles WHERE pond_id=$1 AND status='active' ORDER BY start_date DESC LIMIT 1`,
          [p.pond_id])).rows[0];
        if (!c) { out.push({ ...p, has_cycle: false }); continue; }
        const m = await cycleMetrics(c);
        out.push({ ...p, has_cycle: true, target_weight_g: c.target_weight_g, initial_stock: c.initial_stock, ...m });
      }
      res.json(out);
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

  // ====================================================================
  // FASE 3 — Pakan & Ekonomi (stok pakan, biaya, proyeksi finansial)
  // ====================================================================
  async function ensureFeedStock(pondId) {
    await pool.query(`INSERT INTO feed_stock (pond_id) VALUES ($1) ON CONFLICT (pond_id) DO NOTHING`, [pondId]);
  }

  // Stok pakan + harga
  app.get('/api/ponds/:pondId/feed-stock', async (req, res) => {
    try {
      await ensureFeedStock(req.params.pondId);
      const r = await pool.query(`SELECT * FROM feed_stock WHERE pond_id=$1`, [req.params.pondId]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Update stok pakan: set stok / tambah stok / threshold / harga
  app.put('/api/ponds/:pondId/feed-stock', async (req, res) => {
    const pondId = req.params.pondId;
    try {
      await ensureFeedStock(pondId);
      const cur = (await pool.query(`SELECT * FROM feed_stock WHERE pond_id=$1`, [pondId])).rows[0];
      const b = req.body || {};
      let stock = parseFloat(cur.current_stock_kg) || 0;
      if (b.add_kg != null) stock += parseFloat(b.add_kg) || 0;
      if (b.current_stock_kg != null) stock = parseFloat(b.current_stock_kg) || 0;
      if (stock < 0) stock = 0;
      const low = b.low_threshold_kg != null ? parseFloat(b.low_threshold_kg) : cur.low_threshold_kg;
      const price = b.price_per_kg != null ? parseFloat(b.price_per_kg) : cur.price_per_kg;
      const r = await pool.query(
        `UPDATE feed_stock SET current_stock_kg=$2, low_threshold_kg=$3, price_per_kg=$4, updated_at=NOW()
         WHERE pond_id=$1 RETURNING *`, [pondId, stock, low, price]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Biaya operasional siklus aktif
  app.get('/api/ponds/:pondId/costs', async (req, res) => {
    try {
      const cyc = await pool.query(`SELECT cycle_id FROM pond_cycles WHERE pond_id=$1 AND status='active' LIMIT 1`, [req.params.pondId]);
      if (!cyc.rows.length) return res.json([]);
      const r = await pool.query(`SELECT * FROM operational_costs WHERE cycle_id=$1 ORDER BY recorded_at DESC`, [cyc.rows[0].cycle_id]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ponds/:pondId/costs', async (req, res) => {
    try {
      const cyc = await pool.query(`SELECT cycle_id FROM pond_cycles WHERE pond_id=$1 AND status='active' LIMIT 1`, [req.params.pondId]);
      if (!cyc.rows.length) return res.status(400).json({ error: 'Tidak ada siklus aktif.' });
      const { cost_type = 'lain', amount, description = null } = req.body || {};
      if (amount == null || parseFloat(amount) <= 0) return res.status(400).json({ error: 'amount wajib > 0.' });
      const r = await pool.query(
        `INSERT INTO operational_costs (cycle_id, pond_id, cost_type, amount, description)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [cyc.rows[0].cycle_id, req.params.pondId, cost_type, parseFloat(amount), description]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/ponds/:pondId/costs/:id', async (req, res) => {
    try { await pool.query(`DELETE FROM operational_costs WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Proyeksi finansial siklus aktif (biaya berjalan + estimasi panen)
  app.get('/api/ponds/:pondId/financial', async (req, res) => {
    const pondId = req.params.pondId;
    try {
      const cr = await pool.query(`SELECT * FROM pond_cycles WHERE pond_id=$1 AND status='active' ORDER BY start_date DESC LIMIT 1`, [pondId]);
      if (!cr.rows.length) return res.json(null);
      const cycle = cr.rows[0];
      const m = await cycleMetrics(cycle);
      await ensureFeedStock(pondId);
      const fs = (await pool.query(`SELECT * FROM feed_stock WHERE pond_id=$1`, [pondId])).rows[0];
      const feedPrice = parseFloat(fs.price_per_kg) || 0;
      const feed_cost = m.total_feed_kg * feedPrice;
      const op = parseFloat((await pool.query(`SELECT COALESCE(SUM(amount),0) s FROM operational_costs WHERE cycle_id=$1`, [cycle.cycle_id])).rows[0].s) || 0;
      const fry_cost = parseFloat(cycle.fry_cost_total) || 0;
      const total_cost = fry_cost + feed_cost + op;
      const proj_harvest_kg = cycle.target_weight_g ? (m.population * cycle.target_weight_g) / 1000 : null;
      res.json({
        cycle_id: cycle.cycle_id, days: m.days, population: m.population,
        avg_weight_g: m.avg_weight_g, est_biomass_kg: m.est_biomass_kg,
        total_feed_kg: m.total_feed_kg, feed_price_per_kg: feedPrice,
        fry_cost: r2(fry_cost), feed_cost: r2(feed_cost), op_cost: r2(op), total_cost: r2(total_cost),
        target_weight_g: cycle.target_weight_g != null ? parseFloat(cycle.target_weight_g) : null,
        proj_harvest_kg: r2(proj_harvest_kg),
        feed_stock: fs,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ====================================================================
  // FASE 4 — Logbook, Audit Air, Ekspor CSV, Arsip
  // ====================================================================

  // ---- Logbook / catatan ----
  app.get('/api/ponds/:pondId/logbook', async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM pond_logbook WHERE pond_id=$1 ORDER BY recorded_at DESC LIMIT 200`, [req.params.pondId]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/ponds/:pondId/logbook', async (req, res) => {
    try {
      const { entry_type = 'observasi', content } = req.body || {};
      if (!content || !content.trim()) return res.status(400).json({ error: 'Isi catatan kosong.' });
      const cyc = await pool.query(`SELECT cycle_id FROM pond_cycles WHERE pond_id=$1 AND status='active' LIMIT 1`, [req.params.pondId]);
      const r = await pool.query(
        `INSERT INTO pond_logbook (pond_id, cycle_id, entry_type, content) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.pondId, cyc.rows[0]?.cycle_id || null, entry_type, content.trim()]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/ponds/:pondId/logbook/:id', async (req, res) => {
    try { await pool.query(`DELETE FROM pond_logbook WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Audit kualitas air N hari (forensik kematian) ----
  app.get('/api/ponds/:pondId/water-audit', async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);
      const end = req.query.date ? new Date(req.query.date) : new Date();
      const start = new Date(end.getTime() - days * 86400000);
      const s = await pool.query(
        `SELECT COUNT(*) AS n,
           AVG(temperature) t_avg, MIN(temperature) t_min, MAX(temperature) t_max,
           AVG(ph) ph_avg, MIN(ph) ph_min, MAX(ph) ph_max,
           AVG(dissolved_oxygen) do_avg, MIN(dissolved_oxygen) do_min, MAX(dissolved_oxygen) do_max,
           AVG(turbidity) tu_avg, MIN(turbidity) tu_min, MAX(turbidity) tu_max,
           AVG(depth) d_avg, MIN(depth) d_min, MAX(depth) d_max
         FROM sensor_data WHERE pond_id=$1 AND timestamp >= $2 AND timestamp <= $3`,
        [req.params.pondId, start, end]);
      const th = (await pool.query(`SELECT * FROM sensor_thresholds WHERE pond_id=$1`, [req.params.pondId])).rows[0] || {};
      const row = s.rows[0];
      const num = (v) => (v == null ? null : Math.round(parseFloat(v) * 100) / 100);
      const fields = {
        temperature: { avg: num(row.t_avg), min: num(row.t_min), max: num(row.t_max), lo: th.temp_min, hi: th.temp_max },
        ph:          { avg: num(row.ph_avg), min: num(row.ph_min), max: num(row.ph_max), lo: th.ph_min, hi: th.ph_max },
        dissolved_oxygen: { avg: num(row.do_avg), min: num(row.do_min), max: num(row.do_max), lo: th.do_min, hi: th.do_max },
        turbidity:   { avg: num(row.tu_avg), min: num(row.tu_min), max: num(row.tu_max), lo: null, hi: th.turbidity_max },
        depth:       { avg: num(row.d_avg), min: num(row.d_min), max: num(row.d_max), lo: th.depth_min, hi: th.depth_max },
      };
      for (const k in fields) {
        const f = fields[k];
        f.breach = (f.lo != null && f.min != null && f.min < f.lo) || (f.hi != null && f.max != null && f.max > f.hi);
      }
      res.json({ days, from: start, to: end, samples: parseInt(row.n) || 0, fields });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Ekspor CSV (sensors | feeding | mortality | cycles) ----
  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      if (v == null) return '';
      const s = (v instanceof Date) ? v.toISOString() : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return cols.join(',') + '\n' + rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');
  }
  app.get('/api/ponds/:pondId/export', async (req, res) => {
    const pondId = req.params.pondId;
    const type = String(req.query.type || 'sensors');
    try {
      let rows = [];
      if (type === 'sensors') rows = (await pool.query(`SELECT timestamp, temperature, ph, dissolved_oxygen, turbidity, depth, source FROM sensor_data WHERE pond_id=$1 ORDER BY timestamp DESC LIMIT 10000`, [pondId])).rows;
      else if (type === 'feeding') rows = (await pool.query(`SELECT timestamp, feed_amount_kg, feed_type, triggered_by, cycle_id, note FROM feeding_logs WHERE pond_id=$1 ORDER BY timestamp DESC LIMIT 10000`, [pondId])).rows;
      else if (type === 'mortality') rows = (await pool.query(`SELECT recorded_at, death_count, cause, cycle_id, note FROM mortality_records WHERE pond_id=$1 ORDER BY recorded_at DESC LIMIT 10000`, [pondId])).rows;
      else if (type === 'cycles') rows = (await pool.query(`SELECT cycle_id, start_date, harvest_date, status, initial_stock, harvest_total_kg, survival_rate, fcr, harvest_revenue, total_cost, profit, roi FROM pond_cycles WHERE pond_id=$1 ORDER BY created_at DESC`, [pondId])).rows;
      else return res.status(400).json({ error: 'type: sensors|feeding|mortality|cycles' });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${pondId}-${type}.csv"`);
      res.send(toCSV(rows));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Arsip kolam ----
  app.put('/api/ponds/:pondId/archive', async (req, res) => {
    try {
      const isActive = req.body?.is_active === true;   // is_active=true → aktifkan, false → arsipkan
      const r = await pool.query(`UPDATE ponds SET is_active=$2 WHERE pond_id=$1 RETURNING pond_id, is_active`,
        [req.params.pondId, isActive]);
      if (!r.rows.length) return res.status(404).json({ error: 'Kolam tak ada.' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('✓ Cycle/budidaya handlers registered');
}

module.exports = { registerCycleHandlers };
