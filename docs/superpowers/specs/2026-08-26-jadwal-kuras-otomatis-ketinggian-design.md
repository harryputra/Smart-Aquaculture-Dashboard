# Jadwal Kuras Otomatis Berbasis Ketinggian

Status: Disetujui user, siap masuk implementation plan.
Tanggal: 2026-08-26

## Latar belakang

Tab **Jadwal Pengurasan** (`frontend/src/components/ScheduleTab.jsx`, modal
"Tambah Jadwal Kuras") saat ini hanya punya satu mode: buka katup kuras di jam
tertentu, dengan field "Durasi (menit)" yang **secara diam-diam tidak pernah
dipakai** — cron backend (`backend/server.js`, `cron.schedule('* * * * *')`)
cuma publish `open_valve` sekali dan menyimpan `duration` di payload MQTT,
tapi firmware V6P (`Koneksi.ino`) mengabaikan field itu sepenuhnya (cuma
switch on/off relay berdasar `command`), dan backend juga tidak memasang
timer apa pun untuk menutupnya. Akibatnya katup kuras terjadwal **terbuka
terus sampai ada yang menutup manual** lewat tab Kontrol Air.

Precedent yang sudah ada dan teruji: fitur Kontrol Air (lihat
`2026-08-19-kontrol-air-auto-stop-design.md`) sudah punya mekanisme
`valveAutoStop`/`computeAutoStopPlan`/`checkValveAutoStop`/`forceCloseValve`
di backend untuk auto-stop katup berdasar durasi/target ketinggian/persentase
perubahan — tapi didesain untuk **kontrol manual satu-kali** (dipicu user
menekan "Buka Katup"), bukan jadwal berulang.

User ingin: jadwal kuras harian yang menguras kolam sampai ketinggian
tertentu (mis. 40cm), lalu otomatis lanjut mengisi ulang sampai ketinggian
tertentu (mis. 50cm), berulang tiap hari sesuai hari yang dipilih — tanpa
perlu ada orang yang memantau/menutup katup secara manual.

## Tujuan

1. Tambah mode baru **"Berdasarkan Ketinggian"** di form Tambah Jadwal Kuras,
   berdampingan dengan mode **"Durasi Tetap"** yang sudah ada (pilihan
   per-jadwal, bukan pengganti total).
2. Mode Ketinggian: user set dua nilai tetap — target ketinggian setelah
   kuras (`drain_target_cm`) dan target ketinggian setelah isi ulang
   (`refill_target_cm`) — dipakai sama persis tiap kali jadwal itu jalan.
3. Eksekusi otomatis saat jadwal tiba: buka katup kuras → tutup otomatis saat
   `depth` sensor turun sampai `drain_target_cm` → langsung buka katup isi →
   tutup otomatis saat `depth` naik sampai `refill_target_cm`.
4. Batas waktu pengaman **per-tahap yang bisa diatur** (`safety_cap_minutes`,
   default 30 menit) — beda dari batas keras 15 menit di kontrol manual,
   karena ini siklus tanpa pengawasan yang perlu waktu cukup untuk kolam
   nyata (durasi default yang sudah ada sekarang saja 30 menit).
5. Kalau sensor ketinggian mati/data basi (>30 detik, threshold sama seperti
   deteksi device offline yang sudah ada) saat jadwal harusnya jalan →
   **batalkan siklus hari itu, JANGAN buka katup, kirim notifikasi**. Tidak
   pernah membuka katup tanpa cara mengontrolnya berhenti.
6. Kalau satu tahap kena batas pengaman (target tak tercapai) → **hentikan
   seluruh siklus di situ, JANGAN lanjut ke tahap berikutnya**, kirim
   notifikasi peringatan agar dicek manual (katup/sensor kemungkinan
   bermasalah).
7. Sekalian perbaiki bug lama: mode "Durasi Tetap" sekarang benar-benar
   menutup katup otomatis setelah `duration_minutes` habis (pakai nilai asli
   yang di-set user, tanpa dipotong ke 15 menit — beda konteks dari kontrol
   manual sekali klik).
8. Sekalian perbaiki gap otorisasi: endpoint `/api/schedules` (GET/POST/
   DELETE) saat ini tidak memverifikasi kepemilikan organisasi pond sama
   sekali — user org manapun bisa lihat/buat/hapus jadwal kuras pond org
   lain.

## Yang SENGAJA di luar scope

- **Tidak ada perubahan firmware/OTA** — device tetap hanya menerima
  `open_valve`/`close_valve`/`open_inlet`/`close_inlet`, semua logika timing
  ada di backend, mengikuti pola yang sudah ada.
- **Tidak ada fitur edit jadwal** — tetap cuma tambah/hapus, sama seperti
  form yang sudah ada sekarang.
- **Gap otorisasi `/api/feeding-schedules`** (pola serupa, ditemukan saat
  eksplorasi) TIDAK diperbaiki di pekerjaan ini — di luar cakupan fitur
  kuras, dicatat sebagai temuan terpisah untuk ditindaklanjuti nanti.
- **Tidak ada konfirmasi fisik posisi katup dari hardware** — sama seperti
  fitur Kontrol Air, device tidak melapor balik status relay.
- Karena bergantung pada backend tetap hidup (state `valveAutoStop` di
  memori), kalau server restart di tengah siklus terjadwal, timer/pemantauan
  ikut hilang — bukan risiko baru, karakteristik arsitektur yang sudah ada
  sejak fitur Kontrol Air.

## Desain

### 1. Database: migrasi `drain_schedules`

Kolom baru (idempotent, pola sama seperti migrasi RTC sebelumnya):

```sql
ALTER TABLE drain_schedules ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'duration';
ALTER TABLE drain_schedules ADD COLUMN drain_target_cm NUMERIC(6,2);
ALTER TABLE drain_schedules ADD COLUMN refill_target_cm NUMERIC(6,2);
ALTER TABLE drain_schedules ADD COLUMN safety_cap_minutes INTEGER DEFAULT 30;
```

Jadwal lama otomatis `mode='duration'` (perilaku sama seperti sekarang,
minus bug-nya).

### 2. Backend: `backend/server.js`

**Perluasan generik pada watch `valveAutoStop`** (state yang sama, tidak
dibuat mekanisme baru): tambah field opsional `onClosed` — callback async
`(reasonCode) => void`, dipanggil di `forceCloseValve` setelah katup ditutup
& `control_logs` tercatat:

```js
if (watch.onClosed) {
  await watch.onClosed(reasonCode).catch(err => console.error('valve onClosed hook failed:', err.message));
}
```

Watch dari kontrol manual (Kontrol Air) tidak pernah set `onClosed` →
`if (watch.onClosed)` selalu `false` untuk semua path yang sudah ada
sekarang, jadi **tidak ada perubahan perilaku pada fitur Kontrol Air yang
sudah teruji**.

**Fungsi baru** `runScheduledDrainCycle(schedule)` dipanggil dari cron:

- Mode `'duration'`: publish `open_valve`, pasang watch:
  ```js
  {
    mode: 'duration', targetDepth: null,
    durationMinutes: schedule.duration_minutes,
    startedAt: new Date(),
    safetyTimer: setTimeout(() => forceCloseValve(pond_id, 'drain', 'duration')..., schedule.duration_minutes * 60000),
    durationTimer: null,
    onClosed: async () => { update last_executed }
  }
  ```
- Mode `'depth'`:
  1. Cek `latestData[pond_id]?.depth` ada & `timestamp` < 30 detik lalu. Kalau
     tidak → insert notifikasi risk "Jadwal Kuras Gagal Dijalankan", jangan
     publish apa pun, return.
  2. `clearValveWatch(pond_id,'drain')` & `clearValveWatch(pond_id,'inlet')`
     (defensif, jaga-jaga ada watch manual nyangkut).
  3. Publish `open_valve`, pasang watch drain:
     ```js
     {
       mode: 'depth_target', targetDepth: schedule.drain_target_cm,
       durationMinutes: null, startedAt: new Date(),
       safetyTimer: setTimeout(() => forceCloseValve(pond_id, 'drain', 'safety_cap')..., schedule.safety_cap_minutes * 60000),
       durationTimer: null,
       onClosed: async (reasonCode) => {
         if (reasonCode !== 'depth_reached') { /* notifikasi abort, update last_executed, STOP */ return; }
         // tahap kuras sukses -> lanjut isi ulang
         publish open_inlet
         valveAutoStop[`${pond_id}:inlet`] = { ...watch serupa, targetDepth: refill_target_cm, onClosed: async (reasonCode2) => {
           if (reasonCode2 !== 'depth_reached') { /* notifikasi abort isi */ }
           else { /* notifikasi sukses siklus selesai */ }
           update last_executed
         }}
       }
     }
     ```
  4. `checkValveAutoStop` (sudah ada, dipanggil tiap sensor `depth` masuk)
     otomatis menangani perbandingan `depth <= targetDepth` (drain) /
     `depth >= targetDepth` (inlet) TANPA perubahan — watch baru ini cuma
     memakai field yang sudah dikenali fungsi itu.

**Cron** (`cron.schedule('* * * * *')` yang sudah ada): setelah match
`schedule_time` & hari, panggil `runScheduledDrainCycle(s)` alih-alih publish
langsung seperti sekarang.

**Notifikasi baru** (tabel `notifications`, kategori `system`):
- Sensor tak tersedia → risk, "🚱 Jadwal Kuras Gagal Dijalankan"
- Tahap kuras sukses, lanjut isi → info, "🚰 Kuras Terjadwal: Target Tercapai"
- Siklus penuh selesai → success, "✅ Siklus Kuras Terjadwal Selesai"
- Tahap manapun kena safety cap → risk, "⚠️ Kuras/Isi Ulang Terjadwal Terhenti (Batas Waktu)"

**Perbaikan otorisasi** `/api/schedules`:
- `GET`: kalau `pond_id` diberikan, verifikasi pond milik org user (pola
  sama seperti fix `/api/feeding-logs` sebelumnya) sebelum query; kalau tidak
  diberikan & bukan superadmin, filter ke pond milik org user saja (bukan
  balikan semua pond semua org).
- `POST`: verifikasi `pond_id` di body milik org user sebelum insert. Validasi
  server-side: `mode` harus `'duration'`/`'depth'`; mode `depth` wajib
  `drain_target_cm < refill_target_cm`, keduanya angka positif,
  `safety_cap_minutes` antara 1–120.
- `DELETE /:id`: lookup dulu `pond_id` milik jadwal itu, verifikasi org sebelum
  hapus (pola `ensureOwnerOrAdmin`-style sesuai baseline keamanan).

### 3. Frontend: `frontend/src/components/ScheduleTab.jsx`

- Toggle mode di modal (dua tombol/segmented): "Durasi Tetap" | "Berdasarkan
  Ketinggian".
- Mode Durasi: form persis seperti sekarang (Waktu, Durasi menit, Hari).
- Mode Ketinggian: field Durasi diganti 3 input — "Kuras sampai (cm)",
  "Isi ulang sampai (cm)", "Batas waktu maks/tahap (menit)" (default 30).
  Field Waktu & Hari tetap sama untuk kedua mode.
- Validasi client-side ringan: kedua target harus terisi & `drain < refill`
  sebelum submit (selain validasi server yang jadi sumber kebenaran).
- Tabel daftar jadwal: kolom "Durasi" diganti jadi ringkasan sesuai mode,
  mis. `Ketinggian: 40cm → 50cm (maks 30 mnt/tahap)` vs `Durasi: 30 menit`.

### 4. Testing / verifikasi manual

- Jadwal mode ketinggian dengan sensor aktif: pantau `depth` turun sampai
  target, pastikan `close_valve` lalu `open_inlet` terkirim otomatis
  berurutan, `depth` naik sampai target isi, `close_inlet` terkirim,
  notifikasi sukses muncul.
- Jadwal mode ketinggian dengan sensor mati (`latestData` kosong/basi) saat
  jam jadwal tiba: pastikan TIDAK ada `open_valve` terkirim, notifikasi gagal
  muncul.
- Jadwal mode ketinggian dengan target mustahil (mis. 0cm): pastikan katup
  ditutup paksa di menit ke-`safety_cap_minutes` dengan notifikasi abort, dan
  siklus TIDAK lanjut ke isi ulang.
- Jadwal mode durasi (lama & baru): pastikan katup benar-benar tertutup
  otomatis setelah `duration_minutes` — verifikasi bug lama sudah tidak ada.
- Endpoint `/api/schedules`: coba akses pond org lain (GET dengan pond_id
  asing, POST dengan pond_id asing, DELETE id milik org lain) dari akun
  non-superadmin → harus ditolak (404/403), bukan sukses.
