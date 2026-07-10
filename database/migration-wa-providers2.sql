-- ======================================================================
-- Migrasi: provider WhatsApp tambahan — Watzap + Generic HTTP (idempoten).
-- ======================================================================
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS watzap_api_key    TEXT;
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS watzap_number_key TEXT;
-- Generic HTTP: URL + header (JSON) + body template ({{phone}} & {{message}})
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS generic_url     TEXT;
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS generic_headers TEXT;
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS generic_body    TEXT;
