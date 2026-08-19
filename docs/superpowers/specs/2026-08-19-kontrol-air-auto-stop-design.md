# Kontrol Air: Info Ketinggian Air + Auto-Stop Katup

Status: Disetujui user, siap masuk implementation plan.
Tanggal: 2026-08-19

## Latar belakang

Tab **Kontrol Air** (`frontend/src/components/ControlTab.jsx`, dipakai di Detail
Kolam → tab Monitor/Kontrol Air) saat ini hanya punya kontrol manual murni:
tombol "Buka Katup"/"Tutup Katup" untuk katup Pengurasan dan Pengisian, yang
langsung publish perintah MQTT (`open_valve`/`close_valve`/`open_inlet`/
`close_inlet`) tanpa ada mekanisme berhenti otomatis. Status TERBUKA/TERTUTUP
di kartu juga murni **state React lokal** (`useState(false)`) — bukan dibaca
dari server, sehingga reset ke "TERTUTUP" tiap kali halaman di-refresh,
terlepas dari kondisi katup fisik yang sebenarnya.

Ketinggian air (`depth`, cm) sudah dikirim device tiap ~3 detik dan sudah
tersimpan di `sensor_data`, tapi baru ditampilkan di kartu "Status Sensor
Saat Ini" di bagian bawah tab — tidak terlihat langsung di dekat tombol katup
saat user mengambil keputusan buka/tutup.

Precedent yang sudah ada: fitur "Siklus Otomatis Drain+Refill"
(`triggerAutoDrainCycle` di `backend/server.js`) sudah memakai pola
**timer di backend** (`setTimeout`, bukan logika di firmware) untuk kuras 30
detik lalu isi 60 detik otomatis. Auto-drain berbasis ambang (`depth_min`,
`temp_max`, dst di tabel `sensor_thresholds`) juga sudah reaktif terhadap
data sensor masuk (`checkSensorRisks`, dipanggil tiap kali `sensors` MQTT
message diterima).

## Tujuan

1. Tampilkan ketinggian air secara live & mencolok di tab Kontrol Air, dekat
   kontrol katup — bukan cuma di kartu sensor generik di bawah.
2. Untuk tiap katup (Pengurasan & Pengisian), sediakan opsi auto-stop saat
   user menekan "Buka Katup":
   - **Manual** (default, perilaku sekarang — tak ada auto-stop)
   - **Durasi**: tutup otomatis setelah N menit
   - **Target ketinggian**: tutup otomatis saat `depth` mencapai nilai cm
     tertentu
   - **Persentase perubahan**: tutup otomatis saat `depth` berubah X% dari
     level SAAT tombol ditekan (kuras = turun X%, isi = naik X%)
3. Semua mode auto-stop punya **batas waktu pengaman keras 15 menit** —
   kalau kondisi target tak pernah tercapai (mis. sensor mati/lag), katup
   tetap ditutup paksa di menit ke-15, tidak pernah nyangkut terbuka
   selamanya.
4. Status badge katup menunjukkan alasan penutupan otomatis (mis. "Ditutup
   otomatis: target 48cm tercapai"), bukan cuma TERBUKA/TERTUTUP polos.

## Yang SENGAJA di luar scope (didokumentasikan, bukan alasan menunda)

- **Tidak ada perubahan firmware/OTA.** Device tetap hanya menerima
  `open_valve`/`close_valve`/`open_inlet`/`close_inlet` seperti sekarang;
  semua logika timing/pemantauan ada di backend Node.js (dashboard side),
  mengikuti pola `triggerAutoDrainCycle` yang sudah ada & teruji.
- **Tidak ada konfirmasi fisik posisi katup dari hardware** — device tidak
  melapor balik status relay-nya (sudah begitu sejak awal). Fitur ini
  membuat status yang DIPERINTAHKAN + alasannya terlihat jelas, level
  kepercayaan sama seperti kontrol manual yang sudah ada, tidak lebih rendah
  ataupun lebih tinggi.
- Konfigurasi auto-stop **tidak disimpan/dipersist** — dipilih ulang tiap
  kali sebelum menekan "Buka Katup" (state UI sementara, bukan setting per
  kolam yang tersimpan di DB). Ini kontrol satu-kali, bukan jadwal berulang.
- Karena bergantung pada backend tetap hidup (sama seperti Siklus Otomatis
  yang sudah ada), kalau server restart di tengah auto-stop, timer/pemantauan
  ikut hilang — bukan risiko baru, sudah jadi karakteristik arsitektur
  sistem ini sejak awal.

## Desain

### 1. Backend: `backend/server.js`

**State in-memory baru** (pola sama seperti `drainStates` yang sudah ada):
```js
// key: `${pond_id}:${valveKind}` (valveKind = 'drain' | 'inlet')
const valveAutoStop = {};
// value: {
//   mode: 'duration' | 'depth_target' | 'depth_percent',
//   targetDepth: number | null,   // cm, null utk mode duration
//   startDepth: number | null,    // cm, dicatat saat mode depth_percent diaktifkan
//   startedAt: Date,
//   safetyTimer: NodeJS.Timeout,  // selalu ada, batas 15 menit
//   durationTimer: NodeJS.Timeout | null,  // hanya utk mode duration
// }
```

**Endpoint yang diubah**: `POST /api/control/:pondId/valve`
- Body baru (opsional, hanya relevan saat `command` adalah `open_valve` atau
  `open_inlet`): `{ command, source, auto_stop: { mode, value } }`
  - `mode: 'duration'` → `value` = menit (di-clamp ke maks 15).
  - `mode: 'depth_target'` → `value` = target cm absolut.
  - `mode: 'depth_percent'` → `value` = persen (0-100); target dihitung dari
    `depth` terbaru di `latestData[pond_id]` saat request masuk:
    - drain: `target = startDepth * (1 - value/100)`
    - inlet: `target = startDepth * (1 + value/100)`
  - Tanpa `auto_stop` atau `mode` tak dikenali → perilaku persis seperti
    sekarang (murni manual, tanpa timer).
- Setelah publish command `open_valve`/`open_inlet` seperti biasa:
  1. Bersihkan watch lama utk valve itu jika ada (`clearTimeout` timer lama).
  2. Simpan `valveAutoStop[key]` sesuai mode.
  3. Selalu pasang `safetyTimer` 15 menit → memanggil `forceCloseValve(pond_id, valveKind, 'safety_cap')`.
  4. Kalau mode `duration` → pasang `durationTimer` tambahan di menit yang
     diminta (≤15) → `forceCloseValve(pond_id, valveKind, 'duration')`.
  5. Log ke `control_logs` dengan `reason` yang menyebutkan mode & nilai
     (mis. `"Auto-stop: target ketinggian 48cm"`).
- `close_valve`/`close_inlet` manual (user menutup sendiri sebelum auto-stop
  kena) → hapus watch yang sedang aktif utk valve itu (`clearTimeout` semua
  timer terkait), supaya tak ada double-close atau closure "hantu" belakangan.

**Hook baru di `saveSensorData`/handler `sensors`** (dekat pemanggilan
`checkSensorRisks`, di `mqttClient.on('message', ...)`):
```js
await checkValveAutoStop(pond_id, payload.depth);
```
`checkValveAutoStop(pond_id, currentDepth)`:
- Untuk tiap watch aktif milik `pond_id` bermode `depth_target`/`depth_percent`:
  - drain: kalau `currentDepth <= targetDepth` → `forceCloseValve(..., 'depth_reached')`
  - inlet: kalau `currentDepth >= targetDepth` → `forceCloseValve(..., 'depth_reached')`

**`forceCloseValve(pond_id, valveKind, reasonCode)`**:
- Publish `close_valve`/`close_inlet` via MQTT (source: `'auto'`).
- `clearTimeout` semua timer watch itu, hapus dari `valveAutoStop`.
- Insert `control_logs` dengan `reason` deskriptif per `reasonCode`:
  - `depth_reached` → `"Auto-stop: ketinggian target Xcm tercapai"`
  - `duration` → `"Auto-stop: durasi N menit habis"`
  - `safety_cap` → `"Auto-stop: batas pengaman 15 menit tercapai (kondisi target tak tercapai)"`

**Endpoint baru (read)**: `GET /api/control/:pondId/valve-status`
- Balas kondisi TERKINI tiap valve, diturunkan dari `control_logs` (baris
  terakhir per action-pair) + `valveAutoStop` in-memory kalau sedang aktif:
```json
{
  "drain":  { "open": false, "reason": "Auto-stop: ketinggian target 48cm tercapai", "since": "..." , "auto_stop_active": false },
  "inlet":  { "open": true,  "reason": "Dibuka manual", "since": "...", "auto_stop_active": true, "auto_stop_mode": "depth_target", "auto_stop_target": 72 }
}
```
Dipakai `ControlTab.jsx` gantikan `useState(false)` lokal, supaya status
valid lintas refresh & auto-close dari server ikut terlihat.

### 2. Frontend: `frontend/src/components/ControlTab.jsx`

- **Banner ketinggian air**: satu blok ringkas di atas 2 kartu katup,
  menampilkan `latest.depth` cm besar + label "Ketinggian Air Saat Ini"
  (dipakai bersama, karena relevan utk kedua katup).
- **Panel auto-stop per kartu** (di atas tombol Buka/Tutup katup):
  - `<select>` mode: Manual / Durasi / Target Ketinggian / Persentase
    Perubahan.
  - Input angka yang muncul sesuai mode (menit / cm / %), dengan placeholder
    & keterangan singkat (mis. "maks 15 menit").
  - State ini murni lokal (tidak dikirim ke server sampai user menekan
    "Buka Katup" — dikirim sebagai bagian body request `open_valve`/`open_inlet`).
- **Ganti sumber status katup**: poll `GET /api/control/:pondId/valve-status`
  (bareng `onChange`/polling pond yang sudah ada), render badge dari situ,
  bukan `useState` lokal. Kalau `auto_stop_active`, tampilkan indikator kecil
  "Auto-stop aktif: <mode> <nilai>" di kartu selagi menunggu.
- Badge status: teks kecil di bawah TERBUKA/TERTUTUP menampilkan `reason`
  dari response terbaru.

### 3. Testing / verifikasi

- Test manual (dev/demo mode, MQTT dummy publisher kalau ada, atau device
  nyata): buka katup drain dengan mode `depth_percent` 10%, pantau `depth`
  turun via dummy data / device asli, pastikan `close_valve` terkirim &
  `control_logs` tercatat saat threshold kena.
- Test batas pengaman: set target ketinggian yang mustahil tercapai (mis.
  0cm padahal kondisi normal jauh di atas itu) → pastikan `close_valve`
  tetap terkirim otomatis di menit ke-15 dengan reason `safety_cap`.
- Test manual override: aktifkan auto-stop durasi 10 menit, lalu user tekan
  "Tutup Katup" manual di menit ke-2 → pastikan tidak ada `close_valve`
  ganda terkirim di menit ke-10 (timer harus ter-cancel).
- Test refresh halaman saat valve auto-stop sedang berjalan → badge harus
  tetap menunjukkan status benar (bukan reset ke default lokal).
