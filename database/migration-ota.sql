-- ======================================================================
-- Migrasi: OTA firmware (Fase 2) — idempoten. Lihat docs/RENCANA-OTA.md
-- ======================================================================

-- Katalog firmware yang diunggah admin.
CREATE TABLE IF NOT EXISTS lele_firmware (
  id          SERIAL PRIMARY KEY,
  model       TEXT NOT NULL DEFAULT 'pakan_lele',
  version     TEXT NOT NULL,
  filename    TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  size_bytes  BIGINT,
  notes       TEXT,
  is_latest   BOOLEAN DEFAULT FALSE,
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lele_firmware_model ON lele_firmware (model, created_at DESC);

-- Status firmware & OTA per device.
ALTER TABLE lele_devices ADD COLUMN IF NOT EXISTS firmware_version   TEXT;
ALTER TABLE lele_devices ADD COLUMN IF NOT EXISTS ota_state          TEXT;
ALTER TABLE lele_devices ADD COLUMN IF NOT EXISTS ota_progress       INT;
ALTER TABLE lele_devices ADD COLUMN IF NOT EXISTS ota_target_version TEXT;
ALTER TABLE lele_devices ADD COLUMN IF NOT EXISTS ota_at             TIMESTAMPTZ;
