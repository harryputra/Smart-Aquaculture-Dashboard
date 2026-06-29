# 👷 Panduan Pekerja

Pekerja = operator harian. Tugas Anda **menjalankan & memantau** kolam: pemberian
pakan, sampling, mencatat kematian, dan mengoperasikan/menguji hardware. Anda
**tidak bisa menghapus** data penting dan **tidak mengelola pengguna**.

---

## 1. Memantau kondisi kolam
- **Dashboard**: ringkasan semua kolam (status sensor, peringatan terbaru).
- **Peternakan → (kolam)** → bagian **Operasional**: nilai sensor live
  (suhu, DO, pH, kekeruhan, kedalaman) + indikator ambang (normal/peringatan/kritis).
- **Notifikasi** (ikon lonceng): daftar peringatan. Tangani yang **kritis** lebih dulu
  (mis. DO rendah → aerasi/ganti air).

## 2. Memberi pakan
Menu **Hardware → Pakan Lele** → pilih perangkat kolam Anda.
- **Manual**: beri pakan sekarang (adaptif sesuai biomassa, atau jumlah gram tertentu).
- **Jadwal**: pastikan jam & jumlah pemberian/hari sudah benar.
- **Auto**: sistem mengikuti biomassa. 
- Saat menakar, **monitor penimbangan live** memastikan jumlah pakan sesuai.
- Bila tebaran kurang merata: atur **kecepatan/arah penampang** & mode buka pintu.

## 3. Sampling biomassa (penimbangan ikan)
Menu **Peternakan → (kolam) → Budidaya → Biomassa**, atau dari **Pakan Lele**:
1. **Mulai sampling** → timbang beberapa ikan (sesuai target sample).
2. Atau **input manual** rata-rata bobot bila menimbang di luar alat.
3. Hasil → memperbarui **feeding rate** otomatis & kurva pertumbuhan.

## 4. Mencatat kematian
**Peternakan → (kolam) → Budidaya → Kematian** → tambah jumlah & tanggal.
Penting agar **SR (survival rate)** akurat.

## 5. Logbook harian
**Budidaya → Logbook** → catat kejadian penting (cuaca, perilaku ikan, treatment, dll).

## 6. Mengoperasikan & menguji hardware
- **Uji Hardware** (menu Hardware): uji trapdoor, spinner, auger, timbangan,
  konektivitas; tandai hasil. Pakai **STOP DARURAT** bila ada yang tak beres.
- **MQTT Monitor**: melihat lalu-lintas data perangkat (untuk diagnosa koneksi).

## 7. Pengaturan ambang/jadwal
Anda boleh menyesuaikan **ambang sensor** dan **jadwal pakan** sesuai kebutuhan
operasional. Bila ragu, konsultasikan dengan Pemilik.

---

## Yang TIDAK bisa Anda lakukan
- ❌ **Menghapus** kolam, siklus, atau perangkat (minta Pemilik).
- ❌ Mengelola **pengguna**, **organisasi**, **gateway/penerima WhatsApp**, **firmware/OTA**.
- ℹ️ Fokus Anda operasional & budidaya harian. Urusan **keuangan** dan keputusan
  besar (panen, hapus data, tambah akun) ditangani **Pemilik**.

## Tips
- Selalu cek **Notifikasi** di awal shift.
- Setelah memberi pakan, pastikan status **feeding** sukses (lihat Pakan Lele / riwayat).
- Bila perangkat **offline**, cek daya & WiFi di lokasi; laporkan bila perlu.
