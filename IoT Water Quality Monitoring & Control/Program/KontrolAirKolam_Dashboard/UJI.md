# ✅ Checklist Uji — KontrolAirKolam_Dashboard (ESP32)

Menguji perangkat kualitas air dari nol sampai termonitor & terkontrol di dashboard.
Ikuti urut. **SM** = Serial Monitor Arduino IDE (115200).

---

## 0. Prasyarat
- [ ] Dashboard sudah jalan (`https://aquaculture.trin-polman.id/api/health` OK).
- [ ] Arduino IDE: board **ESP32 Dev Module** + library **WebSockets (Links2004)**
      & **MQTTPubSubClient (hideakitai)** terpasang.
- [ ] Sudah punya **kolam** di dashboard (Peternakan → Tambah Kolam). Catat
      **farm_id** & **pond_id**-nya.

## 1. Cek potensiometer dulu (opsional, tanpa jaringan)
Gunakan sketch bawaan mahasiswa untuk memastikan wiring ADC benar:
- [ ] Upload `Program/Cek_Potensio_Mapping/Cek_Potensio_Mapping.ino` (sesuaikan pin
      ESP32 bila perlu) → putar tiap potensio, nilai berubah wajar di SM.
- [ ] (Bila skip) langsung ke Langkah 2.

## 2. Konfigurasi `Parameter.h`
- [ ] `WIFI_SSID` / `WIFI_PASSWORD` diisi.
- [ ] `FARM_ID` & `POND_ID` diisi **persis** seperti di dashboard.
- [ ] `MQTT_SERVER` = `mqtt.trin-polman.id` (biarkan; sama dgn feeder lele).

## 3. Wiring (ESP32)
- [ ] 5 potensio → GPIO **34(pH), 35(keruh), 32(DO), 33(suhu), 36(level)**;
      kaki luar ke **3V3 & GND**, tengah ke pin.
- [ ] Tombol **25(kuras), 26(isi)** ke GND.
- [ ] Relay **16(kuras), 17(isi)** — Active-LOW.

## 4. Upload & koneksi
- [ ] Upload. Buka **SM 115200**.
- [ ] Muncul: `[WiFi] OK: <ip>` → `[MQTT] Menyambung...` → `[MQTT] Terhubung. Subscribe: aquaculture/<farm>/<pond>/control`.
- [ ] Bila `[WiFi] GAGAL`: cek SSID/password; ESP32 hanya WiFi 2.4 GHz.

## 5. Data masuk ke dashboard
- [ ] Buka dashboard → kolam terkait. Dalam ±5 detik, kolam berubah ke mode
      **ESP32** (indikator "ESP32", bukan "Dummy").
- [ ] Nilai **Suhu / DO / Kekeruhan / pH / Kedalaman** tampil live.

Verifikasi via server (opsional):
```bash
./run.sh mqtt-sub    # cari topik aquaculture/<farm>/<pond>/sensors
docker compose exec postgres psql -U aquaculture aquaculture \
  -c "SELECT temperature,depth,dissolved_oxygen,turbidity,ph,created_at FROM sensor_data WHERE pond_id='<POND_ID>' ORDER BY created_at DESC LIMIT 3;"
```

## 6. Uji tiap sensor (putar potensio)
- [ ] Putar potensio **pH** → nilai pH di dashboard ikut berubah.
- [ ] Ulangi untuk **kekeruhan, DO, suhu, level/kedalaman**.
- [ ] Nilai wajar dalam rentang (pH 0–14, keruh 0–100, DO 0–20, suhu 0–40, level 0–100).

## 7. Uji ambang & notifikasi
- [ ] Di dashboard, lihat/atur **ambang** kolam (Pengaturan). 
- [ ] Putar potensio **DO** ke **bawah `do_min`** → muncul **notifikasi kritis**
      "Oksigen Terlarut Rendah".
- [ ] Bila **auto-drain** aktif untuk kolam itu, dashboard otomatis mengirim
      `open_valve` → **relay kuras menyala** (lihat SM `[CTRL] ...` + `[VALVE] Kuras:ON`).

## 8. Uji kontrol dari dashboard (mode MANUAL)
- [ ] Pastikan device di mode MANUAL (default; atau ketik `M` di SM).
- [ ] Di detail kolam (Operasional), tekan kontrol **buka kuras / isi**.
- [ ] SM: `[CTRL] {"command":"open_valve"...}` → `[VALVE] Kuras:ON`. Relay bergerak.
- [ ] Tutup → relay mati. Uji juga **isi** (`open_inlet`/`close_inlet`).
- [ ] Tombol fisik tetap berfungsi (tekan = jog manual).

## 9. Uji mode Otomatis lokal (mandiri)
- [ ] Ketik `A` di SM (atau kirim `{"command":"set_mode","mode":"auto"}`).
- [ ] Putar salah satu sensor keluar rentang ideal (mis. DO ≤ 3 / pH > 8.5 /
      keruh ≥ 50 / suhu > 32) → SM: `[AUTO] Kualitas air di luar batas → mulai KURAS`.
- [ ] Putar **level** turun ≤ 30 → pindah **ISI**; naik ≥ 80 → **SELESAI**.
- [ ] Ketik `M` untuk kembali manual.

## 10. Troubleshooting
| Gejala | Solusi |
|---|---|
| `[WiFi] GAGAL` terus | SSID/pass salah, atau WiFi 5 GHz (ESP32 perlu 2.4 GHz) |
| WiFi OK tapi MQTT tak terhubung | `MQTT_SERVER` salah / Cloudflare belum route ke mosquitto (sama seperti feeder lele) |
| Data tak muncul di kolam | `FARM_ID`/`POND_ID` tidak sama dgn dashboard; cek `./run.sh mqtt-sub` |
| Nilai sensor "mentok" 0 atau max | potensio salah pin / pakai pin ADC2 (bentrok WiFi) → pindah ke ADC1 (32–36) |
| Relay kebalik (ON saat harusnya OFF) | modul relay Active-HIGH → balik logika di `Manual.ino`/`Otomatis.ino` |
| Perintah dashboard tak jalan | device sedang mode AUTO → set MANUAL (`M`) agar menuruti perintah remote |

## 11. Selesai
- [ ] Data 5 parameter live di dashboard ✔
- [ ] Kontrol kuras/isi dari dashboard bekerja ✔
- [ ] Mode auto lokal bekerja ✔

> Saat sensor asli sudah siap, ganti isi `bacaSemuaSensor()` (di `Otomatis.ino`)
> dengan pembacaan sensor nyata — alur MQTT & kontrol tidak berubah.
