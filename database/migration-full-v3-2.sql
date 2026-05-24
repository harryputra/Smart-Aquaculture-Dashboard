-- ============================
-- Smart Aquaculture - MIGRATION LENGKAP V3.2
-- Aman dijalankan dari nol maupun di atas database yang sudah ada
-- Semua pakai IF NOT EXISTS / ON CONFLICT
-- ============================

-- STEP 1: Tabel dasar lele
CREATE TABLE IF NOT EXISTS lele_devices (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) UNIQUE NOT NULL,
    pond_id VARCHAR(50),
    name VARCHAR(100),
    is_online BOOLEAN DEFAULT FALSE,
    wifi_connected BOOLEAN DEFAULT FALSE,
    mqtt_connected BOOLEAN DEFAULT FALSE,
    rtc_ok BOOLEAN DEFAULT FALSE,
    auto_feed_enabled BOOLEAN DEFAULT TRUE,
    feeding_in_progress BOOLEAN DEFAULT FALSE,
    current_screen VARCHAR(50),
    hx_chamber_ok BOOLEAN DEFAULT FALSE,
    hx_sampling_ok BOOLEAN DEFAULT FALSE,
    fish_count INTEGER DEFAULT 0,
    sample_ready BOOLEAN DEFAULT FALSE,
    avg_fish_g DECIMAL(8,2),
    seconds_to_next_feed INTEGER,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS lele_biomass_samples (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    fish_no INTEGER NOT NULL,
    fish_weight_g DECIMAL(8,2) NOT NULL,
    sampled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_biomass_summary (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    sample_count INTEGER,
    average_fish_weight_g DECIMAL(8,2),
    fish_count INTEGER,
    estimated_biomass_kg DECIMAL(10,3),
    feeding_rate_percent DECIMAL(5,2),
    feeding_per_day INTEGER,
    estimated_daily_feed_g DECIMAL(10,2),
    estimated_feed_per_schedule_g DECIMAL(10,2),
    summarized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_feed_sessions (
    id BIGSERIAL PRIMARY KEY,
    feed_session_id VARCHAR(100) UNIQUE NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    session_name VARCHAR(100),
    target_total_g DECIMAL(10,2),
    actual_total_g DECIMAL(10,2),
    planned_batch_count INTEGER,
    actual_batch_count INTEGER,
    max_batch_g DECIMAL(8,2),
    success BOOLEAN,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_feed_batches (
    id BIGSERIAL PRIMARY KEY,
    feed_session_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    batch_no INTEGER,
    total_batches INTEGER,
    target_g DECIMAL(8,2),
    actual_g DECIMAL(8,2),
    spinner_direction VARCHAR(10),
    success BOOLEAN,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_errors (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    code VARCHAR(50),
    message TEXT,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_pond_config (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) UNIQUE NOT NULL,
    fish_count INTEGER DEFAULT 1000,
    feeding_rate_percent DECIMAL(5,2) DEFAULT 3.0,
    feeding_per_day INTEGER DEFAULT 2,
    min_sample_count INTEGER DEFAULT 10,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_feed_schedules (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    schedule_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_executed TIMESTAMP,
    note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_tare_history (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    scale_type VARCHAR(20),
    triggered_by VARCHAR(50),
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lele_growth_tracking (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    average_fish_weight_g DECIMAL(8,2),
    estimated_biomass_kg DECIMAL(10,3),
    fish_count INTEGER,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- STEP 2: Kolom tambahan V3.2 (pakai DO block agar aman kalau kolom sudah ada)
DO $$
BEGIN
    -- lele_devices V3.2 columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='feeding_rate_percent') THEN
        ALTER TABLE lele_devices ADD COLUMN feeding_rate_percent NUMERIC(5,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='feeding_per_day') THEN
        ALTER TABLE lele_devices ADD COLUMN feeding_per_day INTEGER DEFAULT 2;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='target_sample_count') THEN
        ALTER TABLE lele_devices ADD COLUMN target_sample_count INTEGER DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='saved_sample_count') THEN
        ALTER TABLE lele_devices ADD COLUMN saved_sample_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='current_sample_index') THEN
        ALTER TABLE lele_devices ADD COLUMN current_sample_index INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='chamber_g') THEN
        ALTER TABLE lele_devices ADD COLUMN chamber_g NUMERIC(8,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='sampling_g') THEN
        ALTER TABLE lele_devices ADD COLUMN sampling_g NUMERIC(8,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='servo_angle') THEN
        ALTER TABLE lele_devices ADD COLUMN servo_angle INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='stepper_enabled') THEN
        ALTER TABLE lele_devices ADD COLUMN stepper_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='spinner_state') THEN
        ALTER TABLE lele_devices ADD COLUMN spinner_state INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='next_schedule_hhmm') THEN
        ALTER TABLE lele_devices ADD COLUMN next_schedule_hhmm VARCHAR(10) DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_feed_success') THEN
        ALTER TABLE lele_devices ADD COLUMN last_feed_success BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_feed_target_g') THEN
        ALTER TABLE lele_devices ADD COLUMN last_feed_target_g NUMERIC(8,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_feed_actual_g') THEN
        ALTER TABLE lele_devices ADD COLUMN last_feed_actual_g NUMERIC(8,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_feed_batch_count') THEN
        ALTER TABLE lele_devices ADD COLUMN last_feed_batch_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_feed_time') THEN
        ALTER TABLE lele_devices ADD COLUMN last_feed_time VARCHAR(50) DEFAULT '-';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_error_code') THEN
        ALTER TABLE lele_devices ADD COLUMN last_error_code VARCHAR(50) DEFAULT 'NONE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_error_msg') THEN
        ALTER TABLE lele_devices ADD COLUMN last_error_msg VARCHAR(200) DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='last_error_time') THEN
        ALTER TABLE lele_devices ADD COLUMN last_error_time VARCHAR(50) DEFAULT '-';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='main_menu_index') THEN
        ALTER TABLE lele_devices ADD COLUMN main_menu_index INTEGER DEFAULT 0;
    END IF;
END
$$;

-- STEP 3: Tabel jadwal sync V3.2
CREATE TABLE IF NOT EXISTS lele_device_schedules (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    schedule_index INTEGER NOT NULL,
    hour INTEGER NOT NULL DEFAULT 0,
    minute INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, schedule_index)
);

-- STEP 4: Index
CREATE INDEX IF NOT EXISTS idx_lele_biomass_device ON lele_biomass_samples(device_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_lele_feed_device ON lele_feed_sessions(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lele_batch_session ON lele_feed_batches(feed_session_id);
CREATE INDEX IF NOT EXISTS idx_lele_err_device ON lele_errors(device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_device ON lele_growth_tracking(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_device ON lele_feed_schedules(device_id);
CREATE INDEX IF NOT EXISTS idx_dev_sched ON lele_device_schedules(device_id, schedule_index);

-- STEP 5: Data default device
INSERT INTO lele_devices (device_id, name)
VALUES ('pakan_lele_01', 'Pakan Lele Otomatis #1')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO lele_pond_config (device_id)
SELECT device_id FROM lele_devices
ON CONFLICT (device_id) DO NOTHING;

-- Jadwal default 07:00 dan 17:00
INSERT INTO lele_feed_schedules (device_id, schedule_time, note)
SELECT 'pakan_lele_01', '07:00', 'Pakan pagi'
WHERE NOT EXISTS (
    SELECT 1 FROM lele_feed_schedules
    WHERE device_id = 'pakan_lele_01' AND schedule_time = '07:00'
);

INSERT INTO lele_feed_schedules (device_id, schedule_time, note)
SELECT 'pakan_lele_01', '17:00', 'Pakan sore'
WHERE NOT EXISTS (
    SELECT 1 FROM lele_feed_schedules
    WHERE device_id = 'pakan_lele_01' AND schedule_time = '17:00'
);

-- Jadwal sync default (index 0-5)
INSERT INTO lele_device_schedules (device_id, schedule_index, hour, minute, enabled)
VALUES
    ('pakan_lele_01', 0, 7,  0, true),
    ('pakan_lele_01', 1, 17, 0, true),
    ('pakan_lele_01', 2, 0,  0, false),
    ('pakan_lele_01', 3, 0,  0, false),
    ('pakan_lele_01', 4, 0,  0, false),
    ('pakan_lele_01', 5, 0,  0, false)
ON CONFLICT (device_id, schedule_index) DO NOTHING;

SELECT 'Migration V3.2 selesai!' as status,
       (SELECT COUNT(*) FROM lele_devices) as lele_devices,
       (SELECT COUNT(*) FROM lele_device_schedules) as schedules;
