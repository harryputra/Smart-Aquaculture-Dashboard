-- ======================================================================
-- Migrasi: laporan commissioning / hasil uji hardware per device (idempoten)
-- ======================================================================
CREATE TABLE IF NOT EXISTS lele_commissioning (
  id         SERIAL PRIMARY KEY,
  device_id  TEXT NOT NULL,
  test_key   TEXT NOT NULL,        -- konektivitas | servo | spinner | auger | scale | ...
  result     TEXT NOT NULL,        -- pass | fail
  note       TEXT,
  tested_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commissioning_device ON lele_commissioning (device_id, test_key, tested_at DESC);
