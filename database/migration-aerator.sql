-- ======================================================================
-- Migrasi: Aerator (kendali DO) per kolam — idempoten.
-- ======================================================================

-- Konfigurasi aerator disimpan bersama ambang sensor (per kolam).
ALTER TABLE sensor_thresholds ADD COLUMN IF NOT EXISTS aerator_mode      TEXT DEFAULT 'auto';   -- auto | manual | off
ALTER TABLE sensor_thresholds ADD COLUMN IF NOT EXISTS aerator_do_on     DECIMAL(5,2) DEFAULT 3.0;  -- DO ≤ ini → ON
ALTER TABLE sensor_thresholds ADD COLUMN IF NOT EXISTS aerator_do_off    DECIMAL(5,2) DEFAULT 4.0;  -- DO ≥ ini → OFF
ALTER TABLE sensor_thresholds ADD COLUMN IF NOT EXISTS aerator_manual_on BOOLEAN DEFAULT FALSE;

-- Rekam status aerator pada tiap data sensor.
ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS aerator_on BOOLEAN DEFAULT FALSE;
