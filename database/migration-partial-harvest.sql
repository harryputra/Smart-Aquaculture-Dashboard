-- ======================================================================
-- Migrasi: Panen Parsial (Partial Harvest)
-- Idempoten (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) — aman dijalankan
-- berkali-kali via ./run.sh setup atau manual.
-- ======================================================================

-- Tabel utama: setiap baris = 1 event panen parsial dalam satu siklus
CREATE TABLE IF NOT EXISTS harvest_records (
  id               SERIAL PRIMARY KEY,
  harvest_id       TEXT UNIQUE NOT NULL,
  cycle_id         TEXT NOT NULL REFERENCES pond_cycles(cycle_id) ON DELETE CASCADE,
  pond_id          TEXT NOT NULL,
  harvest_no       INTEGER NOT NULL DEFAULT 1,     -- urutan panen ke-N dalam siklus
  harvest_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  fish_count       INTEGER NOT NULL DEFAULT 0,     -- jumlah ekor yang dipanen
  avg_weight_g     NUMERIC(10,2),                  -- berat rata-rata per ekor (gram)
  total_weight_kg  NUMERIC(12,2) NOT NULL,         -- total berat hasil panen (kg)
  price_per_kg     NUMERIC(14,2) DEFAULT 0,        -- harga jual Rp/kg
  revenue          NUMERIC(16,2) DEFAULT 0,        -- total pendapatan (auto: total_weight × price)
  is_final         BOOLEAN DEFAULT FALSE,           -- TRUE = panen terakhir, siklus ditutup setelahnya
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harvest_records_cycle  ON harvest_records (cycle_id);
CREATE INDEX IF NOT EXISTS idx_harvest_records_pond   ON harvest_records (pond_id, harvest_date DESC);

-- Kolom akumulasi di pond_cycles (untuk summary cepat tanpa re-query harvest_records)
ALTER TABLE pond_cycles ADD COLUMN IF NOT EXISTS partial_harvest_count  INTEGER     DEFAULT 0;
ALTER TABLE pond_cycles ADD COLUMN IF NOT EXISTS total_harvested_kg     NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pond_cycles ADD COLUMN IF NOT EXISTS total_harvested_fish   INTEGER     DEFAULT 0;
ALTER TABLE pond_cycles ADD COLUMN IF NOT EXISTS total_harvest_revenue  NUMERIC(16,2) DEFAULT 0;
