-- ======================================================================
-- Migrasi: Pengelolaan Kolam / Budidaya (port fitur SI-PAKALE)
-- Idempoten (IF NOT EXISTS) — aman dijalankan berulang via ./run.sh.
-- Lihat docs/RENCANA-PENGELOLAAN-KOLAM.md
-- ======================================================================

-- ---------- Fase 1: Siklus budidaya (tebar→panen) ----------
CREATE TABLE IF NOT EXISTS pond_cycles (
  id                   SERIAL PRIMARY KEY,
  cycle_id             TEXT UNIQUE NOT NULL,
  pond_id              TEXT NOT NULL REFERENCES ponds(pond_id) ON DELETE CASCADE,
  start_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  initial_stock        INTEGER NOT NULL DEFAULT 0,
  fry_size             TEXT,                          -- ukuran benih (mis. "5-7 cm")
  fry_cost_total       NUMERIC(14,2) DEFAULT 0,       -- total biaya benih
  initial_feed_kg      NUMERIC(10,2) DEFAULT 0,
  target_harvest_date  DATE,
  target_weight_g      NUMERIC(10,2) DEFAULT 125,
  feeding_rate_percent NUMERIC(5,2)  DEFAULT 4,
  status               TEXT NOT NULL DEFAULT 'active', -- active | completed | cancelled
  -- snapshot saat panen (untuk riwayat)
  harvest_date         DATE,
  harvest_total_kg     NUMERIC(12,2),
  harvest_price_per_kg NUMERIC(14,2),
  harvest_revenue      NUMERIC(16,2),
  survival_rate        NUMERIC(6,2),
  fcr                  NUMERIC(8,3),
  total_feed_kg        NUMERIC(12,2),
  total_cost           NUMERIC(16,2),
  profit               NUMERIC(16,2),
  roi                  NUMERIC(8,2),
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pond_cycles_pond ON pond_cycles (pond_id, status);

-- Tautkan data operasional ke siklus
ALTER TABLE feeding_logs      ADD COLUMN IF NOT EXISTS cycle_id TEXT;
ALTER TABLE mortality_records ADD COLUMN IF NOT EXISTS cycle_id TEXT;
ALTER TABLE ponds             ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ---------- Fase 2: Sampling biomassa & pertumbuhan ----------
CREATE TABLE IF NOT EXISTS biomass_samples (
  id                   SERIAL PRIMARY KEY,
  sample_id            TEXT UNIQUE NOT NULL,
  cycle_id             TEXT,
  pond_id              TEXT NOT NULL,
  sample_count         INTEGER DEFAULT 0,
  total_weight_g       NUMERIC(12,2) DEFAULT 0,
  avg_weight_g         NUMERIC(10,2) DEFAULT 0,
  feeding_rate_percent NUMERIC(5,2),
  status               TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  sampled_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biomass_samples_pond ON biomass_samples (pond_id, sampled_at DESC);

CREATE TABLE IF NOT EXISTS biomass_sample_entries (
  id           SERIAL PRIMARY KEY,
  sample_id    TEXT NOT NULL REFERENCES biomass_samples(sample_id) ON DELETE CASCADE,
  fish_no      INTEGER,
  weight_g     NUMERIC(10,2),
  recorded_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biomass_entries_sample ON biomass_sample_entries (sample_id);

-- ---------- Fase 3: Pakan & ekonomi ----------
CREATE TABLE IF NOT EXISTS feed_stock (
  id               SERIAL PRIMARY KEY,
  pond_id          TEXT UNIQUE NOT NULL REFERENCES ponds(pond_id) ON DELETE CASCADE,
  current_stock_kg NUMERIC(12,2) DEFAULT 0,
  low_threshold_kg NUMERIC(10,2) DEFAULT 5,
  price_per_kg     NUMERIC(14,2) DEFAULT 0,           -- harga pakan (utk hitung biaya)
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operational_costs (
  id           SERIAL PRIMARY KEY,
  cycle_id     TEXT,
  pond_id      TEXT,
  cost_type    TEXT,                                  -- listrik | obat | tenaga | lain
  amount       NUMERIC(16,2) DEFAULT 0,
  description  TEXT,
  recorded_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_costs_cycle ON operational_costs (cycle_id);

-- ---------- Fase 4: Logbook / catatan ----------
CREATE TABLE IF NOT EXISTS pond_logbook (
  id           SERIAL PRIMARY KEY,
  pond_id      TEXT NOT NULL,
  cycle_id     TEXT,
  entry_type   TEXT DEFAULT 'observasi',              -- observasi | insiden | tindakan
  content      TEXT,
  recorded_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_logbook_pond ON pond_logbook (pond_id, recorded_at DESC);

-- ======================================================================
-- BACKFILL — agar data lama tetap utuh (idempoten)
-- ======================================================================
-- 1 siklus aktif untuk tiap kolam yang belum punya siklus
INSERT INTO pond_cycles (cycle_id, pond_id, start_date, initial_stock, status, target_weight_g, feeding_rate_percent)
SELECT 'cyc_' || p.pond_id, p.pond_id,
       COALESCE(p.stocking_date, CURRENT_DATE),
       COALESCE(p.initial_fish_count, p.fish_count, 0), 'active', 125, 4
FROM ponds p
WHERE NOT EXISTS (SELECT 1 FROM pond_cycles c WHERE c.pond_id = p.pond_id);

-- 1 baris stok pakan per kolam
INSERT INTO feed_stock (pond_id)
SELECT p.pond_id FROM ponds p
WHERE NOT EXISTS (SELECT 1 FROM feed_stock f WHERE f.pond_id = p.pond_id);

-- Tautkan log/mortalitas lama ke siklus aktif kolamnya
UPDATE feeding_logs fl SET cycle_id = c.cycle_id
FROM pond_cycles c
WHERE c.pond_id = fl.pond_id AND c.status = 'active' AND fl.cycle_id IS NULL;

UPDATE mortality_records m SET cycle_id = c.cycle_id
FROM pond_cycles c
WHERE c.pond_id = m.pond_id AND c.status = 'active' AND m.cycle_id IS NULL;
