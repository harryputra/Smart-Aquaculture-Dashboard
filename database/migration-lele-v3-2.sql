-- ============================
-- Smart Aquaculture - Lele V3.2 Migration
-- Update untuk firmware V3.2 Hybrid (Preferences + MQTT)
-- ============================

-- Tambah kolom baru di lele_devices untuk data V3.2
ALTER TABLE lele_devices
  ADD COLUMN IF NOT EXISTS feeding_rate_percent NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feeding_per_day INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS target_sample_count INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS saved_sample_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_sample_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chamber_g NUMERIC(8, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sampling_g NUMERIC(8, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS servo_angle INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stepper_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS spinner_state INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_schedule_hhmm VARCHAR(10) DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_feed_success BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_feed_target_g NUMERIC(8, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_feed_actual_g NUMERIC(8, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_feed_batch_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_feed_time VARCHAR(50) DEFAULT '-',
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(50) DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS last_error_msg VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_error_time VARCHAR(50) DEFAULT '-';

-- Tabel jadwal pakan (mirror dari ESP32)
CREATE TABLE IF NOT EXISTS lele_device_schedules (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    schedule_index INTEGER NOT NULL,
    hour INTEGER NOT NULL,
    minute INTEGER NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, schedule_index)
);

-- Update existing lele_pond_config untuk match V3.2
ALTER TABLE lele_pond_config
  ADD COLUMN IF NOT EXISTS target_sample_count INTEGER DEFAULT 10;
