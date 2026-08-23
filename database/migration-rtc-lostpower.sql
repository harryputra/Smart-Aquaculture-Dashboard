-- ============================
-- Smart Aquaculture - MIGRATION RTC LOST POWER VISIBILITY
-- Menambahkan kolom utk mendeteksi & menampilkan kondisi "RTC kehilangan
-- waktu saat boot" (mis. baterai cadangan DS3231 lemah/habis setelah mati
-- listrik) yang sebelumnya tak terlihat di dashboard (rtc_ok cuma cek chip
-- merespons, bukan cek waktunya akurat).
-- Aman dijalankan berkali-kali (idempotent)
-- ============================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='rtc_lost_power_at_boot') THEN
        ALTER TABLE lele_devices ADD COLUMN rtc_lost_power_at_boot BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lele_devices' AND column_name='ntp_synced') THEN
        ALTER TABLE lele_devices ADD COLUMN ntp_synced BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;

SELECT 'Migration RTC lost-power visibility selesai!' as status;
