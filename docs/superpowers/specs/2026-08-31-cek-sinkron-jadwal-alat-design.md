# Cek Sinkron Jadwal ke Alat (Tombol "Cek ke Alat Sekarang")

Status: Disetujui user, siap masuk implementation plan.
Tanggal: 2026-08-31

## Latar belakang

Insiden 30 Agustus 2026: jam sesi "Sore" dan "Malam" di Rencana Pakan Harian
kolam C1 Tunas bergeser dari 15:00→15:16 dan 21:15→21:39 tanpa disadari user,
karena user beberapa kali mengedit jam sesi secara manual (mencoba memaksa
sesi jalan "sekarang") saat mengira jadwal tidak berjalan — padahal masalah
sebenarnya adalah chamber dispenser tersumbat fisik. User tidak sempat sadar
jam sudah berubah karena tidak ada cara mudah untuk memverifikasi "apakah
alat benar-benar menyimpan jam yang saya definisikan" di luar momen langsung
setelah klik Simpan (lihat `FeedPlanCard.jsx` `verifySync()`, yang HANYA
berjalan otomatis sesaat setelah Simpan, dengan delay 2500ms, membandingkan
ke state lokal saat itu).

User meminta: fungsi untuk "nanya" ke hardware terkait jadwal yang sudah
didefinisikan, supaya bisa dipastikan alat menerima data yang konsisten
**kapan saja**, bukan cuma sesaat setelah menyimpan.

## Riset kelayakan

Firmware `pakan_lele_v3_9.ino` sudah memanggil `publishDeviceStatus(false)`
di tiap iterasi `loop()`, dengan self-throttle `STATUS_PUBLISH_MS = 3000` —
artinya **selama alat online**, status lengkap (termasuk array `schedules[]`
berisi hour/minute/enabled/gram tiap slot) sudah otomatis terkirim ke server
paling lama tiap 3 detik. Tidak ada command MQTT "minta status sekarang" di
firmware saat ini (`{command:"get_status"}` akan dibalas "Unknown command").

**Kesimpulan:** tidak perlu menambah command baru / update firmware / OTA.
Data yang cukup fresh (≤ beberapa detik saat alat online) SUDAH tersedia
lewat endpoint yang sudah ada: `GET /api/lele/devices/:deviceId` (dipakai lewat
`getLeleDevice()` di frontend) — mengembalikan `is_online`, `last_seen`, dan
`live_data.schedules` (array real-time dari pesan status MQTT terakhir).

## Tujuan

Tombol **"🔍 Cek ke Alat Sekarang"** di kartu Rencana Pakan Harian
(`FeedPlanCard.jsx`), terpisah dari tombol "Simpan Rencana", yang bisa
diklik **kapan saja** (tidak harus sesudah Simpan) untuk membandingkan jadwal
yang sedang didefinisikan di form dengan jadwal yang **saat ini benar-benar
dilaporkan oleh alat**.

## Yang SENGAJA di luar scope

- **Tidak ada notifikasi aktif** (WhatsApp/in-app) saat terdeteksi tidak
  cocok — user memilih cukup indikator visual di dashboard saat dicek manual.
- **Tidak ada command baru di firmware** — cukup pakai data status yang
  sudah mengalir tiap 3 detik.
- **Tidak ada indikator otomatis/selalu-tampil** — user memilih tombol manual,
  bukan badge yang terus menerus polling di background.
- **Tidak menyentuh `JadwalPakanPanel.jsx`** — halaman itu sudah menampilkan
  jadwal live apa adanya; scope ini hanya menambah pembanding eksplisit di
  Rencana Pakan Harian (tempat jadwal didefinisikan).

## Desain

### Sumber data perbandingan

- **Sisi "yang didefinisikan"**: state `sessions` yang sedang aktif di form
  (`FeedPlanCard.jsx`) — persis, sesi yang `enabled !== false` dengan
  `session_time` valid, diurutkan by waktu, dipotong maks 6 (SCHEDULE_COUNT),
  sama seperti algoritma yang backend pakai saat push ke device
  (`feed-plan.js` baris ~145-146) dan yang sudah dipakai `verifySync()`
  sekarang.
- **Sisi "alat"**: `GET /devices/:deviceId` (`getLeleDevice`, sudah ada) →
  pakai `live_data.schedules` (fallback ke `getSyncedSchedules()` / DB mirror
  `lele_device_schedules` bila `live_data.schedules` kosong — device lama
  yang belum pernah publish, jarang terjadi tapi dijaga) + `is_online` +
  `last_seen`/`live_data.timestamp` untuk freshness.

### Fungsi baru: `checkSyncNow()`

Mirip `verifySync()` yang sudah ada, TAPI:
- **Tanpa delay 2500ms** (tidak menunggu device memproses config baru —
  ini cuma membaca kondisi TERKINI, bukan menunggu efek dari aksi Simpan).
- **Dua arah**: selain mengecek tiap sesi rencana punya slot device yang
  cocok (jam+enabled), juga cek terbalik — ada slot di device yang ENABLED
  tapi index-nya di luar jumlah sesi aktif rencana (sisa edit manual lama
  yang tidak lagi terdaftar di rencana).
- **Freshness eksplisit**: bila `is_online === false`, hasil ditandai
  sebagai TIDAK BISA DIPASTIKAN (bukan menampilkan hasil bandingan dari data
  basi seolah masih berlaku), sambil tetap menunjukkan data terakhir yang
  ada + kapan itu.

Kedua fungsi (`verifySync()` pasca-Simpan dan `checkSyncNow()` manual)
berbagi satu helper pembanding `compareSchedules(sessions, deviceSchedules)`
supaya logika pencocokan tidak terduplikasi/berisiko drift antara keduanya.

### UI

- Tombol baru "🔍 Cek ke Alat Sekarang" di baris tombol yang sama dengan
  "Simpan Rencana", disabled saat `device` offline (dengan tooltip
  menjelaskan kenapa) atau sedang proses cek.
- Panel hasil (mirip panel `verify` yang sudah ada, dipakai bersama):
  - Baris freshness: `✓ Alat online, data 2 detik lalu` atau
    `⚠️ Alat OFFLINE — data terakhir 14 menit lalu, tidak bisa dipastikan konsisten sekarang`.
  - Badge ringkasan: `✓ Semua N sesi cocok dengan alat` atau
    `⚠️ N dari M sesi tidak cocok` (+ bila ada slot ekstra di alat:
    `⚠️ Ada 1 jadwal aktif di alat yang tidak terdaftar di Rencana Pakan`).
  - Tabel detail per sesi: Sesi | Jam Rencana | Jam di Alat | Status
    (✓ cocok / ⚠️ tidak cocok / — tidak ditemukan di alat).

### Testing / verifikasi manual

Tidak ada test suite otomatis di project ini. Verifikasi lewat `npm run build`
lalu manual di browser: buka Rencana Pakan Harian kolam yang punya feeder
online, klik "Cek ke Alat Sekarang" → hasil match. Lalu, sengaja edit jam
salah satu sesi di form TANPA klik Simpan, klik "Cek ke Alat Sekarang" lagi →
harus terdeteksi tidak cocok (karena form belum disimpan, device masih pakai
jam lama). Simpan, lalu cek lagi → harus cocok. Uji juga saat device
offline (matikan sebentar/cabut) → harus tampil peringatan offline, bukan
hasil seolah cocok/tidak cocok dari data basi.
