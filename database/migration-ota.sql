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

-- Rollout canary: uji 1 device → bila sehat, sebar otomatis ke sisanya.
CREATE TABLE IF NOT EXISTS lele_ota_rollout (
  id               SERIAL PRIMARY KEY,
  firmware_id      INT,
  version          TEXT,
  status           TEXT DEFAULT 'canary',   -- canary | done | aborted
  canary_device_id TEXT,
  remaining        JSONB DEFAULT '[]',
  created_by       TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Audit / riwayat OTA per device.
CREATE TABLE IF NOT EXISTS lele_ota_log (
  id           BIGSERIAL PRIMARY KEY,
  device_id    TEXT,
  event        TEXT,   -- trigger|canary_start|canary_ok|canary_fail|canary_timeout|success|fail
  from_version TEXT,
  to_version   TEXT,
  by_user      TEXT,
  detail       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lele_ota_log_dev ON lele_ota_log (device_id, created_at DESC);
