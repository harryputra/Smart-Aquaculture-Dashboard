# Metrik HPP per Kg + Harga Jual Perkiraan Tersimpan

Status: Disetujui user, siap masuk implementation plan.
Tanggal: 2026-08-27

## Latar belakang

User (Pak Tiana, Kelompok Tani Ternak Tunas Mekar) membuat hitungan manual HPP
(Harga Pokok Produksi) Full Costing untuk kolam lele bioflok C1: total biaya
bahan baku (benih + pakan) dibagi total kg panen, menghasilkan **Rp17.333/kg**
sebagai acuan harga jual minimum.

Analisis perbandingan dengan data live sistem (`pond_c1_tunas`, siklus
`cyc_c1_active`) menemukan:
- Data dasar (jumlah benih, biaya benih, target berat) **sudah cocok** antara
  manual dan sistem — bukan masalah data.
- Selisih pakan/harga pakan/biaya operasional adalah beda **data & metodologi**
  (asumsi proposal vs realisasi aktual), diselesaikan dengan update data
  manual di aplikasi yang sudah ada — di luar cakupan pekerjaan ini.
- **Dua gap nyata di aplikasi**: (1) tidak ada metrik "HPP per kg" di mana pun
  (backend `cycle-management.js` maupun frontend), padahal semua bahan
  baku hitungnya (`total_cost`, berat panen/biomassa) sudah tersimpan; (2)
  field "harga jual perkiraan" di tab Keuangan (`FinancialTab.jsx`) cuma
  `useState` lokal — hilang tiap reload halaman, tidak pernah tersimpan ke
  database.

Spec ini menutup kedua gap tersebut.

## Tujuan

1. Tampilkan **HPP Berjalan** (estimasi, selama siklus aktif) = biaya
   terkumpul saat ini ÷ biomassa saat ini (`est_biomass_kg`) — ditandai jelas
   sebagai estimasi yang akan berubah sampai panen. Otomatis tersembunyi
   ("-") sebelum ada sampling biomassa, mengikuti pola metrik lain yang sudah
   ada (`avg_weight_g`/`est_biomass_kg` juga `null` sampai sampling pertama).
2. Tampilkan **HPP Panen** (final) = `total_cost` final ÷ `harvest_total_kg`
   final — dihitung sekali saat panen final, disertakan di breakdown respons
   `POST /cycle/harvest`, dan bisa dihitung ulang kapan saja dari riwayat
   siklus (karena `total_cost` & `harvest_total_kg` sudah tersimpan permanen
   di `pond_cycles` sejak sebelum spec ini).
3. Simpan **harga jual perkiraan per siklus** (`target_sell_price_per_kg`) ke
   database, bisa diedit bebas kapan saja selama siklus aktif (dikonfirmasi
   user), tidak lagi hilang saat reload halaman.
4. Tempat tampil:
   - `FinancialTab.jsx` (tab Keuangan di Detail Kolam standar) — box "HPP
     Berjalan" baru + field harga jual yang sekarang tersimpan dengan tombol
     Simpan sendiri.
   - `CycleTab.jsx` — modal hasil "Panen Final & Tutup Siklus" (baris HPP per
     kg di breakdown), dan tabel "Riwayat Siklus" (kolom HPP/kg per baris,
     dihitung langsung di frontend dari data yang sudah ada, tanpa endpoint
     baru).
   - `RiwayatAkhirPanel.jsx` (ringkasan keuangan siklus di halaman Pakan
     Lele/hardware) — box "HPP Berjalan" baru, konsisten dengan
     `FinancialTab.jsx` karena sumber datanya sama (`getFinancial`).

## Yang SENGAJA di luar scope

- **Tidak menyentuh data**: harga pakan (Rp12.450 vs asumsi manual
  Rp14.500), metodologi biaya operasional (itemized vs alokasi dari untung),
  dan kesenjangan pakan aktual vs asumsi proposal — semua itu keputusan
  data/kebijakan pencatatan milik user, bukan perubahan kode.
- **Tidak membuat proyeksi HPP "akhir siklus" yang mem-forecast sisa biaya
  pakan/operasional ke depan.** HPP Berjalan sengaja hanya memakai biaya &
  biomassa SAAT INI (bukan proyeksi biaya sampai panen) — lebih sederhana,
  tidak menyesatkan dengan asumsi tambahan yang belum disepakati.
- **Tidak membuat endpoint PUT generik untuk semua field `pond_cycles`.**
  Endpoint baru `PUT /api/ponds/:pondId/cycle` sengaja hanya menerima
  `target_sell_price_per_kg` untuk saat ini (YAGNI) — gampang diperluas nanti
  kalau ada field lain yang perlu diedit di tengah siklus.
- **Tidak mengubah cara `proj_harvest_kg`/`proj_revenue`/`proj_roi` dihitung
  di `FinancialTab.jsx`** (tetap dihitung di frontend seperti sekarang) —
  yang berubah hanya SUMBER nilai awal `sellPrice` (dari state kosong jadi
  dari data tersimpan) dan adanya kemampuan menyimpannya kembali.

## Desain

### 1. Database: migrasi `pond_cycles`

```sql
ALTER TABLE pond_cycles ADD COLUMN IF NOT EXISTS target_sell_price_per_kg NUMERIC(14,2);
```

Nullable, tanpa default — kolom lama (siklus yang sudah ada) otomatis `NULL`,
ditampilkan sebagai field kosong di form (perilaku sama seperti sebelum ada
kolom ini).

### 2. Backend: `backend/cycle-management.js`

**`GET /api/ponds/:pondId/financial`** (siklus aktif) — tambah 2 field baru
ke response JSON:
- `target_sell_price_per_kg`: dari `cycle.target_sell_price_per_kg` (null
  kalau belum pernah diisi).
- `hpp_running_per_kg`: `m.est_biomass_kg > 0 ? total_cost / m.est_biomass_kg
  : null` — pakai `total_cost` yang SAMA persis dengan yang sudah dihitung di
  endpoint ini (fry_cost + feed_cost + op), tidak ada perhitungan biaya baru.

**`POST /api/ponds/:pondId/cycle/harvest`** (panen final) — tambah 1 field ke
`breakdown`:
- `hpp_per_kg`: `harvest_total_kg > 0 ? total_cost / harvest_total_kg : null`
  — pakai `total_cost`/`harvest_total_kg` yang SAMA persis dengan yang sudah
  dihitung & disimpan di endpoint ini.

**Endpoint baru** `PUT /api/ponds/:pondId/cycle`:
- Guard: hanya berlaku untuk siklus **aktif** milik pond ini (404 kalau tak
  ada siklus aktif — pola sama seperti endpoint cycle lain di file ini).
- Body: `{ target_sell_price_per_kg }` — angka `>= 0` atau `null` (mengosongkan
  kembali). Tolak (400) kalau field ini tidak dikirim sama sekali atau berupa
  angka negatif.
- `UPDATE pond_cycles SET target_sell_price_per_kg=$2 WHERE cycle_id=$1
  RETURNING *`.
- Middleware: `requirePondAccess('pondId')` (pola sama seperti endpoint cycle
  lain), tidak perlu `requireRole` tambahan (mengedit estimasi harga jual
  bukan aksi sensitif seperti hapus/panen).

### 3. Frontend: `frontend/src/services/api.js`

Tambah satu fungsi baru, ditaruh persis di bawah `cancelCycle` (grup "Siklus
Budidaya"):
```js
export const updateCycle = (pondId, data) =>
  req(`/ponds/${pondId}/cycle`, { method: 'PUT', body: data });
```

### 4. Frontend: `frontend/src/components/FinancialTab.jsx`

- State `sellPrice` diinisialisasi dari `fin.target_sell_price_per_kg` (bukan
  string kosong) setiap `load()` berhasil ambil data baru.
- Tombol **Simpan** baru di sebelah input "Estimasi harga jual (Rp/kg)" —
  memanggil `updateCycle(pondId, { target_sell_price_per_kg: parseFloat(sellPrice) || null })`
  lalu `load()` ulang.
- Box baru **"HPP Berjalan"** di grid biaya (sejajar Biaya benih/pakan/
  operasional/Total biaya): `rupiah(fin.hpp_running_per_kg)` kalau tidak
  null, kalau null tampilkan `-` dengan sub-text "Belum ada sampling
  biomassa" (pola sama seperti field lain yang menunggu data).
- Sub-text kecil di bawah box ini: "Estimasi berjalan, berubah sampai panen"
  — supaya tidak disalahartikan sebagai HPP final.

### 5. Frontend: `frontend/src/components/CycleTab.jsx`

- Modal hasil "Panen Final & Tutup Siklus" (fungsi `FinalHarvestModal`,
  bagian `<Row>` breakdown): tambah `<Row k="HPP per kg" v={rupiah(b.hpp_per_kg)} />`
  tepat setelah baris "Total biaya".
- Tabel "Riwayat Siklus": tambah kolom header `<th>HPP/kg</th>` dan sel
  `<td>{c.total_cost && c.harvest_total_kg ? rupiah(c.total_cost / c.harvest_total_kg) : '-'}</td>`
  — dihitung langsung dari data yang sudah ada di setiap baris `completed`
  (tidak perlu field baru dari backend untuk tabel ini, karena
  `total_cost`/`harvest_total_kg` history sudah lama tersimpan).

### 6. Frontend: `frontend/src/components/lele/RiwayatAkhirPanel.jsx`

Tambah satu `FinBox` baru di grid Ringkasan Keuangan Siklus, setelah "Total
Biaya":
```jsx
<FinBox label="HPP Berjalan" value={fin.hpp_running_per_kg != null ? rupiah(fin.hpp_running_per_kg) : '-'}
  sub="Estimasi, berubah sampai panen" />
```

### 7. Testing / verifikasi manual

Tidak ada test suite otomatis di project ini (konsisten dengan seluruh
codebase) — verifikasi lewat `node --check` (backend) + `npm run build`
(frontend), lalu manual di data live:
- Buka tab Keuangan kolam `pond_c1_tunas` (siklus aktif, sudah ada sampling
  biomassa) → pastikan "HPP Berjalan" muncul dan masuk akal (`total_cost`
  saat ini ÷ `est_biomass_kg` saat ini).
- Isi "Estimasi harga jual" → Simpan → reload halaman → pastikan nilainya
  tetap ada (tidak reset ke kosong).
- Simulasikan panen final (di kolam uji/dev, bukan `pond_c1_tunas` yang
  masih aktif nyata) → pastikan breakdown hasil panen menampilkan "HPP per
  kg" yang benar (`total_cost` ÷ `harvest_total_kg` hasil panen itu).
- Cek tabel Riwayat Siklus pada kolam yang sudah punya siklus `completed` →
  kolom HPP/kg terisi benar untuk baris lama sekalipun (tanpa perlu migrasi
  data, karena dihitung dari kolom yang sudah ada).
