-- ============================
-- Smart Aquaculture - Lele Final Spec Migration
-- Tambahan untuk versi final sesuai spec menu LCD
-- ============================

-- Parameter pond untuk lele feeder (override fish_count, feeding_rate, feeding_per_day)
CREATE TABLE IF NOT EXISTS lele_pond_config (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) UNIQUE NOT NULL,
    fish_count INTEGER DEFAULT 1000,
    feeding_rate_percent DECIMAL(5, 2) DEFAULT 3.0,
    feeding_per_day INTEGER DEFAULT 2,
    min_sample_count INTEGER DEFAULT 10,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Jadwal pakan berbasis jam (final spec - bukan interval test)
CREATE TABLE IF NOT EXISTS lele_feed_schedules (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    schedule_time TIME NOT NULL,        -- contoh 07:00, 17:00
    is_active BOOLEAN DEFAULT TRUE,
    last_executed TIMESTAMP,
    note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Riwayat tare (untuk Sensor Health panel)
CREATE TABLE IF NOT EXISTS lele_tare_history (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    scale_type VARCHAR(20),             -- 'chamber', 'sampling', 'all'
    triggered_by VARCHAR(50),
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tracking pertumbuhan ikan (snapshot biomassa harian/mingguan)
CREATE TABLE IF NOT EXISTS lele_growth_tracking (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    average_fish_weight_g DECIMAL(8, 2),
    estimated_biomass_kg DECIMAL(10, 3),
    fish_count INTEGER,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_growth_device ON lele_growth_tracking(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_device ON lele_feed_schedules(device_id);

-- Insert default jadwal & config untuk device existing
INSERT INTO lele_pond_config (device_id) 
SELECT device_id FROM lele_devices 
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO lele_feed_schedules (device_id, schedule_time, note)
SELECT 'pakan_lele_01', '07:00', 'Pakan pagi'
WHERE NOT EXISTS (SELECT 1 FROM lele_feed_schedules WHERE device_id = 'pakan_lele_01');

INSERT INTO lele_feed_schedules (device_id, schedule_time, note)
SELECT 'pakan_lele_01', '17:00', 'Pakan sore'
WHERE (SELECT COUNT(*) FROM lele_feed_schedules WHERE device_id = 'pakan_lele_01') < 2;
