# 🗺️ Rencana: Pengelolaan Kolam (port fitur SI-PAKALE)

Roadmap penambahan fitur **pengelolaan kolam / budidaya** dari SI-PAKALE
(`umkm_lele`) ke Smart-Aquaculture. Keputusan terkunci:
- **Scope: semua (Fase 1–4)** · **Keuangan: disertakan** · **UI: dikelompokkan ulang**.

## Konsep inti — Siklus Budidaya
Entitas **`pond_cycles`** (satu periode tebar→panen) jadi payung. Pakan, sampling,
mortalitas, biaya, panen ditautkan ke `cycle_id`. Data hardware lele yang sudah ada
tetap jalan; siklus menaungi data manual & hardware.

## Struktur UI baru (PondDetail) — 2 grup
- **Operasional** (harian/hardware): Monitor · Kontrol Air · Pakan · Jadwal · Log · Pengaturan
- **Budidaya** (manajemen siklus): **Siklus** · **Biomassa** · Mortalitas · **Keuangan** · **Logbook**

(tab Mortalitas dipindah ke grup Budidaya + ditambah fitur audit air; tab cetak tebal = baru)

---

## Fase 1 — Siklus Budidaya (fondasi) ⭐
**DB:** `pond_cycles` + kolom `cycle_id` di `feeding_logs`/`mortality_records` + backfill 1 siklus aktif/kolam.
**Backend:** `GET/POST /api/ponds/:id/cycle` (aktif + metrik: umur, SR, estimasi biomassa, proyeksi), `POST .../cycle/harvest` (tutup + hitung SR/FCR/revenue/profit/ROI), `GET .../cycles` (riwayat).
**Frontend:** tab **Siklus** — kartu siklus aktif, form mulai siklus, modal **Laporan Panen**, riwayat siklus.

## Fase 2 — Biomassa & Pertumbuhan (sampling manual)
**DB:** `biomass_samples` + `biomass_sample_entries` (per siklus).
**Backend:** start/entry/finalize sampling, auto feeding-rate (<50g→5%, 50–100g→4%, >100g→3%), kurva pertumbuhan + prediksi hari ke target.
**Frontend:** tab **Biomassa** — input timbang per ikan, rata-rata live, grafik pertumbuhan (Recharts), riwayat. (Tampilkan juga sampel hardware lele bila kolam punya device.)

## Fase 3 — Pakan & Ekonomi
**DB:** `feed_stock` per kolam (+ ambang rendah), `operational_costs` per siklus, harga pakan (`feed_price_per_kg`).
**Backend:** update stok + alert rendah, auto-kalkulasi gramasi (populasi × berat × FR), `POST .../costs`, `GET .../financial` (proyeksi revenue/biaya/profit/ROI live).
**Frontend:** tab **Keuangan** — rincian biaya (benih/pakan/operasional), proyeksi profit & ROI, kartu stok pakan + alert; integrasi biaya pakan ke Laporan Panen.

## Fase 4 — Pelengkap
- **Audit air 7 hari** sebelum kematian (di tab Mortalitas) — query `sensor_data` mundur 7 hari + statistik anomali.
- **Logbook** `pond_logbook` (catatan/insiden per kolam/siklus) + tab Logbook.
- **Ekspor CSV** (sensor, pakan, mortalitas, riwayat siklus) + **arsip kolam** (`ponds.is_active`).

---

## Skema DB (PostgreSQL) — `database/migration-budidaya.sql`
- `pond_cycles` (siklus + data panen + status)
- `biomass_samples`, `biomass_sample_entries`
- `feed_stock`, `operational_costs`, `pond_logbook`
- ALTER: `feeding_logs.cycle_id`, `mortality_records.cycle_id`, `ponds.is_active`, harga pakan
- Backfill: 1 siklus aktif per kolam existing (dari `stocking_date`/`initial_fish_count`)
- Idempoten (IF NOT EXISTS) → jalan otomatis via `./run.sh deploy`.

## Pertimbangan adaptasi
- **SQLite → PostgreSQL**: tipe & index diterjemahkan; SERIAL/NUMERIC/TIMESTAMPTZ.
- **Tak merusak yang ada**: tab & endpoint lama tetap; data lele hardware tetap jalan.
- **Migrasi data**: backfill siklus aktif agar histori tak hilang.
- **UI**: pakai skill `ui-ux-design`; konsisten tema "Ocean Depths".

## Urutan kerja
1. DB migration (semua tabel) + daftar di run.sh ✅ (fondasi)
2. Backend Fase 1 (cycle) → Frontend Fase 1 (tab Siklus + regroup UI)
3. Backend+Frontend Fase 2 (Biomassa)
4. Backend+Frontend Fase 3 (Keuangan)
5. Fase 4 (audit air, logbook, ekspor, arsip)

Tiap fase = commit terpisah + bisa diuji sebelum lanjut.
