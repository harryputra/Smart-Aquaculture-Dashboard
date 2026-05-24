-- ============================
-- Smart Aquaculture Database Schema v2
-- PostgreSQL Init Script
-- ============================

CREATE TABLE IF NOT EXISTS farms (
    id SERIAL PRIMARY KEY,
    farm_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    owner VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ponds (
    id SERIAL PRIMARY KEY,
    pond_id VARCHAR(50) UNIQUE NOT NULL,
    farm_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    fish_type VARCHAR(50),
    size_m2 DECIMAL(10, 2),
    max_depth DECIMAL(10, 2),
    fish_count INTEGER DEFAULT 0,
    initial_fish_count INTEGER DEFAULT 0,
    stocking_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    device_mode VARCHAR(20) DEFAULT 'dummy',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(farm_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_status (
    id SERIAL PRIMARY KEY,
    pond_id VARCHAR(50) UNIQUE NOT NULL,
    device_id VARCHAR(100),
    is_connected BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP,
    ip_address VARCHAR(50),
    firmware_version VARCHAR(20),
    rssi INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor_data (
    id BIGSERIAL PRIMARY KEY,
    farm_id VARCHAR(50) NOT NULL,
    pond_id VARCHAR(50) NOT NULL,
    temperature DECIMAL(5, 2),
    depth DECIMAL(6, 2),
    dissolved_oxygen DECIMAL(5, 2),
    turbidity DECIMAL(6, 2),
    ph DECIMAL(4, 2),
    valve_open BOOLEAN DEFAULT FALSE,
    inlet_valve_open BOOLEAN DEFAULT FALSE,
    source VARCHAR(20) DEFAULT 'esp32',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_pond ON sensor_data(pond_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_farm ON sensor_data(farm_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS drain_schedules (
    id SERIAL PRIMARY KEY,
    pond_id VARCHAR(50) NOT NULL,
    schedule_time TIME NOT NULL,
    schedule_days VARCHAR(50),
    duration_minutes INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    last_executed TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feeding_schedules (
    id SERIAL PRIMARY KEY,
    pond_id VARCHAR(50) NOT NULL,
    schedule_time TIME NOT NULL,
    schedule_days VARCHAR(50),
    feed_amount_kg DECIMAL(6, 2) NOT NULL,
    feed_type VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    last_executed TIMESTAMP,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feeding_logs (
    id BIGSERIAL PRIMARY KEY,
    pond_id VARCHAR(50) NOT NULL,
    feed_amount_kg DECIMAL(6, 2),
    feed_type VARCHAR(50),
    triggered_by VARCHAR(50),
    note TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mortality_records (
    id BIGSERIAL PRIMARY KEY,
    pond_id VARCHAR(50) NOT NULL,
    death_count INTEGER NOT NULL,
    cause VARCHAR(100),
    note TEXT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mortality_pond ON mortality_records(pond_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    pond_id VARCHAR(50),
    farm_id VARCHAR(50),
    type VARCHAR(50) NOT NULL,
    category VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    sensor_field VARCHAR(50),
    sensor_value DECIMAL(10, 2),
    is_read BOOLEAN DEFAULT FALSE,
    action_taken VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_pond ON notifications(pond_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS control_logs (
    id BIGSERIAL PRIMARY KEY,
    pond_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    triggered_by VARCHAR(50),
    reason TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensor_thresholds (
    id SERIAL PRIMARY KEY,
    pond_id VARCHAR(50) UNIQUE NOT NULL,
    temp_min DECIMAL(5, 2) DEFAULT 25.0,
    temp_max DECIMAL(5, 2) DEFAULT 30.0,
    depth_min DECIMAL(6, 2) DEFAULT 80.0,
    depth_max DECIMAL(6, 2) DEFAULT 150.0,
    do_min DECIMAL(5, 2) DEFAULT 5.0,
    do_max DECIMAL(5, 2) DEFAULT 8.0,
    turbidity_max DECIMAL(6, 2) DEFAULT 50.0,
    ph_min DECIMAL(4, 2) DEFAULT 6.5,
    ph_max DECIMAL(4, 2) DEFAULT 8.5,
    auto_drain_enabled BOOLEAN DEFAULT TRUE,
    auto_refill_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(pond_id) ON DELETE CASCADE
);

-- Data Dummy
INSERT INTO farms (farm_id, name, location, owner, description) VALUES
('farm_001', 'Peternakan Mina Sejahtera', 'Bandung, Jawa Barat', 'Pak Budi', 'Peternakan ikan air tawar dengan teknologi modern'),
('farm_002', 'Peternakan Tirta Mas', 'Subang, Jawa Barat', 'Pak Andi', 'Spesialis lele dan nila')
ON CONFLICT (farm_id) DO NOTHING;

INSERT INTO ponds (pond_id, farm_id, name, fish_type, size_m2, max_depth, fish_count, initial_fish_count, stocking_date, device_mode) VALUES
('pond_001', 'farm_001', 'Kolam Lele A1', 'Lele', 50.0, 150.0, 1000, 1000, CURRENT_DATE - INTERVAL '30 days', 'dummy'),
('pond_002', 'farm_001', 'Kolam Nila B1', 'Nila', 75.0, 180.0, 1500, 1500, CURRENT_DATE - INTERVAL '45 days', 'dummy'),
('pond_003', 'farm_002', 'Kolam Lele C1', 'Lele', 60.0, 160.0, 1200, 1200, CURRENT_DATE - INTERVAL '20 days', 'dummy')
ON CONFLICT (pond_id) DO NOTHING;

INSERT INTO sensor_thresholds (pond_id) VALUES
('pond_001'), ('pond_002'), ('pond_003')
ON CONFLICT (pond_id) DO NOTHING;

INSERT INTO device_status (pond_id, device_id, is_connected) VALUES
('pond_001', 'ESP32-001', FALSE),
('pond_002', 'ESP32-002', FALSE),
('pond_003', 'ESP32-003', FALSE)
ON CONFLICT (pond_id) DO NOTHING;

INSERT INTO sensor_data (farm_id, pond_id, temperature, depth, dissolved_oxygen, turbidity, ph, source, timestamp) VALUES
('farm_001', 'pond_001', 27.5, 120, 6.5, 25, 7.2, 'dummy', CURRENT_TIMESTAMP - INTERVAL '5 minutes'),
('farm_001', 'pond_001', 27.8, 120, 6.4, 26, 7.1, 'dummy', CURRENT_TIMESTAMP - INTERVAL '10 minutes'),
('farm_001', 'pond_002', 28.0, 140, 6.0, 30, 7.5, 'dummy', CURRENT_TIMESTAMP - INTERVAL '5 minutes');

INSERT INTO mortality_records (pond_id, death_count, cause, note, recorded_at) VALUES
('pond_001', 5, 'tidak_diketahui', 'Ditemukan saat pemeriksaan pagi', CURRENT_TIMESTAMP - INTERVAL '7 days'),
('pond_001', 3, 'penyakit', 'Indikasi infeksi jamur', CURRENT_TIMESTAMP - INTERVAL '14 days'),
('pond_002', 8, 'kualitas_air', 'DO sempat turun ke 3 mg/L', CURRENT_TIMESTAMP - INTERVAL '10 days');

INSERT INTO feeding_schedules (pond_id, schedule_time, schedule_days, feed_amount_kg, feed_type, note) VALUES
('pond_001', '07:00:00', '1,2,3,4,5,6,7', 2.5, 'Pelet 781-2', 'Pakan pagi'),
('pond_001', '16:00:00', '1,2,3,4,5,6,7', 2.5, 'Pelet 781-2', 'Pakan sore'),
('pond_002', '06:30:00', '1,2,3,4,5,6,7', 3.0, 'Pelet 782', 'Pakan pagi');
