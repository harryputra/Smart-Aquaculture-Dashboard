# Pagination + Jumlah Tampil + Export Excel (Tahap 1: Riwayat Akhir) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun hook pagination + komponen kontrol halaman + tombol export Excel yang bisa dipakai ulang, lalu terapkan ke kelima sub-tab `RiwayatAkhirPanel.jsx` (Sesi Pakan, Batch Detail, Riwayat Sampling, Detail per Ikan, Error) sebagai percontohan sebelum digulirkan ke tabel lain di aplikasi.

**Architecture:** Pagination murni di sisi browser (client-side) — data sudah dimuat penuh oleh komponen yang ada, tinggal dipotong per halaman saat render. Export Excel juga sepenuhnya di browser (library `exceljs`), mengekspor SELURUH data yang dimuat (bukan cuma halaman aktif), tidak butuh endpoint backend baru.

**Tech Stack:** React (hooks), `exceljs` (baru — lihat catatan library di bawah) — tanpa framework test otomatis (codebase ini tidak punya test suite; verifikasi lewat `npm run build` dan pengecekan manual di browser).

**Catatan pemilihan library export:** Spec awal menyebut `xlsx`/SheetJS. Saat implementasi, `npm audit` menemukan paket `xlsx` versi registry npm punya 2 kerentanan **HIGH** ("Prototype Pollution", "ReDoS") **tanpa fix tersedia**. Diganti ke `exceljs` — sudah dipakai & terpercaya di `backend/package.json`, hanya membawa 1 kerentanan moderate transitif (uuid, jalur pemakaian tidak relevan untuk exceljs), dan sudah diverifikasi bundling bersih untuk browser (esbuild `--platform=browser`, exit 0). Hasil akhir untuk user tidak berubah (tetap file `.xlsx`); hanya API internal komponen `ExportExcelButton` yang beda (async `workbook.xlsx.writeBuffer()` + trigger unduh manual via Blob, bukan `XLSX.writeFile` satu baris).

Spec lengkap: `docs/superpowers/specs/2026-08-30-pagination-export-excel-design.md`

---

### Task 1: Dependency `exceljs` + hook `usePagination`

**Files:**
- Modify: `frontend/package.json` (tambah dependency)
- Create: `frontend/src/hooks/usePagination.js`

- [ ] **Step 1: Tambah dependency `exceljs`**

Run: `cd frontend && npm install exceljs`
Expected: `package.json` dan `package-lock.json` ter-update dengan entry `exceljs` baru (versi apa pun yang ter-resolve dari npm registry saat ini — jangan pin manual). Setelah install, jalankan `npm audit` dan pastikan tidak ada laporan HIGH/CRITICAL baru yang berasal dari paket ini (paket `xlsx`/SheetJS SUDAH DICOBA dan DITOLAK karena 2 kerentanan HIGH tanpa fix — lihat catatan library di atas; jangan install ulang `xlsx`).

- [ ] **Step 2: Buat folder `frontend/src/hooks/` dan file `usePagination.js`**

```js
import { useState, useMemo } from 'react';

// Pagination murni client-side: `data` sudah harus array PENUH yang sudah
// dimuat (bukan dipotong sebagian) -- hook ini yang memotongnya per halaman.
export function usePagination(data, defaultPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Kalau dataset menyusut (mis. setelah reload data lebih sedikit), jangan
  // biarkan `page` nyangkut di luar jangkauan -- baru dipakai utk hitung
  // pageData, TIDAK memanggil setPage (hindari efek samping di render).
  const safePage = Math.min(page, totalPages);

  const pageData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  function setPageSize(newSize) {
    setPageSizeRaw(newSize);
    setPage(1);   // ukuran halaman berubah -> mulai lagi dari halaman 1
  }

  return { page: safePage, setPage, pageSize, setPageSize, pageData, totalPages, totalItems };
}
```

- [ ] **Step 3: Verifikasi tidak ada error import**

Run: `cd frontend && node -e "require('fs').readFileSync('src/hooks/usePagination.js','utf8')"`
Expected: tidak ada output/error (verifikasi file terbaca bersih; verifikasi sintaks JSX/ES module penuh terjadi di Task 4 lewat `npm run build`, karena file ini baru dipakai di situ).

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/hooks/usePagination.js
git commit -m "feat(tabel): tambah dependency exceljs + hook usePagination"
```

---

### Task 2: Komponen `PaginationControls`

**Files:**
- Create: `frontend/src/components/PaginationControls.jsx`

- [ ] **Step 1: Buat file**

```jsx
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function PaginationControls({ page, totalPages, totalItems, pageSize, setPage, setPageSize }) {
  if (totalItems === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
      gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-primary)',
    }}>
      <div className="text-xs text-muted">
        Menampilkan {start.toLocaleString('id-ID')}–{end.toLocaleString('id-ID')} dari {totalItems.toLocaleString('id-ID')} baris
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Tampilkan:
          <select className="form-select" style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}
            value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Halaman sebelumnya">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs" style={{ minWidth: 64, textAlign: 'center' }}>Hal {page}/{totalPages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Halaman berikutnya">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifikasi file terbaca bersih**

Run: `cd frontend && node -e "require('fs').readFileSync('src/components/PaginationControls.jsx','utf8')"`
Expected: tidak ada output/error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PaginationControls.jsx
git commit -m "feat(tabel): komponen PaginationControls"
```

---

### Task 3: Komponen `ExportExcelButton`

**Files:**
- Create: `frontend/src/components/ExportExcelButton.jsx`

- [ ] **Step 1: Buat file**

```jsx
import { useState } from 'react';
import ExcelJS from 'exceljs';
import { FileSpreadsheet } from 'lucide-react';

// `columns`: Array<{ header: string, accessor: string | (row) => any }>
// `data` HARUS array penuh (bukan hasil pagination) -- export selalu
// mencakup semua baris terlepas dari halaman yang sedang dilihat user.
//
// Pakai `exceljs`, BUKAN `xlsx`/SheetJS -- versi `xlsx` di npm registry
// punya 2 kerentanan HIGH (Prototype Pollution, ReDoS) tanpa fix tersedia.
// `exceljs` tidak punya helper unduh built-in seperti `XLSX.writeFile`,
// jadi unduhan dipicu manual lewat Blob + object URL.
export default function ExportExcelButton({ data, columns, filename, sheetName = 'Data' }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetName);
      ws.columns = columns.map((col) => ({ header: col.header, key: col.header, width: 22 }));
      data.forEach((row) => {
        const out = {};
        columns.forEach((col) => {
          out[col.header] = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
        });
        ws.addRow(out);
      });
      ws.getRow(1).font = { bold: true };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport} disabled={busy || !data || data.length === 0}>
      <FileSpreadsheet size={14} /> {busy ? 'Menyiapkan...' : 'Export Excel'}
    </button>
  );
}
```

- [ ] **Step 2: Verifikasi file terbaca bersih**

Run: `cd frontend && node -e "require('fs').readFileSync('src/components/ExportExcelButton.jsx','utf8')"`
Expected: tidak ada output/error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ExportExcelButton.jsx
git commit -m "feat(tabel): komponen ExportExcelButton"
```

---

### Task 4: Terapkan ke `RiwayatAkhirPanel.jsx`

**Files:**
- Modify: `frontend/src/components/lele/RiwayatAkhirPanel.jsx`

- [ ] **Step 1: Tambah import**

Cari:

```js
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Calendar, History, Scale, Bug, Fish, Wallet, TrendingUp } from 'lucide-react';
import { getLeleSessions, getLeleErrors, getLeleBiomassSummary, getLeleBiomassSamples } from '../../services/leleApi';
import { getFinancial } from '../../services/api';
```

Ganti jadi:

```js
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Calendar, History, Scale, Bug, Fish, Wallet, TrendingUp } from 'lucide-react';
import { getLeleSessions, getLeleErrors, getLeleBiomassSummary, getLeleBiomassSamples } from '../../services/leleApi';
import { getFinancial } from '../../services/api';
import { usePagination } from '../../hooks/usePagination';
import PaginationControls from '../PaginationControls';
import ExportExcelButton from '../ExportExcelButton';
```

- [ ] **Step 2: Tambah 5 pemanggilan `usePagination` di top-level komponen**

Cari:

```js
  const samplesFlat = samplingSessions.flatMap((group, idx) =>
    group.map(s => ({ ...s, session_label: `Sesi ${samplingSessions.length - idx}` }))
  );

  return (
```

Ganti jadi (sisipkan 5 hook call SEBELUM `return`, setelah `samplesFlat` selesai dihitung — wajib top-level, bukan di dalam blok kondisional tab, karena aturan React Hooks):

```js
  const samplesFlat = samplingSessions.flatMap((group, idx) =>
    group.map(s => ({ ...s, session_label: `Sesi ${samplingSessions.length - idx}` }))
  );

  const sessionsPg = usePagination(sessions, 25);
  const batchPg = usePagination(sessionsBatched, 25);
  const samplingPg = usePagination(summaries, 25);
  const fishPg = usePagination(samplesFlat, 25);
  const errorsPg = usePagination(errors, 25);

  const feedStatusText = (s) => s.success ? 'Sukses' : (s.completed_at ? 'Gagal' : 'Berjalan');

  return (
```

- [ ] **Step 3: Ganti tab "Sesi Pakan" (Mulai/Sesi/Target/Aktual/Batch/Status)**

Cari:

```js
        {activeTab === 'summary' && (sessions.length === 0 ? (
          <div className="empty-state"><p>Belum ada sesi feeding</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Mulai</th><th>Sesi</th><th>Target (g)</th><th>Aktual (g)</th><th>Batch</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.feed_session_id}>
                    <td>{new Date(s.started_at).toLocaleString('id-ID')}</td>
                    <td><span className="badge badge-info">{s.session_name}</span></td>
                    <td>{parseFloat(s.target_total_g).toFixed(0)}</td>
                    <td>{s.actual_total_g ? parseFloat(s.actual_total_g).toFixed(0) : '-'}</td>
                    <td>{s.actual_batch_count || s.planned_batch_count}</td>
                    <td>{s.success ? <span className="badge badge-success">Sukses</span> :
                                     (s.completed_at ? <span className="badge badge-danger">Gagal</span> :
                                                       <span className="badge badge-warning">Berjalan</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
```

Ganti jadi:

```js
        {activeTab === 'summary' && (sessions.length === 0 ? (
          <div className="empty-state"><p>Belum ada sesi feeding</p></div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <ExportExcelButton
                data={sessions}
                filename={`sesi-pakan-${device.device_id}`}
                sheetName="Sesi Pakan"
                columns={[
                  { header: 'Mulai', accessor: (s) => new Date(s.started_at).toLocaleString('id-ID') },
                  { header: 'Sesi', accessor: 'session_name' },
                  { header: 'Target (g)', accessor: (s) => parseFloat(s.target_total_g).toFixed(0) },
                  { header: 'Aktual (g)', accessor: (s) => s.actual_total_g ? parseFloat(s.actual_total_g).toFixed(0) : '-' },
                  { header: 'Batch', accessor: (s) => s.actual_batch_count || s.planned_batch_count },
                  { header: 'Status', accessor: feedStatusText },
                ]}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Mulai</th><th>Sesi</th><th>Target (g)</th><th>Aktual (g)</th><th>Batch</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {sessionsPg.pageData.map(s => (
                    <tr key={s.feed_session_id}>
                      <td>{new Date(s.started_at).toLocaleString('id-ID')}</td>
                      <td><span className="badge badge-info">{s.session_name}</span></td>
                      <td>{parseFloat(s.target_total_g).toFixed(0)}</td>
                      <td>{s.actual_total_g ? parseFloat(s.actual_total_g).toFixed(0) : '-'}</td>
                      <td>{s.actual_batch_count || s.planned_batch_count}</td>
                      <td>{s.success ? <span className="badge badge-success">Sukses</span> :
                                       (s.completed_at ? <span className="badge badge-danger">Gagal</span> :
                                                         <span className="badge badge-warning">Berjalan</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls {...sessionsPg} />
          </>
        ))}
```

- [ ] **Step 4: Ganti tab "Batch Detail"** (hapus batasan `slice(0, 100)`, tambah pagination + export)

Cari:

```js
        {activeTab === 'batch' && (sessionsBatched.length === 0 ? (
          <div className="empty-state"><p>Belum ada batch tercatat</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Sesi</th><th>Batch</th><th>Target (g)</th><th>Aktual (g)</th><th>Spinner</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sessionsBatched.slice(0, 100).map((b, i) => (
                  <tr key={i}>
                    <td>{b.recorded_at ? new Date(b.recorded_at).toLocaleTimeString('id-ID') : '-'}</td>
                    <td className="text-xs">{b.session_name}</td>
                    <td>{b.batch_no}/{b.total_batches}</td>
                    <td>{parseFloat(b.target_g).toFixed(1)}</td>
                    <td style={{ fontWeight: 700 }}>{parseFloat(b.actual_g).toFixed(1)}</td>
                    <td><span className="badge badge-info">{b.spinner_direction}</span></td>
                    <td>{b.success ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
```

Ganti jadi:

```js
        {activeTab === 'batch' && (sessionsBatched.length === 0 ? (
          <div className="empty-state"><p>Belum ada batch tercatat</p></div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <ExportExcelButton
                data={sessionsBatched}
                filename={`batch-detail-${device.device_id}`}
                sheetName="Batch Detail"
                columns={[
                  { header: 'Waktu', accessor: (b) => b.recorded_at ? new Date(b.recorded_at).toLocaleTimeString('id-ID') : '-' },
                  { header: 'Sesi', accessor: 'session_name' },
                  { header: 'Batch', accessor: (b) => `${b.batch_no}/${b.total_batches}` },
                  { header: 'Target (g)', accessor: (b) => parseFloat(b.target_g).toFixed(1) },
                  { header: 'Aktual (g)', accessor: (b) => parseFloat(b.actual_g).toFixed(1) },
                  { header: 'Spinner', accessor: 'spinner_direction' },
                  { header: 'Status', accessor: (b) => b.success ? 'Sukses' : 'Gagal' },
                ]}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Waktu</th><th>Sesi</th><th>Batch</th><th>Target (g)</th><th>Aktual (g)</th><th>Spinner</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {batchPg.pageData.map((b, i) => (
                    <tr key={i}>
                      <td>{b.recorded_at ? new Date(b.recorded_at).toLocaleTimeString('id-ID') : '-'}</td>
                      <td className="text-xs">{b.session_name}</td>
                      <td>{b.batch_no}/{b.total_batches}</td>
                      <td>{parseFloat(b.target_g).toFixed(1)}</td>
                      <td style={{ fontWeight: 700 }}>{parseFloat(b.actual_g).toFixed(1)}</td>
                      <td><span className="badge badge-info">{b.spinner_direction}</span></td>
                      <td>{b.success ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls {...batchPg} />
          </>
        ))}
```

- [ ] **Step 5: Ganti tab "Riwayat Sampling"**

Cari:

```js
        {activeTab === 'sampling' && (summaries.length === 0 ? (
          <div className="empty-state"><p>Belum ada riwayat sampling</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Rata-rata Berat (g)</th><th>Jml Sample</th><th>Jml Ikan Kolam</th><th>Estimasi Biomassa (kg)</th><th>Pakan/Jadwal (g)</th></tr>
              </thead>
              <tbody>
                {summaries.map(sm => (
                  <tr key={sm.id}>
                    <td>{new Date(sm.summarized_at).toLocaleString('id-ID')}</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{parseFloat(sm.average_fish_weight_g).toFixed(2)}</td>
                    <td>{sm.sample_count}</td>
                    <td>{sm.fish_count}</td>
                    <td>{parseFloat(sm.estimated_biomass_kg).toFixed(2)}</td>
                    <td>{Math.round(sm.estimated_feed_per_schedule_g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
```

Ganti jadi:

```js
        {activeTab === 'sampling' && (summaries.length === 0 ? (
          <div className="empty-state"><p>Belum ada riwayat sampling</p></div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <ExportExcelButton
                data={summaries}
                filename={`riwayat-sampling-${device.device_id}`}
                sheetName="Riwayat Sampling"
                columns={[
                  { header: 'Waktu', accessor: (sm) => new Date(sm.summarized_at).toLocaleString('id-ID') },
                  { header: 'Rata-rata Berat (g)', accessor: (sm) => parseFloat(sm.average_fish_weight_g).toFixed(2) },
                  { header: 'Jml Sample', accessor: 'sample_count' },
                  { header: 'Jml Ikan Kolam', accessor: 'fish_count' },
                  { header: 'Estimasi Biomassa (kg)', accessor: (sm) => parseFloat(sm.estimated_biomass_kg).toFixed(2) },
                  { header: 'Pakan/Jadwal (g)', accessor: (sm) => Math.round(sm.estimated_feed_per_schedule_g) },
                ]}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Waktu</th><th>Rata-rata Berat (g)</th><th>Jml Sample</th><th>Jml Ikan Kolam</th><th>Estimasi Biomassa (kg)</th><th>Pakan/Jadwal (g)</th></tr>
                </thead>
                <tbody>
                  {samplingPg.pageData.map(sm => (
                    <tr key={sm.id}>
                      <td>{new Date(sm.summarized_at).toLocaleString('id-ID')}</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{parseFloat(sm.average_fish_weight_g).toFixed(2)}</td>
                      <td>{sm.sample_count}</td>
                      <td>{sm.fish_count}</td>
                      <td>{parseFloat(sm.estimated_biomass_kg).toFixed(2)}</td>
                      <td>{Math.round(sm.estimated_feed_per_schedule_g)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls {...samplingPg} />
          </>
        ))}
```

- [ ] **Step 6: Ganti tab "Detail per Ikan"** (hapus batasan `slice(0, 200)`, tambah pagination + export)

Cari:

```js
        {activeTab === 'fish' && (samplesFlat.length === 0 ? (
          <div className="empty-state"><p>Belum ada data berat ikan tercatat</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Waktu</th><th>Sesi</th><th>Ikan #</th><th>Berat Aktual (g)</th></tr>
              </thead>
              <tbody>
                {samplesFlat.slice(0, 200).map((s, i) => (
                  <tr key={s.id || i}>
                    <td>{new Date(s.sampled_at).toLocaleString('id-ID')}</td>
                    <td><span className="badge badge-info">{s.session_label}</span></td>
                    <td>{s.fish_no}</td>
                    <td style={{ fontWeight: 700 }}>{parseFloat(s.fish_weight_g).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
```

Ganti jadi:

```js
        {activeTab === 'fish' && (samplesFlat.length === 0 ? (
          <div className="empty-state"><p>Belum ada data berat ikan tercatat</p></div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <ExportExcelButton
                data={samplesFlat}
                filename={`detail-per-ikan-${device.device_id}`}
                sheetName="Detail per Ikan"
                columns={[
                  { header: 'Waktu', accessor: (s) => new Date(s.sampled_at).toLocaleString('id-ID') },
                  { header: 'Sesi', accessor: 'session_label' },
                  { header: 'Ikan #', accessor: 'fish_no' },
                  { header: 'Berat Aktual (g)', accessor: (s) => parseFloat(s.fish_weight_g).toFixed(2) },
                ]}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Waktu</th><th>Sesi</th><th>Ikan #</th><th>Berat Aktual (g)</th></tr>
                </thead>
                <tbody>
                  {fishPg.pageData.map((s, i) => (
                    <tr key={s.id || i}>
                      <td>{new Date(s.sampled_at).toLocaleString('id-ID')}</td>
                      <td><span className="badge badge-info">{s.session_label}</span></td>
                      <td>{s.fish_no}</td>
                      <td style={{ fontWeight: 700 }}>{parseFloat(s.fish_weight_g).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls {...fishPg} />
          </>
        ))}
```

- [ ] **Step 7: Ganti tab "Error"**

Cari:

```js
        {activeTab === 'errors' && (errors.length === 0 ? (
          <div className="empty-state"><p>🎉 Tidak ada error tercatat</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Waktu</th><th>Code</th><th>Pesan</th></tr></thead>
              <tbody>
                {errors.map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.occurred_at).toLocaleString('id-ID')}</td>
                    <td><span className="badge badge-danger">{e.code}</span></td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
```

Ganti jadi:

```js
        {activeTab === 'errors' && (errors.length === 0 ? (
          <div className="empty-state"><p>🎉 Tidak ada error tercatat</p></div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <ExportExcelButton
                data={errors}
                filename={`error-${device.device_id}`}
                sheetName="Error"
                columns={[
                  { header: 'Waktu', accessor: (e) => new Date(e.occurred_at).toLocaleString('id-ID') },
                  { header: 'Code', accessor: 'code' },
                  { header: 'Pesan', accessor: 'message' },
                ]}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Waktu</th><th>Code</th><th>Pesan</th></tr></thead>
                <tbody>
                  {errorsPg.pageData.map(e => (
                    <tr key={e.id}>
                      <td>{new Date(e.occurred_at).toLocaleString('id-ID')}</td>
                      <td><span className="badge badge-danger">{e.code}</span></td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls {...errorsPg} />
          </>
        ))}
```

- [ ] **Step 8: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: build sukses tanpa error (khususnya import `exceljs`, `usePagination`, `PaginationControls`, `ExportExcelButton` semua terselesaikan dengan benar).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/lele/RiwayatAkhirPanel.jsx
git commit -m "feat(tabel): pagination + export Excel di 5 sub-tab Riwayat Akhir"
```

---

### Task 5: Verifikasi manual end-to-end

Codebase ini tidak punya test suite otomatis. Task 1-4 sudah diverifikasi lewat `npm run build`. Perilaku interaktif (klik tombol, unduh file) perlu dicek manual di browser setelah deploy.

- [ ] **Step 1: Deploy** — jalankan `./run.sh` di server (tidak ada migrasi database di fitur ini, murni frontend).

- [ ] **Step 2: Buka halaman Pakan Lele → tab Riwayat Akhir**, untuk device yang punya banyak data (mis. `pakan_lele_01`, 300+ sesi pakan).

- [ ] **Step 3: Tab "Sesi Pakan"** — pastikan hanya 25 baris tampil per halaman, dropdown "Tampilkan" bisa diubah ke 10/50/100 (jumlah baris tampil ikut berubah, kembali ke halaman 1), tombol Sebelumnya/Selanjutnya berfungsi dan disabled di ujung. Klik "Export Excel" → file `.xlsx` terunduh, buka di Excel/Google Sheets → pastikan berisi SEMUA baris (bukan cuma 25 yang tampil di layar) dengan 6 kolom sesuai definisi.

- [ ] **Step 4: Ulangi Step 3 untuk 4 tab lainnya** (Batch Detail, Riwayat Sampling, Detail per Ikan, Error) — pastikan masing-masing punya pagination & export sendiri-sendiri, tidak saling memengaruhi (mis. ganti halaman di tab Sesi Pakan tidak mengubah halaman di tab Error).

- [ ] **Step 5: Tab kosong** — kalau ada device yang belum punya data error (`errors.length === 0`), pastikan tampilan tetap "🎉 Tidak ada error tercatat" seperti sebelumnya (bukan kontrol pagination kosong yang aneh).

---

## Catatan tambahan (dari spec, sengaja tidak dikerjakan)

- 20+ file tabel lain di aplikasi (Log Aktivitas, Riwayat Siklus, Biaya Operasional, Pengguna, Firmware, dll) akan digulirkan di putaran kerja terpisah, memakai `usePagination`/`PaginationControls`/`ExportExcelButton` yang sama dari plan ini.
- Tidak ada pagination sisi server di tahap ini (YAGNI — dataset masih skala ratusan baris).
- Tidak ada filter/pencarian dalam tabel.
