-- ======================================================================
-- Migrasi: Auth multi-tenant + role + quick-login (idempoten)
-- Lihat docs/RENCANA-AUTH-MULTITENANT.md
-- ======================================================================

-- Organisasi (tenant / UMKM)
CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  org_id     TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pengguna
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT UNIQUE NOT NULL,
  org_id        TEXT REFERENCES organizations(org_id) ON DELETE CASCADE,  -- null = superadmin
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pekerja',  -- superadmin | pemilik | pekerja | pengamat
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users (org_id);

-- Tautkan farm ke organisasi (tenant). Pond mewarisi tenant via farm.
ALTER TABLE farms ADD COLUMN IF NOT EXISTS org_id TEXT;

-- Quick-Login config (pola sim_pbl), singleton id=1.
CREATE TABLE IF NOT EXISTS quick_login_config (
  id                   INTEGER PRIMARY KEY DEFAULT 1,
  enabled              BOOLEAN DEFAULT FALSE,
  url_token            TEXT,
  passphrase_enabled   BOOLEAN DEFAULT FALSE,
  passphrase_hash      TEXT,
  show_button_on_login BOOLEAN DEFAULT FALSE,
  expires_at           TIMESTAMPTZ,
  last_enabled_by      TEXT,
  last_enabled_at      TIMESTAMPTZ,
  last_disabled_by     TEXT,
  last_disabled_at     TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT quick_login_singleton CHECK (id = 1)
);

-- Audit aktivitas auth & quick-login.
CREATE TABLE IF NOT EXISTS auth_audit (
  id         BIGSERIAL PRIMARY KEY,
  action     TEXT,
  user_id    TEXT,
  email      TEXT,
  ip         TEXT,
  user_agent TEXT,
  detail     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit (created_at DESC);

-- ----------------------------------------------------------------------
-- BACKFILL: organisasi default + tautkan farm lama (idempoten)
-- (Akun superadmin/admin dibuat backend dari .env saat boot — butuh bcrypt.)
-- ----------------------------------------------------------------------
INSERT INTO organizations (org_id, name)
SELECT 'org_default', 'Organisasi Default'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE org_id = 'org_default');

UPDATE farms SET org_id = 'org_default' WHERE org_id IS NULL;

INSERT INTO quick_login_config (id, enabled) VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Tandai akun yang boleh dipakai login cepat (hanya akun demo; akun nyata FALSE).
ALTER TABLE users ADD COLUMN IF NOT EXISTS quick_login BOOLEAN DEFAULT FALSE;
