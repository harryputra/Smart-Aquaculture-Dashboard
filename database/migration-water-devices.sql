-- ======================================================================
-- Perangkat AIR (monitoring & kontrol kualitas air) — model DEVICE-ID,
-- disamakan dengan feeder (lele_devices): perangkat auto-daftar via device_id
-- (MAC), lalu di-ASSIGN ke kolam dari dashboard (bukan hardcode farm/pond di
-- firmware). Sensor dirutekan device_id → kolam ter-assign; kontrol & OTA
-- lewat topik device (aquaculture/device/<id>/...). OTA reuse katalog
-- lele_firmware (model 'kualitas_air').
-- ======================================================================

CREATE TABLE IF NOT EXISTS water_devices (
  device_id        TEXT PRIMARY KEY,
  pond_id          TEXT,
  name             TEXT,
  is_online        BOOLEAN      NOT NULL DEFAULT FALSE,
  last_seen        TIMESTAMPTZ,
  ip_address       TEXT,
  rssi             INTEGER,
  firmware_version TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_water_devices_pond ON water_devices(pond_id);

-- Lalu lintas MQTT perangkat air (untuk Monitor MQTT tab "Kualitas Air").
-- Cermin lele_mqtt_traffic.
CREATE TABLE IF NOT EXISTS water_mqtt_traffic (
  id         BIGSERIAL PRIMARY KEY,
  device_id  TEXT,
  direction  TEXT        NOT NULL,     -- in | out
  topic      TEXT        NOT NULL,
  payload    TEXT,
  is_error   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_water_traffic_created ON water_mqtt_traffic(created_at);
