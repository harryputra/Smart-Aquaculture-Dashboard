-- ======================================================================
-- Migrasi: Notifikasi WhatsApp (Cloud API resmi) — idempoten.
-- Gateway global (Superadmin) + penerima fleksibel per org/farm/pond (Pemilik).
-- ======================================================================

-- Konfigurasi gateway global (singleton id=1) — diatur Superadmin.
CREATE TABLE IF NOT EXISTS wa_config (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  enabled         BOOLEAN DEFAULT FALSE,
  provider        TEXT DEFAULT 'cloud_api',
  phone_number_id TEXT,                       -- WhatsApp Cloud API: Phone Number ID
  access_token    TEXT,                       -- token Meta (sensitif)
  api_version     TEXT DEFAULT 'v21.0',
  template_name   TEXT,                        -- nama template disetujui (1 variabel {{1}})
  template_lang   TEXT DEFAULT 'id',
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT wa_config_singleton CHECK (id = 1)
);
INSERT INTO wa_config (id, enabled) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING;

-- Penerima notifikasi (fleksibel: per organisasi / peternakan / kolam).
CREATE TABLE IF NOT EXISTS wa_recipients (
  id           SERIAL PRIMARY KEY,
  org_id       TEXT,
  scope        TEXT NOT NULL DEFAULT 'org',    -- org | farm | pond
  scope_id     TEXT,                           -- farm_id/pond_id; null utk scope 'org'
  name         TEXT,
  phone        TEXT NOT NULL,
  categories   JSONB DEFAULT '["sensor","offline","feeding","feed_stock"]',
  min_severity TEXT DEFAULT 'risk',            -- all | risk | critical
  enabled      BOOLEAN DEFAULT TRUE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_recipients_org ON wa_recipients (org_id);

-- Log pengiriman WA (audit + tampil di UI).
CREATE TABLE IF NOT EXISTS wa_log (
  id              BIGSERIAL PRIMARY KEY,
  recipient_id    INT,
  phone           TEXT,
  notification_id INT,
  category        TEXT,
  status          TEXT,    -- sent | fail | test
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_log_created ON wa_log (created_at DESC);

-- Tandai notifikasi yang sudah diproses dispatcher WA (agar tak dobel kirim).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS wa_dispatched BOOLEAN DEFAULT FALSE;
