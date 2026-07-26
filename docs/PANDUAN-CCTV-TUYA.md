# Panduan Integrasi CCTV Bardi ke Dashboard (via Tuya IoT)

> **Tujuan:** menampilkan CCTV Bardi **langsung di dalam dashboard** (tanpa buka
> tab/aplikasi lain). Caranya bukan menyematkan halaman login Bardi (itu diblokir
> browser), tapi mengambil **URL video (HLS)** resmi lewat **Tuya Cloud API**
> — karena CCTV Bardi berjalan di platform **Tuya**.
>
> **Estimasi waktu:** 20–40 menit. **Biaya:** gratis (Tuya Cloud "Trial").
>
> **Yang paling menentukan berhasil/tidak:** langkah **BAGIAN 4** (menautkan akun
> Bardi ke project). Kalau kamera sudah muncul di project, sisanya mudah.

---

## Istilah singkat (biar tidak bingung)
| Istilah | Artinya sederhana |
|---|---|
| **Tuya IoT Platform** | Website pengembang (`iot.tuya.com`). Tempat kita "minta izin" ke kamera. |
| **Cloud Project** | Wadah izin. Di dalamnya ada kunci (Access ID/Secret). |
| **Data Center** | Lokasi server tempat akun/kamera Anda terdaftar. **Harus cocok**, kalau salah kamera tak terlihat. |
| **Access ID / Access Secret** | Username & password untuk *program* (bukan Anda). Ini yang nanti dimasukkan ke sistem. |
| **device_id** | Nomor identitas 1 kamera. |
| **uid** | Nomor identitas akun Bardi Anda setelah tertaut. |
| **HLS (.m3u8)** | Format video yang bisa diputar di browser. Inilah "hasil akhir" yang kita kejar. |

---

## BAGIAN 0 — Siapkan dulu
- Akun Bardi: **`cctvpolmanlele@gmail.com`** (password Anda punya).
- **HP yang sudah terpasang aplikasi Bardi** dan **sudah login** ke akun itu, serta
  kamera-kameranya terlihat normal di aplikasi. (HP dipakai untuk "scan QR" di Bagian 4.)
- Laptop untuk membuka `iot.tuya.com`.

---

## BAGIAN 1 — Daftar & masuk ke Tuya IoT Platform
1. Buka browser ke **https://iot.tuya.com**.
2. Klik **Sign Up** (daftar) — pakai email apa saja (boleh email pribadi Anda,
   **tidak harus** email Bardi). Verifikasi lewat email, buat password.
3. Login. Kalau ditanya "Account Type", pilih **Skip** / lewati saja.

> Catatan: akun `iot.tuya.com` **berbeda** dari akun aplikasi Bardi. Yang ini akun
> "pengembang". Nanti kita **tautkan** akun Bardi ke sini.

---

## BAGIAN 2 — Buat Cloud Project
1. Di menu kiri, klik **Cloud → Development**.
2. Klik tombol **Create Cloud Project**.
3. Isi:
   - **Project Name:** `CCTV Polman Lele` (bebas).
   - **Development Method:** pilih **Smart Home**.
   - **Data Center:** ⚠️ **PENTING** — pilih yang sesuai region akun Bardi.
     Untuk Indonesia, coba **China Data Center** lebih dulu. (Kalau nanti kamera
     tak muncul, kita ganti — lihat catatan Data Center di bawah.)
   - Industry / lainnya: bebas / default.
4. Klik **Create**.
5. Muncul jendela **"Authorize API Services"** — biarkan default, klik
   **Authorize**. (Kita tambah API lain di Bagian 3.)

Setelah jadi, Anda masuk ke halaman **Project Overview**. Di situ ada:
- **Access ID / Client ID**  ← catat nanti (Bagian 6)
- **Access Secret / Client Secret** ← catat nanti (Bagian 6)

---

## BAGIAN 3 — Aktifkan API yang dibutuhkan
1. Di dalam project, buka tab **Service API** (atau **Cloud → Development → [project]
   → Service API**).
2. Klik **Go to Authorize** (atau **All Products** / **+ Add**).
3. Cari & **subscribe (aktifkan)** produk berikut (semua ada paket **Trial** gratis):
   - **IoT Core** (biasanya sudah aktif otomatis)
   - **IoT Video Live Stream** ← **WAJIB** (ini yang memberi URL HLS)
   - **Device Status Notification** (opsional, berguna)
   - **Smart Home Basic Service** (opsional)
4. Untuk tiap produk: klik **Subscribe** → pilih paket **Trial** → **Buy Now**
   (Rp 0) → lalu kembali ke project dan pastikan produk **muncul di daftar
   "Authorized"** project Anda.

> Kalau nanti muncul error *"No permissions. This API is not subscribed"* saat uji,
> berarti langkah ini terlewat untuk **IoT Video Live Stream**.

---

## BAGIAN 4 — Tautkan akun Bardi (LANGKAH PENENTU) 🔑
Tujuannya: agar kamera di akun Bardi **muncul** di project Tuya Anda.

1. Di dalam project, buka tab **Devices**.
2. Klik sub-tab **Link Tuya App Account** → tombol **Add App Account**.
3. Muncul **QR Code** di layar laptop.
4. Ambil **HP** yang ada aplikasi **Bardi** (sudah login akun `cctvpolmanlele@gmail.com`):
   - Buka aplikasi **Bardi**.
   - Masuk ke tab **"Saya" / "Profil" / "Me"** (biasanya pojok kanan bawah).
   - Cari **ikon scan** (kotak/QR) di **pojok kanan atas**.
   - **Scan** QR Code yang tampil di laptop.
   - Muncul konfirmasi **"Authorize / Izinkan"** → tekan **Confirm / Setuju**.
5. Kembali ke laptop → di daftar **Link Tuya App Account** muncul **akun Anda**
   beserta **UID**. ✅

> **Kalau aplikasi Bardi TIDAK punya menu scan** (karena versi OEM), coba:
> - Pastikan versi aplikasi Bardi terbaru (update di Play Store/App Store).
> - Kalau tetap tidak ada → **berhenti di sini** dan kabari saya beserta screenshot
>   tab "Saya"/"Profil" aplikasi Bardi. Kita pakai **rencana cadangan** (peluncur
>   portal + salin kredensial) yang tetap rapi di dashboard.

---

## BAGIAN 5 — Pastikan kamera muncul & catat device_id + uid
1. Masih di tab **Devices** → klik sub-tab **All Devices**
   (atau **"Devices"** di bawah akun tertaut).
2. **Apakah kamera CCTV Anda muncul di daftar?**
   - ✅ **Muncul** → HORE, jalur ini pasti bisa. Lanjut.
   - ❌ **Kosong / tidak muncul** → kemungkinan **Data Center salah**. Lihat
     **Catatan Data Center** di bawah, buat project baru dengan Data Center lain,
     ulangi Bagian 3–4. (Ini normal, sering kejadian.)
3. Untuk tiap kamera, **catat**:
   - **Device ID** (kolom Device ID, deret huruf-angka panjang). Klik kamera →
     detailnya ada `device_id`.
   - Nama kamera (biar Anda tahu mana kolam mana).
4. **Catat uid**: di sub-tab **Link Tuya App Account**, baris akun Anda ada kolom
   **UID** — catat.

---

## BAGIAN 6 — Ambil Access ID & Access Secret
1. Buka tab **Overview** / **Project Overview** project Anda.
2. Di bagian **Authorization Key**:
   - **Access ID/Client ID** → catat.
   - **Access Secret/Client Secret** → klik ikon mata untuk lihat → catat.

> ⚠️ **Access Secret itu rahasia** (seperti password program). **Jangan** kirim
> ke grup/chat publik, jangan taruh di kode. Nanti dimasukkan ke sistem lewat
> pengaturan (bukan hardcode).

---

## BAGIAN 7 — Uji dengan skrip (buktikan sebelum bangun fitur)
Sudah ada skrip uji di repo: `backend/scripts/tuya-cctv-test.js`.
Jalankan di **laptop Anda** (yang ada Node), lewat **PowerShell**:

**Langkah A — cek token + daftar kamera** (kalau device_id belum yakin):
```powershell
$env:TUYA_ACCESS_ID="<Access ID dari Bagian 6>"
$env:TUYA_ACCESS_SECRET="<Access Secret dari Bagian 6>"
$env:TUYA_BASE="https://openapi.tuyacn.com"   # sesuaikan Data Center (lihat catatan)
$env:TUYA_UID="<uid dari Bagian 5>"
node backend/scripts/tuya-cctv-test.js
```
→ akan mencetak daftar kamera + `device_id`-nya.

**Langkah B — ambil URL video kamera:**
```powershell
$env:TUYA_DEVICE_ID="<device_id kamera>"
node backend/scripts/tuya-cctv-test.js
```
→ mencetak **URL `.m3u8`**. **Uji putar di VLC:** buka VLC → *Media → Open Network
Stream* → tempel URL → Play. **Kalau video kamera muncul → 100% siap dibangun.** 🎉

---

## Catatan Data Center (kalau kamera tak muncul / token gagal)
`TUYA_BASE` **harus** cocok dengan Data Center project. Coba berurutan:

| Data Center | Alamat `TUYA_BASE` |
|---|---|
| China (coba pertama untuk Indonesia) | `https://openapi.tuyacn.com` |
| Western America | `https://openapi.tuyaus.com` |
| Central Europe | `https://openapi.tuyaeu.com` |
| India | `https://openapi.tuyain.com` |

Data Center **saat membuat project** (Bagian 2) juga harus sama dengan region akun
Bardi — kalau salah, di Bagian 5 kamera akan kosong. Solusinya: buat project baru
dengan Data Center berbeda, ulangi Bagian 3–4.

---

## Troubleshooting cepat
| Gejala | Kemungkinan sebab | Solusi |
|---|---|---|
| Skrip: *Gagal ambil token* | Access ID/Secret salah, atau `TUYA_BASE` (Data Center) salah | Cek ulang Bagian 6; coba `TUYA_BASE` lain |
| Daftar kamera **kosong** | Akun belum tertaut / Data Center salah | Ulangi Bagian 4; ganti Data Center |
| Allocate: *No permissions / not subscribed* | API "IoT Video Live Stream" belum aktif | Ulangi Bagian 3 |
| Allocate: *device offline* | Kamera mati / tak ada internet | Pastikan kamera online di aplikasi Bardi |
| Aplikasi Bardi tak ada menu **scan** | Versi OEM | Update app; kalau tetap → kabari saya (pakai rencana cadangan) |

---

## Yang perlu Anda kirim ke saya (agar saya bangun fitur CCTV)
Setelah skrip berhasil mencetak URL `.m3u8` yang bisa diputar di VLC, kirim:
1. **Data Center** yang berhasil (nilai `TUYA_BASE`).
2. **device_id** tiap kamera + kamera itu untuk **kolam mana**.
3. **uid** akun.
4. Konfirmasi: *"URL m3u8 bisa diputar di VLC"*.

> **Access ID & Access Secret TIDAK usah dikirim lewat chat.** Nanti Anda isi
> sendiri di halaman **Pengaturan → CCTV** dashboard (saya siapkan form-nya,
> tersimpan aman di server — pola sama seperti pengaturan WhatsApp).

Kalau **macet di langkah mana pun**, screenshot layarnya dan kirim ke saya —
saya bantu urai satu per satu.
