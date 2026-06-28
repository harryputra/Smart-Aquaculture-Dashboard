-- ======================================================================
-- Migrasi: log lalu lintas MQTT device lele (monitor/diagnostik 2 arah)
-- Idempoten (IF NOT EXISTS). Aman dijalankan berulang.
-- ======================================================================

CREATE TABLE IF NOT EXISTS lele_mqtt_traffic (
  id         BIGSERIAL PRIMARY KEY,
  device_id  TEXT,
  direction  TEXT NOT NULL,            -- 'in'  = dari hardware, 'out' = ke hardware
  topic      TEXT NOT NULL,
  payload    TEXT,                      -- raw payload (apa adanya, seperti serial monitor)
  is_error   BOOLEAN DEFAULT FALSE,    -- true utk topik error / ACK gagal
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lele_traffic_id        ON lele_mqtt_traffic (id);
CREATE INDEX IF NOT EXISTS idx_lele_traffic_device_id ON lele_mqtt_traffic (device_id, id);
CREATE INDEX IF NOT EXISTS idx_lele_traffic_created   ON lele_mqtt_traffic (created_at);
