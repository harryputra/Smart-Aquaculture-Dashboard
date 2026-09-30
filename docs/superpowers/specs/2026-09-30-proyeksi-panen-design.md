# Proyeksi Panen (Prediksi Tanggal, Hasil, Pakan, Untung)

Status: Disetujui user, siap masuk implementation plan.
Tanggal: 2026-09-30

## Latar belakang

User ingin cek dari dashboard: perkiraan tanggal panen, estimasi total ekor &
kg ikan yang didapat, berapa kg+Rp pakan sudah dikeluarkan, dan proyeksi
pendapatan bersih setelah dikurangi biaya. Sebelum itu dipastikan dulu fungsi
pengukuran biomassa (hardware + manual) sudah ada — **sudah ada**
(`TimbangBiomassaPanel.jsx`, sampling otomatis via load cell ATAU input
manual, mirror menu LCD).

Investigasi menemukan skema data & sebagian logika **sudah tersedia**, jadi
scope fitur ini lebih ke komposisi/tampilan daripada bangun dari nol:
- `pond_cycles.target_harvest_date`, `target_weight_g` — sudah ada & sudah
  bisa diisi user di `CycleTab.jsx`.
- `cycleMetrics()` (`backend/cycle-management.js`) — SUDAH menghitung
  `days_to_target` (proyeksi hari ke target berat, laju linear dari sampling
  terakhir), `population` (estimasi ekor hidup: initial − mati − panen
  parsial), `total_feed_kg` (dari `feeding_logs`, sudah tersinkron dari sesi
  pakan ESP32 lewat `lele-integration.js:335`).
- `feed_stock.price_per_kg`, `operational_costs`, `pond_cycles.fry_cost_total`
  — sudah dipakai pola perhitungan biaya yang sama di endpoint
  `/api/ponds/:pondId/overview` (baris ~142-145).

## Tujuan

Endpoint baru yang MENGOMPOSISIKAN nilai-nilai di atas jadi satu proyeksi utuh,
plus kartu baru di dashboard menampilkannya.

## Desain

### Backend — `GET /api/ponds/:pondId/harvest-projection`

Di `backend/cycle-management.js`, pakai siklus aktif + `cycleMetrics(cycle)`
yang sudah ada, tambahkan:
- `predicted_harvest_date` = hari ini + `days_to_target` (null kalau data
  sampling belum cukup untuk hitung laju).
- `projected_total_kg` = `population × target_weight_g ÷ 1000`.
- `feed_cost_so_far` = `total_feed_kg × feed_stock.price_per_kg`.
- `total_cost_so_far` = `fry_cost_total + feed_cost_so_far + SUM(operational_costs)`
  (pola sama seperti `/overview`).
- `daily_op_cost_rate` = biaya operasional sejauh ini ÷ hari berjalan siklus.
- `projected_remaining_op_cost` = `daily_op_cost_rate × days_to_target`.
- `projected_revenue` = `projected_total_kg × target_sell_price_per_kg`
  (kolom yang sudah ada dari fitur HPP sebelumnya; 0/null kalau belum diisi).
- `projected_profit` = `projected_revenue − (total_cost_so_far + projected_remaining_op_cost)`.

Response menyertakan juga field mentah pendukungnya (`population`,
`avg_weight_g`, `total_feed_kg`, `days`, `days_to_target`) supaya frontend
tak perlu request terpisah.

**Catatan asumsi (ditulis jelas di response/UI, bukan disembunyikan):**
proyeksi laju pertumbuhan LINEAR dari titik sampling TERAKHIR (bukan model
kurva biologis pertumbuhan lele) — akurasi meningkat seiring makin banyak &
makin rutin sampling biomassa dilakukan. Proyeksi biaya pakan ke depan
TIDAK diekstrapolasi (cuma yang sudah terpakai sampai sekarang) — disclaimer
di UI, bukan dihitung sebagai angka pasti.

### Frontend

Kartu baru "Proyeksi Panen" di `CycleTab.jsx`, di bawah info siklus aktif
yang sudah ada (dekat baris ~159-160 `target_harvest_date`/`target_weight_g`
yang sudah tampil). Isi:
- Tanggal prediksi panen (atau pesan "belum cukup data sampling" kalau null).
- Estimasi ekor & kg saat panen.
- Pakan terpakai sejauh ini (kg & Rp).
- Proyeksi untung/rugi bersih, dengan catatan kecil disclaimer asumsi di atas.

Fungsi `getHarvestProjection(pondId)` baru di `frontend/src/services/api.js`.

## Yang SENGAJA di luar scope

- Tidak bikin model pertumbuhan biologis species-specific (kurva lele) —
  linear-dari-sampling-terakhir cukup untuk kebutuhan sekarang, YAGNI.
- Tidak ekstrapolasi proyeksi BIAYA PAKAN ke depan (harga pakan/gram bisa
  berubah, safer tampilkan yang sudah pasti terjadi + disclaimer daripada
  angka proyeksi yang bisa menyesatkan).
- Tidak ubah skema DB — semua kolom yang dibutuhkan sudah ada.

## Testing / verifikasi manual

Tidak ada test suite otomatis di project ini. Verifikasi: buka tab Siklus
kolam yang punya minimal 2 data sampling biomassa (beda tanggal) + siklus
aktif dengan `target_weight_g` terisi, pastikan proyeksi tampil masuk akal
(tanggal di masa depan, bukan NaN/Invalid Date). Uji juga kolam dengan cuma
1/0 sampling — harus tampil pesan "belum cukup data", bukan crash.
