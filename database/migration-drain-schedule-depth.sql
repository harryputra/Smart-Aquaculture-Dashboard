-- ============================
-- Smart Aquaculture - MIGRATION JADWAL KURAS BERBASIS KETINGGIAN
-- Menambahkan mode "depth" pada drain_schedules: kuras otomatis sampai
-- ketinggian target, lalu isi ulang otomatis sampai ketinggian target kedua.
-- Aman dijalankan berkali-kali (idempotent)
-- ============================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='mode') THEN
        ALTER TABLE drain_schedules ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'duration';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='drain_target_cm') THEN
        ALTER TABLE drain_schedules ADD COLUMN drain_target_cm NUMERIC(6,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='refill_target_cm') THEN
        ALTER TABLE drain_schedules ADD COLUMN refill_target_cm NUMERIC(6,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drain_schedules' AND column_name='safety_cap_minutes') THEN
        ALTER TABLE drain_schedules ADD COLUMN safety_cap_minutes INTEGER DEFAULT 30;
    END IF;
END
$$;

SELECT 'Migration jadwal kuras berbasis ketinggian selesai!' as status;
