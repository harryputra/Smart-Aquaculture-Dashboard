-- ============================
-- Smart Aquaculture - MIGRATION V3.2.3 (schedfix)
-- Menambahkan kolom yang sesuai dengan field MQTT baru dari firmware
-- pakan_lele_v3_2_3_schedfix.ino (spinner PWM ramp-down + sample manual flag)
-- Aman dijalankan berkali-kali (idempotent)
-- ============================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='sample_is_manual') THEN
        ALTER TABLE lele_devices ADD COLUMN sample_is_manual BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='spinner_pwm') THEN
        ALTER TABLE lele_devices ADD COLUMN spinner_pwm INTEGER DEFAULT 0;
    END IF;
END
$$;

SELECT 'Migration V3.2.3 schedfix selesai!' as status;
