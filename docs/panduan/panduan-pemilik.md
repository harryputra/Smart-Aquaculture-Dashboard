# 🧑‍💼 Panduan Pemilik

Pemilik = pemilik usaha budidaya **satu UMKM**. Anda mengelola **peternakan, kolam,
perangkat, budidaya, keuangan, pengguna, dan penerima notifikasi** di organisasi Anda.
Anda hanya melihat data UMKM Anda sendiri.

---

## 1. Menata peternakan & kolam
Menu **Peternakan**.
1. **Tambah Peternakan** → nama, lokasi, pemilik, deskripsi.
2. Buka peternakan → **Tambah Kolam**: nama, jenis ikan, populasi, luas, kedalaman.
3. Saat membuat kolam, opsi **Hubungkan Perangkat** (jika feeder sudah online &
   belum di-assign) → kolam langsung terhubung ke hardware.

## 2. Menghubungkan hardware (feeder)
Menu **Perangkat**.
1. Nyalakan feeder ESP32 (sudah set WiFi). Ia muncul otomatis sebagai
   **belum di-assign** (ID otomatis dari chip, mis. `lele_a1b2c3`).
2. Beri **nama** + pilih **kolam** → **Simpan**. Bisa **pindah**/**lepaskan** kapan saja.
3. Tip: saat flash tiap unit, catat Device ID dari Serial Monitor & tempel stiker
   agar tahu unit fisik mana untuk kolam mana.

## 3. Operasional kolam (buka detail kolam)
Menu **Peternakan → (pilih kolam)**. Ada dua kelompok:

### Budidaya
- **Siklus**: mulai siklus (tebar), catat tanggal & jumlah tebar, stok pakan awal;
  **panen** untuk menutup siklus → otomatis hitung SR, FCR, biaya, profit, ROI.
- **Biomassa**: catat sampling bobot ikan (manual atau dari alat) → kurva
  pertumbuhan + saran feeding rate.
- **Kematian**: catat kematian harian (SR terjaga akurat).
- **Keuangan**: biaya (pakan, benih, listrik, dll), harga jual, proyeksi profit/ROI.
- **Logbook**: catatan harian bebas.

### Operasional
- Monitoring sensor (suhu, DO, pH, kekeruhan, kedalaman) + status ambang.
- Kontrol air (kuras/isi) bila tersedia.
- Pengaturan **ambang (threshold)** sensor & **auto-drain**.

## 4. Pakan otomatis (feeder lele)
Menu **Hardware → Pakan Lele** → pilih perangkat.
- **Mode pakan**: **Manual** (perintah sekarang), **Jadwal** (jam tertentu),
  **Auto** (mengikuti biomassa). Atur dari dashboard.
- **Jadwal**: atur jam & jumlah pemberian/hari (tersinkron ke perangkat).
- **Monitoring penimbangan live** saat pakan ditakar.
- **Setelan sebar**: kecepatan & arah putar penampang; mode buka pintu (instan/bertahap).

## 5. Uji hardware (commissioning)
Menu **Hardware → Uji Hardware**. Uji tiap fungsi sebelum dipakai produktif:
trapdoor servo, spinner (pelan/kencang × kanan/kiri), auger, timbangan, konektivitas.
Tandai **✓ Berfungsi / ✗ Bermasalah** → tersimpan sebagai laporan. **STOP DARURAT**
menghentikan semua aktuator.

## 6. Update firmware (OTA)
Menu **Hardware → Firmware (OTA)**. (Detail & uji: [UJI-OTA.md](../UJI-OTA.md))
1. **Unggah** file `.bin` (versi baru) — sha256 dihitung otomatis.
2. Pilih **Target** versi → **Rollout Canary**: sistem update 1 unit dulu, bila
   sehat **otomatis sebar** ke sisanya. Atau **Update** per-unit.
3. Pantau **progress** & **Riwayat OTA**. (Prasyarat: tiap ESP32 sudah di-flash
   sekali dengan partisi dual-OTA — lihat panduan teknis.)

## 7. Notifikasi WhatsApp (atur penerima)
Menu **Administrasi → Notifikasi WA**.
1. **Tambah Penerima**: nama, **nomor WA** (`08…`/`62…`).
2. **Cakupan**: **Semua kolam (UMKM)** / **Per peternakan** / **Per kolam** — fleksibel.
3. Pilih **event**: Sensor kritis, Device offline, Feeding, Stok pakan.
4. **Minimal severity**: Semua / Peringatan & Kritis / Hanya Kritis.
5. **Kirim UJI** untuk memastikan nomor menerima. Lihat **Riwayat Pengiriman**.

> Gateway WhatsApp (kredensial Meta) disiapkan oleh Super Admin. Jika tombol uji
> bilang "gateway belum aktif", hubungi Super Admin.

## 8. Kelola pengguna UMKM Anda
Menu **Administrasi → Pengguna**.
- **Tambah Pengguna**: peran **Pekerja** (operator) / **Pengamat** (lihat saja) /
  **Pemilik**. Mereka otomatis masuk organisasi Anda.
- Edit (reset password, aktif/nonaktif) atau hapus. Tak bisa mengubah akun sendiri.

---

## Hak akses Pemilik (ringkas)
- ✅ Semua operasional, budidaya, **keuangan**, pengaturan di **UMKM Anda**.
- ✅ Kelola pengguna org Anda, penerima WhatsApp, firmware/OTA.
- ✅ **Hapus** kolam/siklus/perangkat (hati-hati, permanen).
- ❌ Tak melihat UMKM lain; tak mengatur gateway WhatsApp global (Super Admin).
