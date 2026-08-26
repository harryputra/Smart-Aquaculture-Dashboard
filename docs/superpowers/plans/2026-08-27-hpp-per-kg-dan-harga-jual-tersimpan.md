# Metrik HPP per Kg + Harga Jual Perkiraan Tersimpan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah metrik HPP (Harga Pokok Produksi) per kg — versi berjalan (estimasi selama siklus aktif) dan versi final (saat panen) — plus simpan permanen field "harga jual perkiraan" per siklus budidaya yang sebelumnya cuma state sementara di browser.

**Architecture:** Backend `cycle-management.js` menambah 2 field turunan (dihitung dari `total_cost` yang sudah ada, tidak ada logika biaya baru) ke response `GET /financial` dan `POST /cycle/harvest`, plus satu endpoint baru `PUT /cycle` untuk menyimpan `target_sell_price_per_kg`. Frontend menampilkan field-field ini di 3 komponen yang sudah menampilkan data keuangan siklus (`FinancialTab.jsx`, `CycleTab.jsx`, `RiwayatAkhirPanel.jsx`).

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), React (Vite) — tanpa framework test otomatis (codebase ini tidak punya test suite; verifikasi lewat `node --check` untuk backend dan `npm run build` untuk frontend, mengikuti pola yang sudah dipakai di fitur-fitur sebelumnya di project ini).

Spec lengkap: `docs/superpowers/specs/2026-08-27-hpp-per-kg-dan-harga-jual-tersimpan-design.md`

---

### Task 1: Migrasi database + wiring run.sh/run.bat

**Files:**
- Create: `database/migration-hpp-sellprice.sql`
- Modify: `run.sh` (array `MIGRATIONS=(...)`)
- Modify: `run.bat` (daftar `call :runsql`)

- [ ] **Step 1: Buat file migrasi**

```sql
-- ============================
-- Smart Aquaculture - MIGRATION HPP PER KG + HARGA JUAL TERSIMPAN
-- Menambahkan kolom target_sell_price_per_kg di pond_cycles supaya
-- "harga jual perkiraan" di tab Keuangan tidak hilang tiap reload halaman.
-- Aman dijalankan berkali-kali (idempotent)
-- ============================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pond_cycles' AND column_name='target_sell_price_per_kg') THEN
        ALTER TABLE pond_cycles ADD COLUMN target_sell_price_per_kg NUMERIC(14,2);
    END IF;
END
$$;

SELECT 'Migration HPP per kg + harga jual tersimpan selesai!' as status;
```

- [ ] **Step 2: Tambahkan ke `run.sh`**

Buka `run.sh`, cari array `MIGRATIONS=(...)` (baris berisi daftar file migrasi, entry terakhir saat ini adalah `database/migration-drain-schedule-depth.sql`). Tambahkan baris baru setelah entry terakhir itu:

```
  database/migration-hpp-sellprice.sql
```

- [ ] **Step 3: Tambahkan ke `run.bat`**

Buka `run.bat`, cari baris `call :runsql migration-drain-schedule-depth.sql` (entry terakhir saat ini), tambahkan baris baru setelahnya:

```
call :runsql migration-hpp-sellprice.sql
```

- [ ] **Step 4: Verifikasi file terbaca bersih**

Run: `node -e "require('fs').readFileSync('database/migration-hpp-sellprice.sql','utf8')"`
Expected: tidak ada output/error

- [ ] **Step 5: Commit**

```bash
git add database/migration-hpp-sellprice.sql run.sh run.bat
git commit -m "feat(hpp): migrasi kolom target_sell_price_per_kg di pond_cycles"
```

---

### Task 2: Backend — metrik HPP + endpoint simpan harga jual

**Files:**
- Modify: `backend/cycle-management.js`

- [ ] **Step 1: Tambah `hpp_running_per_kg` + `target_sell_price_per_kg` di `GET /api/ponds/:pondId/financial`**

Cari (fungsi `app.get('/api/ponds/:pondId/financial', ...)`):

```js
      const proj_harvest_kg = cycle.target_weight_g ? (m.population * cycle.target_weight_g) / 1000 : null;
      res.json({
        cycle_id: cycle.cycle_id, days: m.days, population: m.population,
        avg_weight_g: m.avg_weight_g, est_biomass_kg: m.est_biomass_kg,
        total_feed_kg: m.total_feed_kg, feed_price_per_kg: feedPrice,
        fry_cost: r2(fry_cost), feed_cost: r2(feed_cost), op_cost: r2(op), total_cost: r2(total_cost),
        target_weight_g: cycle.target_weight_g != null ? parseFloat(cycle.target_weight_g) : null,
        proj_harvest_kg: r2(proj_harvest_kg),
        feed_stock: fs,
      });
```

Ganti jadi:

```js
      const proj_harvest_kg = cycle.target_weight_g ? (m.population * cycle.target_weight_g) / 1000 : null;
      const hpp_running_per_kg = m.est_biomass_kg > 0 ? total_cost / m.est_biomass_kg : null;
      res.json({
        cycle_id: cycle.cycle_id, days: m.days, population: m.population,
        avg_weight_g: m.avg_weight_g, est_biomass_kg: m.est_biomass_kg,
        total_feed_kg: m.total_feed_kg, feed_price_per_kg: feedPrice,
        fry_cost: r2(fry_cost), feed_cost: r2(feed_cost), op_cost: r2(op), total_cost: r2(total_cost),
        target_weight_g: cycle.target_weight_g != null ? parseFloat(cycle.target_weight_g) : null,
        proj_harvest_kg: r2(proj_harvest_kg),
        hpp_running_per_kg: r2(hpp_running_per_kg),
        target_sell_price_per_kg: cycle.target_sell_price_per_kg != null ? parseFloat(cycle.target_sell_price_per_kg) : null,
        feed_stock: fs,
      });
```

- [ ] **Step 2: Tambah `hpp_per_kg` di breakdown `POST /api/ponds/:pondId/cycle/harvest`**

Cari (di dalam handler panen final, bagian membangun response akhir):

```js
      res.json({
        ...upd.rows[0],
        breakdown: {
          revenue: r2(total_harv_rev), fry_cost: r2(fry_cost),
          feed_cost: r2(feed_cost), op_cost: r2(op_cost),
          total_cost: r2(total_cost), profit: r2(profit), roi: r2(roi),
          fcr: r3(fcr), survival_rate: m.survival_rate,
          total_harvested_kg: r2(harvest_total_kg),
          total_harvested_fish: parseInt(totals.rows[0].total_fish) || 0,
          harvest_count: harvests.length,
        },
        harvests,
      });
```

Ganti jadi:

```js
      const hpp_per_kg = harvest_total_kg > 0 ? total_cost / harvest_total_kg : null;
      res.json({
        ...upd.rows[0],
        breakdown: {
          revenue: r2(total_harv_rev), fry_cost: r2(fry_cost),
          feed_cost: r2(feed_cost), op_cost: r2(op_cost),
          total_cost: r2(total_cost), profit: r2(profit), roi: r2(roi),
          fcr: r3(fcr), survival_rate: m.survival_rate,
          total_harvested_kg: r2(harvest_total_kg),
          total_harvested_fish: parseInt(totals.rows[0].total_fish) || 0,
          harvest_count: harvests.length,
          hpp_per_kg: r2(hpp_per_kg),
        },
        harvests,
      });
```

- [ ] **Step 3: Tambah endpoint `PUT /api/ponds/:pondId/cycle`**

Cari akhir handler `POST /api/ponds/:pondId/cycle` (mulai siklus baru), tepat sebelum komentar `// ---- Daftar panen parsial siklus aktif ----`:

```js
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Daftar panen parsial siklus aktif ----
```

Sisipkan endpoint baru di antara keduanya:

```js
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Update field yang bisa diedit di tengah siklus aktif (saat ini: harga jual perkiraan) ----
  app.put('/api/ponds/:pondId/cycle', requirePondAccess('pondId'), async (req, res) => {
    const pondId = req.params.pondId;
    try {
      const cr = await pool.query(
        `SELECT cycle_id FROM pond_cycles WHERE pond_id=$1 AND status='active' ORDER BY start_date DESC LIMIT 1`, [pondId]);
      if (!cr.rows.length) return res.status(404).json({ error: 'Tidak ada siklus aktif.' });

      const { target_sell_price_per_kg } = req.body || {};
      if (target_sell_price_per_kg === undefined) {
        return res.status(400).json({ error: 'target_sell_price_per_kg wajib dikirim.' });
      }
      let price = null;
      if (target_sell_price_per_kg !== null) {
        price = parseFloat(target_sell_price_per_kg);
        if (isNaN(price) || price < 0) {
          return res.status(400).json({ error: 'target_sell_price_per_kg harus angka >= 0 atau null.' });
        }
      }

      const r = await pool.query(
        `UPDATE pond_cycles SET target_sell_price_per_kg=$2 WHERE cycle_id=$1 RETURNING *`,
        [cr.rows[0].cycle_id, price]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Daftar panen parsial siklus aktif ----
```

- [ ] **Step 4: Verifikasi sintaks**

Run: `node --check backend/cycle-management.js`
Expected: tidak ada output (exit code 0)

- [ ] **Step 5: Commit**

```bash
git add backend/cycle-management.js
git commit -m "feat(hpp): tambah metrik HPP per kg + endpoint simpan harga jual perkiraan"
```

---

### Task 3: Frontend — `api.js` + `FinancialTab.jsx`

**Files:**
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/components/FinancialTab.jsx`

- [ ] **Step 1: Tambah fungsi `updateCycle` di `api.js`**

Cari:

```js
export const cancelCycle = (pondId, notes) =>
  req(`/ponds/${pondId}/cycle/cancel`, { method: 'POST', body: { notes } });
```

Ganti jadi (tambah fungsi baru setelahnya):

```js
export const cancelCycle = (pondId, notes) =>
  req(`/ponds/${pondId}/cycle/cancel`, { method: 'POST', body: { notes } });
export const updateCycle = (pondId, data) =>
  req(`/ponds/${pondId}/cycle`, { method: 'PUT', body: data });
```

- [ ] **Step 2: Import `updateCycle` di `FinancialTab.jsx`**

Cari:

```js
import {
  getFeedStock, updateFeedStock, getCosts, addCost, deleteCost, getFinancial,
} from '../services/api';
```

Ganti jadi:

```js
import {
  getFeedStock, updateFeedStock, getCosts, addCost, deleteCost, getFinancial, updateCycle,
} from '../services/api';
```

- [ ] **Step 3: Inisialisasi `sellPrice` dari data tersimpan + tambah handler simpan**

Cari:

```js
  async function load() {
    try {
      const [f, s, c] = await Promise.all([getFinancial(pondId), getFeedStock(pondId), getCosts(pondId)]);
      setFin(f); setStock(s); setCosts(c);
      if (s) { setPrice(String(s.price_per_kg || '')); setLowKg(String(s.low_threshold_kg || '')); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [pondId]);
```

Ganti jadi:

```js
  async function load() {
    try {
      const [f, s, c] = await Promise.all([getFinancial(pondId), getFeedStock(pondId), getCosts(pondId)]);
      setFin(f); setStock(s); setCosts(c);
      if (s) { setPrice(String(s.price_per_kg || '')); setLowKg(String(s.low_threshold_kg || '')); }
      if (f) { setSellPrice(f.target_sell_price_per_kg != null ? String(f.target_sell_price_per_kg) : ''); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [pondId]);

  async function saveSellPrice() {
    setBusy(true);
    try {
      await updateCycle(pondId, { target_sell_price_per_kg: sellPrice !== '' ? parseFloat(sellPrice) : null });
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
```

- [ ] **Step 4: Tambah box "HPP Berjalan" + tombol Simpan di sebelah input harga jual**

Cari:

```js
            <Box label="Biaya benih" value={rupiah(fin.fry_cost)} />
            <Box label="Biaya pakan" value={rupiah(fin.feed_cost)} sub={`${fin.total_feed_kg} kg × ${rupiah(fin.feed_price_per_kg)}`} />
            <Box label="Biaya operasional" value={rupiah(fin.op_cost)} />
            <Box label="Total biaya" value={rupiah(fin.total_cost)} strong />
          </div>
```

Ganti jadi:

```js
            <Box label="Biaya benih" value={rupiah(fin.fry_cost)} />
            <Box label="Biaya pakan" value={rupiah(fin.feed_cost)} sub={`${fin.total_feed_kg} kg × ${rupiah(fin.feed_price_per_kg)}`} />
            <Box label="Biaya operasional" value={rupiah(fin.op_cost)} />
            <Box label="Total biaya" value={rupiah(fin.total_cost)} strong />
            <Box label="HPP Berjalan" value={fin.hpp_running_per_kg != null ? `${rupiah(fin.hpp_running_per_kg)}/kg` : '-'}
              sub={fin.hpp_running_per_kg != null ? 'Estimasi, berubah sampai panen' : 'Belum ada sampling biomassa'} />
          </div>
```

Lalu cari:

```js
              <div className="flex items-end gap-2" style={{ marginLeft: 'auto' }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Estimasi harga jual (Rp/kg)</label>
                  <input className="form-input" type="number" min="0" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="mis. 25000" style={{ width: 150 }} /></div>
              </div>
```

Ganti jadi:

```js
              <div className="flex items-end gap-2" style={{ marginLeft: 'auto' }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Estimasi harga jual (Rp/kg)</label>
                  <input className="form-input" type="number" min="0" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="mis. 25000" style={{ width: 150 }} /></div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={saveSellPrice}>Simpan</button>
              </div>
```

- [ ] **Step 5: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: build sukses tanpa error

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/api.js frontend/src/components/FinancialTab.jsx
git commit -m "feat(hpp): tab Keuangan tampilkan HPP Berjalan + harga jual tersimpan"
```

---

### Task 4: Frontend — `CycleTab.jsx`

**Files:**
- Modify: `frontend/src/components/CycleTab.jsx`

- [ ] **Step 1: Tambah baris "HPP per kg" di breakdown modal Panen Final**

Cari (di dalam `FinalHarvestModal`, blok `<table className="table" style={{ marginTop: 4 }}>`):

```js
          <table className="table" style={{ marginTop: 4 }}>
            <tbody>
              <Row k="Total Ikan Dipanen"  v={`${(b.total_harvested_fish||0).toLocaleString('id-ID')} ekor`} />
              <Row k="Total Bobot Panen"   v={`${fnum(b.total_harvested_kg)} kg`} />
              <Row k="Survival Rate"       v={b.survival_rate != null ? `${b.survival_rate}%` : '-'} />
              <Row k="FCR (konversi pakan)" v={b.fcr ?? '-'} />
              <Row k="Revenue (penjualan)" v={rupiah(b.revenue)} />
              <Row k="Biaya benih"         v={rupiah(b.fry_cost)} />
              <Row k="Biaya pakan"         v={rupiah(b.feed_cost)} />
              <Row k="Biaya operasional"   v={rupiah(b.op_cost)} />
              <Row k="Total biaya"         v={rupiah(b.total_cost)} />
            </tbody>
          </table>
```

Ganti jadi:

```js
          <table className="table" style={{ marginTop: 4 }}>
            <tbody>
              <Row k="Total Ikan Dipanen"  v={`${(b.total_harvested_fish||0).toLocaleString('id-ID')} ekor`} />
              <Row k="Total Bobot Panen"   v={`${fnum(b.total_harvested_kg)} kg`} />
              <Row k="Survival Rate"       v={b.survival_rate != null ? `${b.survival_rate}%` : '-'} />
              <Row k="FCR (konversi pakan)" v={b.fcr ?? '-'} />
              <Row k="Revenue (penjualan)" v={rupiah(b.revenue)} />
              <Row k="Biaya benih"         v={rupiah(b.fry_cost)} />
              <Row k="Biaya pakan"         v={rupiah(b.feed_cost)} />
              <Row k="Biaya operasional"   v={rupiah(b.op_cost)} />
              <Row k="Total biaya"         v={rupiah(b.total_cost)} />
              <Row k="HPP per kg"          v={b.hpp_per_kg != null ? `${rupiah(b.hpp_per_kg)}/kg` : '-'} />
            </tbody>
          </table>
```

- [ ] **Step 2: Tambah kolom "HPP/kg" di tabel Riwayat Siklus**

Cari:

```js
              <thead><tr>
                <th>Periode</th><th>Status</th><th>Panen</th><th>Total (kg)</th>
                <th>SR</th><th>FCR</th><th>Revenue</th><th>Profit</th><th>ROI</th>
              </tr></thead>
              <tbody>
                {completed.map(c => (
                  <tr key={c.cycle_id}>
                    <td>{fdate(c.start_date)} → {fdate(c.harvest_date)}</td>
                    <td><span className={`badge ${c.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{c.status === 'completed' ? 'Panen' : 'Batal'}</span></td>
                    <td>{c.partial_harvest_count ? `${c.partial_harvest_count}×` : '-'}</td>
                    <td>{c.harvest_total_kg ? `${fnum(c.harvest_total_kg)} kg` : '-'}</td>
                    <td>{c.survival_rate != null ? `${c.survival_rate}%` : '-'}</td>
                    <td>{c.fcr ?? '-'}</td>
                    <td>{rupiah(c.harvest_revenue)}</td>
                    <td style={{ color: c.profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{rupiah(c.profit)}</td>
                    <td>{c.roi != null ? `${c.roi}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
```

Ganti jadi:

```js
              <thead><tr>
                <th>Periode</th><th>Status</th><th>Panen</th><th>Total (kg)</th>
                <th>SR</th><th>FCR</th><th>Revenue</th><th>Profit</th><th>ROI</th><th>HPP/kg</th>
              </tr></thead>
              <tbody>
                {completed.map(c => {
                  const hppKg = (c.total_cost && c.harvest_total_kg) ? (parseFloat(c.total_cost) / parseFloat(c.harvest_total_kg)) : null;
                  return (
                    <tr key={c.cycle_id}>
                      <td>{fdate(c.start_date)} → {fdate(c.harvest_date)}</td>
                      <td><span className={`badge ${c.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{c.status === 'completed' ? 'Panen' : 'Batal'}</span></td>
                      <td>{c.partial_harvest_count ? `${c.partial_harvest_count}×` : '-'}</td>
                      <td>{c.harvest_total_kg ? `${fnum(c.harvest_total_kg)} kg` : '-'}</td>
                      <td>{c.survival_rate != null ? `${c.survival_rate}%` : '-'}</td>
                      <td>{c.fcr ?? '-'}</td>
                      <td>{rupiah(c.harvest_revenue)}</td>
                      <td style={{ color: c.profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{rupiah(c.profit)}</td>
                      <td>{c.roi != null ? `${c.roi}%` : '-'}</td>
                      <td>{hppKg != null ? `${rupiah(hppKg)}/kg` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
```

- [ ] **Step 3: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: build sukses tanpa error

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CycleTab.jsx
git commit -m "feat(hpp): tampilkan HPP per kg di breakdown panen & riwayat siklus"
```

---

### Task 5: Frontend — `RiwayatAkhirPanel.jsx`

**Files:**
- Modify: `frontend/src/components/lele/RiwayatAkhirPanel.jsx`

- [ ] **Step 1: Tambah `FinBox` "HPP Berjalan"**

Cari:

```js
            <FinBox label="Total Biaya" value={rupiah(fin.total_cost)} strong />
            <FinBox label="Biomassa Saat Ini" value={`${fin.est_biomass_kg.toLocaleString('id-ID')} kg`}
              sub={`${fin.avg_weight_g} g/ekor × ${fin.population.toLocaleString('id-ID')} ekor`} />
```

Ganti jadi:

```js
            <FinBox label="Total Biaya" value={rupiah(fin.total_cost)} strong />
            <FinBox label="HPP Berjalan" value={fin.hpp_running_per_kg != null ? `${rupiah(fin.hpp_running_per_kg)}/kg` : '-'}
              sub="Estimasi, berubah sampai panen" />
            <FinBox label="Biomassa Saat Ini" value={`${fin.est_biomass_kg.toLocaleString('id-ID')} kg`}
              sub={`${fin.avg_weight_g} g/ekor × ${fin.population.toLocaleString('id-ID')} ekor`} />
```

- [ ] **Step 2: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: build sukses tanpa error

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/lele/RiwayatAkhirPanel.jsx
git commit -m "feat(hpp): tampilkan HPP Berjalan di ringkasan keuangan siklus (Pakan Lele)"
```

---

### Task 6: Verifikasi manual end-to-end (setelah deploy)

Codebase ini tidak punya test suite otomatis. Task 1-5 sudah diverifikasi sintaks/build. Perilaku data live (angka HPP yang benar-benar dihitung dari data pond nyata) perlu dicek setelah deploy.

- [ ] **Step 1: Deploy** — jalankan `./run.sh` di server (migrasi `database/migration-hpp-sellprice.sql` ikut jalan otomatis).

- [ ] **Step 2: Cek tab Keuangan kolam yang punya siklus aktif dengan sampling biomassa** (mis. `pond_c1_tunas`) — pastikan "HPP Berjalan" muncul dan hasilnya masuk akal (`total_cost` saat ini dibagi `est_biomass_kg` saat ini — bisa dicek manual dari angka yang sudah tampil di box lain di kartu yang sama).

- [ ] **Step 3: Isi "Estimasi harga jual" → klik Simpan → refresh halaman (F5)** — pastikan nilainya tetap terisi (tidak kembali kosong), membuktikan tersimpan ke database bukan cuma state browser.

- [ ] **Step 4: Cek kolam dengan siklus yang sudah `completed`** (kalau ada) — buka tab Siklus → tabel Riwayat Siklus → pastikan kolom "HPP/kg" terisi benar untuk baris lama, tanpa perlu migrasi data tambahan (dihitung langsung dari `total_cost`/`harvest_total_kg` yang sudah ada sebelumnya).

- [ ] **Step 5: (Opsional, kalau ada kolam uji/dev yang aman dipanen)** Lakukan panen final di kolam tersebut → pastikan modal "Laporan Akhir Siklus" menampilkan baris "HPP per kg" yang benar.

---

## Catatan tambahan (dari spec, sengaja tidak dikerjakan)

- Data harga pakan/biaya operasional yang berbeda dari asumsi manual TIDAK diubah oleh plan ini — itu keputusan data/kebijakan pencatatan milik user.
- Tidak ada proyeksi HPP yang memperhitungkan sisa biaya sampai panen (HPP Berjalan murni cost-so-far ÷ biomassa saat ini).
- Endpoint `PUT /api/ponds/:pondId/cycle` sengaja hanya menerima `target_sell_price_per_kg` untuk saat ini.
