-- ======================================================================
-- Rencana Pakan (feed plan) — pemberian pakan terjadwal berbasis PERSEN dari
-- kebutuhan harian (biomassa). Mode ONLINE-DRIVEN: server yang memicu feeder
-- (manual_feed_gram) di tiap jam sesi. (Firmware per-slot % menyusul.)
--
-- Kebutuhan harian (g) = fish_count * avg_weight_g * feeding_rate_percent/100
-- Gram per sesi        = kebutuhan harian * percent/100
-- ======================================================================

CREATE TABLE IF NOT EXISTS feed_plan (
  pond_id               TEXT PRIMARY KEY,
  enabled               BOOLEAN      NOT NULL DEFAULT TRUE,
  fish_count            INTEGER      NOT NULL DEFAULT 0,
  avg_weight_g          NUMERIC(10,2) NOT NULL DEFAULT 0,
  feeding_rate_percent  NUMERIC(6,2)  NOT NULL DEFAULT 3,
  biomass_source        TEXT         NOT NULL DEFAULT 'manual',  -- manual | sampling
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_plan_sessions (
  id            SERIAL PRIMARY KEY,
  pond_id       TEXT         NOT NULL,
  session_name  TEXT         NOT NULL DEFAULT '',
  session_time  TEXT         NOT NULL,            -- 'HH:MM'
  percent       NUMERIC(6,2) NOT NULL DEFAULT 0,
  enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
  sort          INTEGER      NOT NULL DEFAULT 0,
  last_run_date DATE
);
CREATE INDEX IF NOT EXISTS idx_feed_plan_sessions_pond ON feed_plan_sessions(pond_id);
