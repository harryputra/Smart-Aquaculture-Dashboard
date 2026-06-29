# 👁️ Panduan Pengamat

Pengamat = pemantau **hanya-lihat (read-only)**. Cocok untuk pemilik modal,
penyuluh, mitra, atau pengawas yang perlu memantau tanpa mengubah apa pun.
Anda melihat seluruh data UMKM Anda, **tetapi tidak bisa mengontrol/mengubah/menghapus**.

---

## Yang bisa Anda lihat
- **Dashboard**: ringkasan semua kolam, status, dan peringatan.
- **Peternakan → (kolam)**:
  - **Operasional**: nilai sensor live (suhu, DO, pH, kekeruhan, kedalaman) + status ambang.
  - **Budidaya**: Siklus (SR/FCR/profit), Biomassa & kurva pertumbuhan, Kematian,
    **Keuangan** (biaya, proyeksi profit/ROI), Logbook.
- **Notifikasi**: daftar peringatan & kejadian.
- **Grafana Analytics**: grafik tren historis sensor.
- **Pakan Lele / Perangkat / Firmware**: dapat melihat status & versi (tanpa tombol aksi).

## Yang TIDAK bisa Anda lakukan
- ❌ Memberi pakan / mengontrol hardware / menjalankan uji / STOP.
- ❌ Menambah/mengubah/menghapus kolam, siklus, biomassa, keuangan, jadwal, ambang.
- ❌ Mengelola pengguna, perangkat, firmware, atau notifikasi WhatsApp.

Bila Anda menekan aksi yang tidak diizinkan, sistem menolak dengan pesan
"hanya bisa melihat (read-only)". Ini normal sesuai peran Anda.

## Cara membaca data penting
- **Severity peringatan**: **Kritis** (merah) = bahaya nyata (mis. DO rendah →
  risiko ikan mati); **Peringatan** (kuning) = perlu perhatian; **Info** = sekadar kabar.
- **SR (Survival Rate)**: persentase ikan hidup — makin tinggi makin baik.
- **FCR (Feed Conversion Ratio)**: kg pakan per kg bobot ikan — makin **rendah**
  makin efisien.
- **Pertumbuhan**: kurva bobot rata-rata dari sampling biomassa.

## Tips
- Mau ikut dapat peringatan di HP? Minta **Pemilik** menambahkan **nomor WhatsApp**
  Anda di menu Notifikasi WA (cakupan bisa per-kolam atau seluruh UMKM).
- Untuk laporan, gunakan tampilan **Keuangan** per siklus & **Grafana** untuk tren.
