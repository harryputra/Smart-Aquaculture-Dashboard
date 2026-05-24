-- ============================
-- Smart Aquaculture - Lele Feeder Migration
-- Run: docker exec -i aquaculture_postgres psql -U aquaculture -d aquaculture < migration-lele.sql
-- ============================

-- Mapping device fisik (ESP32 pakan lele) ke pond
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
    avg_fish_g DECIMAL(8, 2),
    rtc_interval_min INTEGER,
    seconds_to_next_feed INTEGER,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE SET NULL
);

-- Sampling biomassa per ikan
CREATE TABLE IF NOT EXISTS lele_biomass_samples (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    fish_no INTEGER NOT NULL,
    fish_weight_g DECIMAL(8, 2) NOT NULL,
    sampled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ringkasan biomassa
CREATE TABLE IF NOT EXISTS lele_biomass_summary (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    sample_count INTEGER,
    average_fish_weight_g DECIMAL(8, 2),
    fish_count INTEGER,
    estimated_biomass_kg DECIMAL(10, 3),
    feeding_rate_percent DECIMAL(5, 2),
    feeding_per_day INTEGER,
    estimated_daily_feed_g DECIMAL(10, 2),
    estimated_feed_per_schedule_g DECIMAL(10, 2),
    summarized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feeding session
CREATE TABLE IF NOT EXISTS lele_feed_sessions (
    id BIGSERIAL PRIMARY KEY,
    feed_session_id VARCHAR(100) UNIQUE NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    session_name VARCHAR(100),
    target_total_g DECIMAL(10, 2),
    actual_total_g DECIMAL(10, 2),
    planned_batch_count INTEGER,
    actual_batch_count INTEGER,
    max_batch_g DECIMAL(8, 2),
    success BOOLEAN,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Batch detail per session
CREATE TABLE IF NOT EXISTS lele_feed_batches (
    id BIGSERIAL PRIMARY KEY,
    feed_session_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    batch_no INTEGER,
    total_batches INTEGER,
    target_g DECIMAL(8, 2),
    actual_g DECIMAL(8, 2),
    spinner_direction VARCHAR(10),
    success BOOLEAN,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error log
CREATE TABLE IF NOT EXISTS lele_errors (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    pond_id VARCHAR(50),
    code VARCHAR(50),
    message TEXT,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lele_biomass_device ON lele_biomass_samples(device_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_lele_feed_device ON lele_feed_sessions(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lele_batch_session ON lele_feed_batches(feed_session_id);
CREATE INDEX IF NOT EXISTS idx_lele_err_device ON lele_errors(device_id, occurred_at DESC);

-- Insert device default
INSERT INTO lele_devices (device_id, name) VALUES ('pakan_lele_01', 'Pakan Lele Otomatis #1')
ON CONFLICT (device_id) DO NOTHING;
