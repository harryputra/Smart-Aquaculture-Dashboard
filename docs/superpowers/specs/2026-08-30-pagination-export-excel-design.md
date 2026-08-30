# Pagination + Jumlah Tampil + Export Excel (Tahap 1: Riwayat Akhir)

Status: Disetujui user, siap masuk implementation plan.
Tanggal: 2026-08-30

## Latar belakang

User meminta pagination, kontrol "jumlah data ditampilkan", dan export ke Excel
untuk **setiap list data yang ada** di aplikasi. Eksplorasi awal menemukan
**24 file frontend** yang merender `<table>` — menerapkan ketiganya ke semua
sekaligus dalam satu putaran kerja terlalu besar untuk satu spec/plan.

User menyetujui pendekatan bertahap: bangun dulu **komponen/hook yang bisa
dipakai ulang**, terapkan ke tabel dengan volume data terbesar & paling sering
dipakai sepanjang sesi ini — **`RiwayatAkhirPanel.jsx`** (halaman Pakan Lele →
tab Riwayat Akhir, 5 sub-tab: Sesi Pakan 300+ baris, Batch Detail, Riwayat
Sampling, Detail per Ikan, Error) — sebagai percontohan. Tabel lain menyusul
di putaran kerja terpisah, memakai komponen yang sama tanpa desain ulang.

## Tujuan (tahap ini)

1. Tiga bagian dipakai ulang, tidak spesifik ke satu tabel:
   - **`usePagination(data, defaultPageSize)`** hook — memotong array jadi
     halaman-halaman, expose kontrol halaman & ukuran halaman.
   - **`<PaginationControls>`** — UI tombol Sebelumnya/Selanjutnya, nomor
     halaman, dan dropdown "Tampilkan: 10/25/50/100 baris".
   - **`<ExportExcelButton>`** — tombol unduh **seluruh data yang sedang
     dimuat** (bukan cuma halaman yang sedang tampil) sebagai file `.xlsx`,
     dibuat sepenuhnya di browser (tanpa request baru ke server).
2. Terapkan ketiganya ke **kelima sub-tab** `RiwayatAkhirPanel.jsx`, masing-
   masing dengan pagination & export **terpisah sendiri-sendiri** (kolom tiap
   tab beda-beda, jadi tidak digabung jadi satu export).
3. Pagination dilakukan **di sisi browser** (client-side) — dataset tahap ini
   masih dalam skala ratusan baris (sudah dimuat penuh oleh `load()` yang
   sudah ada), bukan puluhan ribu — tidak perlu ubah endpoint backend.
4. Hapus batasan keras `slice(0, 100)`/`slice(0, 200)` yang sudah ada di tab
   Batch Detail & Detail per Ikan — pagination menggantikan fungsi pembatasan
   itu, sekaligus membuat SEMUA data (bukan cuma 100/200 baris pertama) bisa
   diekspor.

## Yang SENGAJA di luar scope (tahap ini)

- **20+ file tabel lain** (Log Aktivitas, Riwayat Siklus, Biaya Operasional,
  Pengguna, Firmware, dll) — akan menyusul di putaran kerja terpisah, memakai
  3 komponen yang sama dari tahap ini tanpa desain ulang.
- **Pagination sisi server** — kalau nanti ada tabel dengan dataset jauh
  lebih besar (puluhan ribu baris), baru dipertimbangkan endpoint
  LIMIT/OFFSET terpisah. Tidak dibangun sekarang (YAGNI).
- **Filter/pencarian dalam tabel** — di luar permintaan user, tidak
  ditambahkan sekarang.
- **Export gabungan lintas-tab** (mis. satu file Excel berisi 5 sheet
  sekaligus) — user tidak memintanya; tiap tab tetap file terpisah agar
  sederhana dan sesuai kolom masing-masing.

## Desain

### 1. `frontend/src/hooks/usePagination.js` (baru)

```js
import { useState, useMemo } from 'react';

export function usePagination(data, defaultPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  function setPageSize(newSize) {
    setPageSizeRaw(newSize);
    setPage(1);
  }

  return { page: safePage, setPage, pageSize, setPageSize, pageData, totalPages, totalItems };
}
```

`safePage` menjaga nomor halaman tidak "nyangkut" di luar jangkauan kalau
dataset menyusut (mis. setelah reload data lebih sedikit dari sebelumnya).

### 2. `frontend/src/components/PaginationControls.jsx` (baru)

Props: `{ page, totalPages, totalItems, pageSize, setPage, setPageSize }`.
Render `null` kalau `totalItems === 0` (tak perlu kontrol utk tabel kosong).
Tampilkan teks "Menampilkan X–Y dari Z baris", dropdown ukuran halaman
(`10/25/50/100`), dan tombol Sebelumnya/Selanjutnya (disabled di ujung).

### 3. `frontend/src/components/ExportExcelButton.jsx` (baru)

Props: `{ data, columns, filename, sheetName = 'Data' }`, dengan
`columns: Array<{ header: string, accessor: string | (row) => any }>`.
Pakai library `xlsx` (SheetJS) — `XLSX.utils.json_to_sheet` dari data yang
sudah dipetakan lewat `columns` (supaya kolom Excel punya nama manusiawi &
nilai sudah diformat sama seperti yang tampil di tabel, bukan field mentah
database), lalu `XLSX.writeFile(wb, filename)`. Tombol disabled kalau
`data.length === 0`.

Tambah dependency baru: `xlsx` di `frontend/package.json`.

### 4. Modifikasi `frontend/src/components/lele/RiwayatAkhirPanel.jsx`

Tambah 5 pemanggilan `usePagination` di top-level komponen (satu per
sub-tab: `sessions`, `sessionsBatched`, `summaries`, `samplesFlat`, `errors`)
— wajib di top-level (bukan di dalam blok `{activeTab === 'x' && (...)}`)
karena aturan React Hooks (tidak boleh dipanggil kondisional).

Tiap tabel diubah dari me-render array penuh (atau `.slice(0,100)`/
`.slice(0,200)`) menjadi me-render `xxxPagination.pageData`, diikuti
`<PaginationControls {...xxxPagination} />` tepat di bawah `</table>`, dan
satu `<ExportExcelButton data={xxxFullArray} columns={[...]} filename="..."/>`
di baris header tab (sejajar judul tab) memakai array PENUH (bukan
`pageData`) supaya export selalu mencakup semua baris terlepas dari halaman
yang sedang dilihat.

Definisi kolom per tab (nama header + accessor, meniru persis format yang
sudah tampil di tabel on-screen):
- **Sesi Pakan**: Mulai (tanggal terformat), Sesi, Target (g), Aktual (g),
  Batch, Status (teks "Sukses"/"Gagal"/"Berjalan", bukan badge).
- **Batch Detail**: Waktu, Sesi, Batch (`no/total`), Target (g), Aktual (g),
  Spinner, Status (teks "Sukses"/"Gagal", bukan emoji — emoji tidak
  render rapi di Excel).
- **Riwayat Sampling**: Waktu, Rata-rata Berat (g), Jml Sample, Jml Ikan
  Kolam, Estimasi Biomassa (kg), Pakan/Jadwal (g).
- **Detail per Ikan**: Waktu, Sesi, Ikan #, Berat Aktual (g).
- **Error**: Waktu, Code, Pesan.

Nama file export menyertakan `device.device_id` supaya jelas asalnya kalau
user mengelola lebih dari satu feeder, mis. `sesi-pakan-pakan_lele_01.xlsx`.

### 5. Testing / verifikasi manual

Tidak ada test suite otomatis di project ini — verifikasi lewat
`npm run build` (memastikan `xlsx` ter-bundle & tidak ada error import),
lalu manual di browser: buka tiap sub-tab, pastikan pagination & dropdown
ukuran halaman bekerja, dan tombol Export Excel mengunduh file `.xlsx` yang
bisa dibuka (isi kolom sesuai definisi di atas, mencakup SEMUA baris bukan
cuma yang tampil di halaman aktif).
