# 📚 Panduan Pengguna — Smart Aquaculture Dashboard

Panduan pemakaian dashboard untuk tiap peran. Pilih sesuai akun Anda:

| Peran | Untuk siapa | Panduan |
|---|---|---|
| 👑 **Super Admin** | Pengelola platform (lintas UMKM) | [panduan-superadmin.md](panduan-superadmin.md) |
| 🧑‍💼 **Pemilik** | Pemilik usaha budidaya (1 UMKM) | [panduan-pemilik.md](panduan-pemilik.md) |
| 👷 **Pekerja** | Operator harian kolam | [panduan-pekerja.md](panduan-pekerja.md) |
| 👁️ **Pengamat** | Pemantau (hanya lihat) | [panduan-pengamat.md](panduan-pengamat.md) |

## Masuk (Login)
1. Buka alamat dashboard (mis. `https://aquaculture.trin-polman.id`).
2. Masukkan **email** & **password** akun Anda → **Masuk**.
3. Lupa cara keluar? Tombol **Keluar** ada di pojok kiri-bawah (kartu nama Anda).

> **Quick-Login (mode demo):** bila admin mengaktifkannya, di halaman login muncul
> tombol cepat per peran untuk mencoba sistem tanpa mengetik password.

## Ringkasan hak akses
| Aksi | Super Admin | Pemilik | Pekerja | Pengamat |
|---|:---:|:---:|:---:|:---:|
| Lihat data (dashboard, sensor, grafik) | ✅ | ✅ | ✅ | ✅ |
| Operasional (pakan, sampling, kontrol hardware, uji) | ✅ | ✅ | ✅ | 👁️ |
| Pengaturan ambang/jadwal | ✅ | ✅ | ✅ | – |
| Keuangan & laporan ekonomi | ✅ | ✅ | ✅¹ | 👁️ |
| Hapus kolam/siklus/perangkat | ✅ | ✅ | – | – |
| Kelola pengguna | semua org | org sendiri | – | – |
| Kelola organisasi (UMKM) | ✅ | – | – | – |
| Firmware/OTA, Gateway WhatsApp | ✅ | ✅² | – | – |

✅ = bisa · 👁️ = hanya lihat · – = tidak ada akses
¹ Pekerja diarahkan fokus operasional; input keuangan sebaiknya oleh Pemilik.
² Pemilik: kelola firmware/OTA & **penerima** WhatsApp di org-nya. **Gateway** WhatsApp (kredensial Meta) hanya Super Admin.

## Konsep penting
- **Organisasi (UMKM)** menaungi beberapa **Peternakan**, tiap peternakan punya beberapa **Kolam**.
- Tiap kolam bisa dihubungkan ke **Perangkat** (feeder ESP32) untuk pakan otomatis & monitoring.
- Data Anda **terisolasi per UMKM** — Anda hanya melihat kolam organisasi Anda (kecuali Super Admin).
