# Perbaikan Commissioning Test + Menu Test Aktuator LCD

Status: Disetujui user, siap masuk implementation plan.
Tanggal: 2026-09-01

## Latar belakang

Halaman dashboard "Uji Hardware" (`frontend/src/pages/HardwareTest.jsx`) sudah
lengkap sejak awal (5 kartu tes: Konektivitas, Servo Trapdoor, Spinner, Auger,
Timbangan) dan backend-nya (`backend/lele-integration.js`) sudah mengirim
command MQTT yang benar. Tapi firmware `pakan_lele_v3_9.ino` **tidak mengenali
satupun** dari 5 command ini (`ping`, `test_spread`, `test_servo`, `test_auger`,
`stop_all`) — hanya membalas "Unknown command". File backend ini masih
berjudul "Lele Feeder V3.2", sisa dari sebelum firmware naik ke v3.9;
command test-nya tidak ikut di-port.

## Tujuan

1. **Firmware**: implementasikan 5 command yang hilang, dengan interlock
   keamanan (ditolak kalau `feedingInProgress`), agar 5 tombol di halaman
   Uji Hardware benar-benar menggerakkan alat.
2. **Firmware — menu LCD baru "Test Aktuator"** (menu utama ke-9, ditambah di
   akhir daftar supaya index 0-7 yang sudah ada tidak berubah): 3 item — Test
   Servo, Test Spinner, Test Auger — memakai fungsi aktuator YANG SAMA dengan
   command MQTT (satu fungsi, dua pemicu, hindari logika ganda yang bisa beda
   perilaku antara LCD dan dashboard).
3. Tidak ada perubahan backend (endpoint & payload sudah benar).

## Desain teknis

- **Eksekusi async via `pendingCmd`** (pola yang sama dgn `tare`/
  `manual_feed_gram`): command MQTT masuk → validasi cepat (tolak kalau
  `feedingInProgress`) → set `pendingCmd.cmd` → `processPendingCommand()` di
  `loop()` yang benar-benar menjalankan aksi (blocking beberapa detik, TAPI
  dengan `maintainNetwork()` dipanggil tiap iterasi kecil supaya WiFi/MQTT
  tetap responsif — pola yang sama seperti fill-loop pemberian pakan).
- `PendingCommand` struct ditambah 2 field int (`intArg2`, `intArg3`) untuk
  menampung parameter tambahan (pwm, dir) tanpa mengubah command lain yang
  sudah pakai `floatArg`/`intArg`/`stringArg`.
- **STOP DARURAT (`stop_all`) dieksekusi LANGSUNG, TIDAK lewat antrian** —
  panggil `stopAllActuators()` seketika begitu command diterima (safety
  harus instan, tidak nunggu giliran), plus set flag `testStopRequested`
  supaya loop test yang sedang berjalan (kalau ada) ikut berhenti lebih awal
  alih-alih menunggu durasinya habis.
- **Test servo/spinner/auger** dibatasi otomatis (backend sudah clamp:
  spinner/spread maks 15 detik, auger maks 8 detik) dan bisa dibatalkan lebih
  awal via `backPressed()` (dari LCD) atau `testStopRequested` (dari MQTT
  stop_all/dashboard).
- **LCD**: menu baru mengikuti pola `handleTareMenu()` yang sudah ada persis
  (list 3 item, OK jalankan aksi, BACK kembali ke menu utama) — TANPA dialog
  konfirmasi tambahan (konsisten dengan menu Tare yang juga langsung jalan
  saat OK ditekan; motor jalan singkat, bukan aksi merusak data).
- Command `ping` dan `stop_all` dieksekusi instan (tidak lewat antrian, tidak
  butuh durasi).

## Yang SENGAJA di luar scope

- Tidak menambah test baru di dashboard — 5 yang sudah ada di
  `HardwareTest.jsx` cukup, tinggal firmware-nya yang dilengkapi.
- Tidak menyentuh masalah konektivitas alat yang tidak stabil (dibahas
  terpisah sebelumnya) — commissioning test ini independen dari itu.
- Tidak ada test Timbangan/Tare baru di menu LCD — sudah ada menu
  "Kalibrasi/Tare" sendiri, tidak diduplikasi.

## Deployment

Perubahan ini murni firmware — **butuh OTA** ke `pakan_lele_01` (dan device
lain yang memakai firmware sama) supaya aktif di alat nyata. Tidak dijalankan
otomatis oleh saya — build .bin + upload ke sistem OTA yang sudah ada adalah
langkah terpisah setelah kode ini siap, dan sebaiknya dipertimbangkan ulang
waktunya mengingat `pakan_lele_01` sedang punya masalah koneksi tidak stabil.

## Testing / verifikasi manual

Tidak ada test suite otomatis untuk firmware ini. Verifikasi:
1. Compile firmware di Arduino IDE/PlatformIO tanpa error.
2. Setelah OTA: coba tiap tombol di halaman Uji Hardware dashboard, pastikan
   aktuator benar-benar bergerak & ACK sukses masuk.
3. Coba tiap item menu "Test Aktuator" langsung dari LCD alat.
4. Uji interlock: coba jalankan test saat `feedingInProgress` true (mis. saat
   auto-feed sedang berjalan) → harus ditolak dengan pesan jelas, bukan
   dobel-jalan dengan proses feeding yang sedang berlangsung.
5. Uji STOP DARURAT dari dashboard saat salah satu test sedang berjalan →
   aktuator harus berhenti seketika, bukan menunggu durasi test habis.
