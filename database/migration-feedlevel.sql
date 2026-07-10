-- ======================================================================
-- Migrasi: ketinggian pakan (feed level) dari ultrasonik hopper — idempoten.
-- ======================================================================
ALTER TABLE sensor_data       ADD COLUMN IF NOT EXISTS feed_level_cm     DECIMAL(6,2);
ALTER TABLE sensor_thresholds ADD COLUMN IF NOT EXISTS feed_level_low_cm DECIMAL(6,2) DEFAULT 5.0;
