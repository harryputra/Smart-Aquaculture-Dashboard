-- ============================
-- Smart Aquaculture - MIGRATION HPP PER KG + HARGA JUAL TERSIMPAN
-- Menambahkan kolom target_sell_price_per_kg di pond_cycles supaya
-- "harga jual perkiraan" di tab Keuangan tidak hilang tiap reload halaman.
-- Aman dijalankan berkali-kali (idempotent)
-- ============================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pond_cycles' AND column_name='target_sell_price_per_kg') THEN
        ALTER TABLE pond_cycles ADD COLUMN target_sell_price_per_kg NUMERIC(14,2);
    END IF;
END
$$;

SELECT 'Migration HPP per kg + harga jual tersimpan selesai!' as status;
