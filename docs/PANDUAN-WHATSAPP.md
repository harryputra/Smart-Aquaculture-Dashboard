# 💬 Panduan Notifikasi WhatsApp

Menjawab: **langganan apa**, **cara setting**, dan **kirim ke banyak nomor sekaligus**.

---

## 1. Anda harus langganan / pakai apa?
Ada 2 pilihan. Sistem saat ini memakai **WhatsApp Cloud API (resmi Meta)**.

| | **WhatsApp Cloud API (Meta)** — *terpasang* | **Gateway Indonesia** (Fonnte/Wablas/Watzap) |
|---|---|---|
| Biaya | **Gratis** untuk volume kecil (notif *utility*)¹ | Berbayar ~Rp 50–150 rb/bln |
| Resmi WhatsApp | ✅ Ya (aman, tak gampang ke-ban) | ⚠️ Tidak resmi (risiko nomor ke-ban) |
| Kemudahan setup | Agak teknis (akun Meta Business + template disetujui) | Sangat mudah (daftar → scan QR → dapat token) |
| Kirim ke sembarang nomor | ✅ (via template) | ✅ langsung |
| Cocok untuk | Jangka panjang, resmi, hemat | Cepat jalan, praktis untuk UMKM |

¹ Notifikasi kategori *utility* punya kuota gratis; tak ada biaya langganan bulanan untuk volume rendah. Yang "mahal" hanya **usaha setup**, bukan uang.

**Ketiganya SUDAH didukung sistem.** Di **Notifikasi WA → Gateway → Provider aktif**,
pilih salah satu (Cloud API / Fonnte / Wablas), isi kredensialnya, centang
**Aktifkan** → **Simpan**. Yang **aktif** itulah yang dipakai. Anda boleh menyimpan
kredensial beberapa provider sekaligus dan tinggal berganti kapan saja.

**Rekomendasi:**
- Ingin **resmi & gratis**, tak masalah setup agak ribet → **Cloud API** (lihat §2).
- Ingin **paling cepat & praktis** (bayar sedikit) → **Fonnte/Wablas** (lihat §2G).

---

## 2. Setup WhatsApp Cloud API (resmi Meta)

### 2a. Buat akun & aplikasi
1. Buka **developers.facebook.com** → login → **My Apps** → **Create App** →
   pilih tipe **Business**.
2. Di app, tambahkan produk **WhatsApp** → **Set up**.
3. Anda otomatis dapat **nomor uji** dari Meta + satu **Phone Number ID**.
   (Untuk produksi, tambahkan **nomor WhatsApp bisnis sendiri** — nomor ini
   **tidak boleh** dipakai di aplikasi WhatsApp biasa.)

### 2b. Ambil kredensial
Di menu **WhatsApp → API Setup**:
- **Phone Number ID** — salin.
- **Access Token** — token sementara (24 jam) untuk uji. Untuk **produksi**, buat
  **System User token** (permanen) di **Business Settings → Users → System Users**
  (beri izin `whatsapp_business_messaging`).

### 2c. Buat message template (WAJIB untuk notif proaktif)
Notif yang dikirim sistem (di luar 24 jam percakapan) **wajib** pakai **template
yang disetujui Meta**.
1. **WhatsApp Manager → Message Templates → Create Template**.
2. Kategori **Utility**, bahasa **Indonesian (id)**.
3. Isi **Body** dengan **satu variabel**: contoh
   `Notifikasi AquaSmart: {{1}}`
   (seluruh isi peringatan akan masuk ke `{{1}}`).
4. Submit → tunggu **Approved** (biasanya menit–jam).
5. Catat **nama template** (mis. `aquasmart_alert`).

### 2d. Isi di dashboard
Login **Super Admin** → menu **Notifikasi WA** → kartu **Gateway WhatsApp Cloud API**:
- **Aktifkan** ✅
- **Phone Number ID** (dari 2b)
- **Access Token** (dari 2b)
- **Nama Template** (dari 2c, mis. `aquasmart_alert`) + **Bahasa** `id`
- **Simpan Gateway**.

---

## 2G. Setup Gateway (Fonnte / Wablas) — paling praktis
Tak perlu template. Login **Super Admin** → **Notifikasi WA → Gateway** →
**Provider aktif** = Fonnte atau Wablas.

**Fonnte:**
1. Daftar di **fonnte.com** → tambah **device** → hubungkan nomor WA (scan QR).
2. Salin **Token** di dashboard Fonnte.
3. Di dashboard AquaSmart: pilih provider **Fonnte**, tempel **Token**, **Aktifkan**, **Simpan**.

**Wablas:**
1. Daftar di **wablas.com** → hubungkan nomor WA.
2. Catat **domain server** (mis. `https://jogja.wablas.com`) & **Token**.
3. Di dashboard AquaSmart: pilih provider **Wablas**, isi **Domain** + **Token**, **Aktifkan**, **Simpan**.

**Watzap:** daftar di **watzap.id** → salin **API Key** & **Number Key** → pilih
provider **Watzap**, isi keduanya, **Aktifkan**, **Simpan**.

**Generic HTTP (gateway apa pun):** pilih provider **Generic**, isi **URL endpoint**,
**Header (JSON)**, dan **Body template** memakai `{{phone}}` & `{{message}}`. Contoh
body: `{"phone":"{{phone}}","message":"{{message}}"}`. Cocok untuk gateway yang
belum ada di daftar.

> Anda bisa mengisi kredensial semua provider (Cloud API, Fonnte, Wablas, Watzap,
> Generic) **sekaligus** — yang dipakai hanyalah **Provider aktif** yang dipilih.
> Ganti kapan saja tanpa mengisi ulang.

---

## 3. Kirim ke BEBERAPA NOMOR sekaligus ✅ (sudah didukung)
Tinggal **tambahkan beberapa penerima** — semua nomor yang cocok akan dikirimi
sekaligus (broadcast otomatis oleh sistem).

Login **Pemilik** (atau Super Admin) → menu **Notifikasi WA** → **Tambah Penerima**,
ulangi untuk tiap nomor:
- **Nama** + **Nomor WA** (format `08…` atau `62…`).
- **Cakupan**: **Semua kolam (UMKM)** / **Per peternakan** / **Per kolam** — fleksibel
  (mis. pemilik dapat semua, pekerja hanya kolam tertentu).
- **Event**: centang yang diinginkan (Sensor kritis, **Device offline**, Feeding,
  **Stok/Pakan menipis**).
- **Minimal severity**: Semua / Peringatan & Kritis / Hanya Kritis.
- Klik **Kirim UJI** untuk memastikan nomor itu menerima.

> Contoh: tambah 3 nomor (Pemilik, Kepala kolam, Pekerja). Saat DO kritis / feeder
> offline / pakan menipis → **ketiganya** dapat WhatsApp bersamaan.

---

## 4. Uji & pantau
- **Kirim UJI** per penerima (tombol pesawat kertas) → cek HP menerima pesan.
- **Riwayat Pengiriman** di halaman yang sama menampilkan status `sent`/`fail`.
- Jika `fail`, arahkan kursor ke status untuk melihat pesan error (mis. template
  belum approved, token kedaluwarsa, nomor salah).

## 5. Catatan penting
- **Template wajib approved** dulu, kalau tidak pengiriman gagal.
- **Access token uji** kedaluwarsa 24 jam — untuk produksi pakai **System User
  token** (permanen).
- Nomor tujuan sebaiknya sudah **menyimpan/menghubungi** nomor bisnis Anda minimal
  sekali (praktik baik agar tak dianggap spam).
- Gateway WhatsApp diatur **Super Admin** (global); **penerima** diatur tiap
  **Pemilik** untuk UMKM-nya.
