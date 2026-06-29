# 👑 Panduan Super Admin

Super Admin = pengelola **platform**. Melihat & mengelola **semua UMKM (organisasi)**,
semua pengguna, gateway WhatsApp, dan quick-login. Punya semua kemampuan Pemilik juga.

> Akun Super Admin pertama dibuat otomatis dari `.env` (`ADMIN_EMAIL`/`ADMIN_PASSWORD`)
> saat server pertama dijalankan. **Ganti password default** secepatnya.

---

## 1. Menyiapkan UMKM baru (organisasi)
Menu **Administrasi → Pengguna** → kartu **Organisasi (UMKM)**.
1. Ketik nama UMKM (mis. "UMKM Lele Pak Andri") → **Tambah**.
2. Organisasi muncul di daftar (jumlah pengguna & peternakan tampil di situ).

## 2. Membuat akun untuk UMKM
Masih di **Pengguna** → **Tambah Pengguna**.
1. Isi **Nama**, **Email**, **Password** (min. 8 char + huruf besar/kecil + angka).
2. **Peran**: pilih `Pemilik` (untuk pemilik usaha) / `Pekerja` / `Pengamat` /
   `Super Admin`.
3. **Organisasi**: pilih UMKM tujuan (wajib, kecuali untuk Super Admin).
4. (opsional) centang **Izinkan Quick-Login** bila akun ini untuk demo.
5. **Simpan**. Berikan kredensial ke pengguna.

> **Filter organisasi** di atas tabel pengguna membantu melihat user per UMKM.
> Anda bisa **edit** (ganti peran, reset password, aktif/nonaktif) atau **hapus**
> pengguna. Anda **tidak bisa** menonaktifkan/menghapus/mengubah peran akun
> sendiri (pengaman anti-terkunci).

## 3. Gateway WhatsApp (global)
Menu **Administrasi → Notifikasi WA** → kartu **Gateway WhatsApp Cloud API**.
Ini kredensial **platform** (dipakai semua UMKM). Hanya Super Admin yang melihatnya.
1. Siapkan **WhatsApp Cloud API** di Meta (akun Business + nomor terdaftar).
2. Buat **message template** disetujui Meta dengan **1 variabel `{{1}}`** di body
   (seluruh isi pesan masuk ke variabel itu), kategori **UTILITY**.
3. Isi **Phone Number ID**, **Access Token**, **Nama Template**, **Bahasa**,
   centang **Aktifkan** → **Simpan Gateway**.
4. Penerima (nomor tujuan) diatur per-UMKM oleh masing-masing Pemilik
   (lihat panduan Pemilik). Anda bisa lihat semua riwayat pengiriman.

## 4. Quick-Login (untuk demo/dukungan)
Menu **Administrasi → Pengguna** → kartu **Quick-Login (Demo)**.
- **Aktifkan** → muncul URL rahasia `/q/<token>`. Centang **Tampilkan tombol di
  halaman login** untuk demo (tombol per-peran muncul di login).
- Untuk **produksi**: matikan "tampilkan tombol", pakai **URL rahasia** saja saat
  perlu support. Bisa pasang **passphrase** + **kedaluwarsa (jam)**.
- Hanya akun bertanda **Quick-Login** (centang di edit user) yang bisa dipakai.
- Saat dinonaktifkan, semua endpoint quick-login "hilang" (404).

## 5. Firmware / OTA (lintas UMKM)
Menu **Hardware → Firmware (OTA)**. Sama seperti Pemilik, tapi Anda melihat
**semua perangkat**. Lihat [panduan-pemilik.md](panduan-pemilik.md) bagian Firmware
& [UJI-OTA.md](../UJI-OTA.md).

## 6. Pemeliharaan platform
- **Server**: deploy/update lewat `./run.sh deploy` (lihat README proyek).
- **Mode demo**: `./run.sh demo` (seed contoh + quick-login aktif).
- **Cek kesehatan**: `https://<domain>/api/health`.
- **Keamanan**: pastikan `AUTH_SECRET` & password admin sudah diganti dari default.

---

## Hak akses Super Admin (ringkas)
- ✅ Semua data lintas UMKM, semua pengguna & organisasi.
- ✅ Gateway WhatsApp, Quick-Login, Firmware/OTA, semua operasional & keuangan.
- ⚠️ Tindakan destruktif (hapus organisasi/kolam) **permanen** — pastikan benar.
