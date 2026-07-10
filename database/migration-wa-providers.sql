-- ======================================================================
-- Migrasi: multi-provider WhatsApp (Cloud API + gateway Fonnte/Wablas).
-- Kolom lama (phone_number_id/access_token/template_*) = Cloud API.
-- provider menentukan yang AKTIF dipakai.
-- ======================================================================
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS fonnte_token  TEXT;
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS wablas_token  TEXT;
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS wablas_domain TEXT;   -- mis. https://jogja.wablas.com
