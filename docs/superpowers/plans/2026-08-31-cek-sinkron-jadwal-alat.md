# Cek Sinkron Jadwal ke Alat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah tombol "Cek ke Alat Sekarang" di `FeedPlanCard.jsx` yang membandingkan jadwal yang sedang didefinisikan di form dengan jadwal yang saat ini benar-benar dilaporkan oleh alat (kapan saja, tidak harus sesudah Simpan), lengkap dengan indikator freshness (online/offline + kapan data terakhir).

**Architecture:** Murni frontend, satu file (`FeedPlanCard.jsx`). Tidak ada endpoint backend baru, tidak ada perubahan firmware — memakai `GET /devices/:deviceId` (`getLeleDevice`, sudah ada) yang sudah membawa `is_online`, `last_seen`, dan `live_data.schedules` real-time (firmware lapor status tiap ≤3 detik selagi online). Logika pencocokan yang sudah ada di `verifySync()` diekstrak jadi helper `compareSchedules()` supaya dipakai bersama oleh alur lama (pasca-Simpan) dan alur baru (manual, kapan saja).

**Tech Stack:** React (hooks) — tanpa dependency baru, tanpa test suite otomatis (verifikasi lewat `npm run build` + manual di browser).

Spec lengkap: `docs/superpowers/specs/2026-08-31-cek-sinkron-jadwal-alat-design.md`

---

### Task 1: Helper `compareSchedules` + `normalizeDeviceSchedules`, refactor `verifySync`, tambah `checkSyncNow`

**Files:**
- Modify: `frontend/src/components/FeedPlanCard.jsx`

- [ ] **Step 1: Tambah import `getLeleDevice`**

Cari:

```js
import { getFeedPlan, saveFeedPlan, getFeedPlanLastSampling, testFeedPlanSession } from '../services/api';
import { getSyncedSchedules } from '../services/leleApi';
```

Ganti jadi:

```js
import { getFeedPlan, saveFeedPlan, getFeedPlanLastSampling, testFeedPlanSession } from '../services/api';
import { getSyncedSchedules, getLeleDevice } from '../services/leleApi';
```

- [ ] **Step 2: Tambah 2 helper module-level, di atas definisi komponen `FeedPlanCard`**

Cari:

```js
const clampFeed = (g) => Math.min(5000, Math.max(0, Math.round(g)));
```

Ganti jadi (sisipkan 2 fungsi baru SETELAH `clampFeed`):

```js
const clampFeed = (g) => Math.min(5000, Math.max(0, Math.round(g)));

// Normalisasi bentuk jadwal dari 2 sumber berbeda ke satu bentuk seragam:
// - live_data.schedules (dari status MQTT terkini): { index, hour, minute, enabled, gram }
// - getSyncedSchedules() / lele_device_schedules (DB mirror): { schedule_index, hour, minute, enabled }
function normalizeDeviceSchedules(raw) {
  return (raw || []).map((x) => ({
    index: Number(x.index ?? x.schedule_index),
    hour: Number(x.hour),
    minute: Number(x.minute),
    enabled: !!x.enabled,
  }));
}

// Bandingkan sesi yang didefinisikan (form Rencana Pakan) dengan jadwal yang
// dilaporkan alat. Dicocokkan BERDASARKAN URUTAN (index ke-0,1,2,...), BUKAN
// berdasarkan string jam -- supaya kalau jam di alat sudah bergeser (mis. hasil
// edit manual di tab Jadwal Pakan Aktif), itu KETAHUAN sebagai ketidakcocokan,
// bukan malah lolos diam-diam karena "jam beda jadi dianggap sesi lain".
function compareSchedules(sessions, deviceSchedules) {
  const enabledSorted = [...sessions]
    .filter((s) => s.enabled !== false && /^\d{2}:\d{2}$/.test(s.session_time || ''))
    .sort((a, b) => String(a.session_time).localeCompare(String(b.session_time)))
    .slice(0, 6);
  const mismatches = [];
  enabledSorted.forEach((s, i) => {
    const [h, m] = s.session_time.split(':').map(Number);
    const dev = deviceSchedules.find((x) => x.index === i);
    if (!dev || !dev.enabled || dev.hour !== h || dev.minute !== m) {
      mismatches.push(s.session_name || `Sesi ${i + 1}`);
    }
  });
  // Arah sebaliknya: slot di alat yang ENABLED tapi index-nya di luar jumlah
  // sesi aktif rencana -- sisa dari edit manual lama yang tak lagi terdaftar.
  const extraIndexes = deviceSchedules.filter((x) => x.enabled && x.index >= enabledSorted.length).length;
  return { mismatches, extraIndexes };
}
```

- [ ] **Step 3: Refactor `verifySync()` supaya pakai helper baru**

Cari:

```js
  async function verifySync() {
    setVerify({ status: 'checking' });
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const synced = await getSyncedSchedules(device.device_id);
      const enabledSorted = [...sessions]
        .filter((s) => s.enabled !== false && /^\d{2}:\d{2}$/.test(s.session_time || ''))
        .sort((a, b) => String(a.session_time).localeCompare(String(b.session_time)))
        .slice(0, 6);
      const mismatches = [];
      enabledSorted.forEach((s, i) => {
        const [h, m] = s.session_time.split(':').map(Number);
        const sync = synced.find((x) => x.schedule_index === i);
        if (!sync || !sync.enabled || Number(sync.hour) !== h || Number(sync.minute) !== m) {
          mismatches.push(s.session_name || `Sesi ${i + 1}`);
        }
      });
      setVerify(mismatches.length ? { status: 'mismatch', mismatches } : { status: 'ok' });
    } catch (e) { setVerify({ status: 'error' }); }
  }
```

Ganti jadi:

```js
  async function verifySync() {
    setVerify({ status: 'checking' });
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const synced = await getSyncedSchedules(device.device_id);
      const { mismatches, extraIndexes } = compareSchedules(sessions, normalizeDeviceSchedules(synced));
      setVerify(mismatches.length || extraIndexes ? { status: 'mismatch', mismatches, extraIndexes } : { status: 'ok' });
    } catch (e) { setVerify({ status: 'error' }); }
  }
```

- [ ] **Step 4: Tambah state `checking`/`checkResult` dan fungsi `checkSyncNow()`**

Cari:

```js
  const [verify, setVerify] = useState(null);   // null | {status:'checking'|'ok'|'mismatch'|'error', mismatches?}
```

Ganti jadi:

```js
  const [verify, setVerify] = useState(null);   // null | {status:'checking'|'ok'|'mismatch'|'error', mismatches?}
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);  // null | {status:'checking'|'ok'|'mismatch'|'offline'|'error', mismatches?, extraIndexes?, secondsAgo?}
```

Lalu cari (fungsi `testFeed`, untuk menyisipkan fungsi baru SEBELUM-nya supaya urutan tetap logis: verifySync -> checkSyncNow -> testFeed):

```js
  async function testFeed(pct, name) {
```

Ganti jadi (sisipkan `checkSyncNow` SEBELUM `testFeed`):

```js
  // Cek kapan saja (TIDAK harus sesudah Simpan) apakah alat SAAT INI benar-benar
  // menyimpan jadwal yang sama dengan yang sedang didefinisikan di form. Beda
  // dengan verifySync(): tidak ada delay 2500ms (bukan menunggu efek Simpan,
  // cuma membaca kondisi terkini apa adanya) dan tegas menandai kalau alat
  // sedang offline (data lama TIDAK ditampilkan seolah masih berlaku).
  async function checkSyncNow() {
    setChecking(true); setCheckResult({ status: 'checking' });
    try {
      const dev = await getLeleDevice(device.device_id);
      if (!dev.is_online) {
        const secondsAgo = dev.last_seen ? Math.round((Date.now() - new Date(dev.last_seen).getTime()) / 1000) : null;
        setCheckResult({ status: 'offline', secondsAgo });
        return;
      }
      const liveSch = dev.live_data?.schedules;
      const devSchedules = Array.isArray(liveSch) && liveSch.length
        ? normalizeDeviceSchedules(liveSch)
        : normalizeDeviceSchedules(await getSyncedSchedules(device.device_id));
      const { mismatches, extraIndexes } = compareSchedules(sessions, devSchedules);
      const secondsAgo = dev.last_seen ? Math.round((Date.now() - new Date(dev.last_seen).getTime()) / 1000) : null;
      setCheckResult({
        status: (mismatches.length || extraIndexes) ? 'mismatch' : 'ok',
        mismatches, extraIndexes, secondsAgo,
      });
    } catch (e) {
      setCheckResult({ status: 'error' });
    } finally {
      setChecking(false);
    }
  }

  async function testFeed(pct, name) {
```

- [ ] **Step 5: Verifikasi file terbaca bersih**

Run: `cd frontend && node -e "require('fs').readFileSync('src/components/FeedPlanCard.jsx','utf8')"`
Expected: tidak ada output/error.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FeedPlanCard.jsx
git commit -m "feat(pakan): helper compareSchedules + fungsi checkSyncNow"
```

---

### Task 2: UI tombol + panel hasil "Cek ke Alat Sekarang"

**Files:**
- Modify: `frontend/src/components/FeedPlanCard.jsx`

- [ ] **Step 1: Tambah helper render kecil untuk format "X detik/menit lalu"**

Cari (helper module-level `compareSchedules`, sisipkan fungsi baru SETELAHNYA):

```js
  const extraIndexes = deviceSchedules.filter((x) => x.enabled && x.index >= enabledSorted.length).length;
  return { mismatches, extraIndexes };
}
```

Ganti jadi:

```js
  const extraIndexes = deviceSchedules.filter((x) => x.enabled && x.index >= enabledSorted.length).length;
  return { mismatches, extraIndexes };
}

function formatSecondsAgo(sec) {
  if (sec == null || sec < 0) return 'tidak diketahui';
  if (sec < 60) return `${sec} detik lalu`;
  if (sec < 3600) return `${Math.round(sec / 60)} menit lalu`;
  return `${Math.round(sec / 3600)} jam lalu`;
}
```

- [ ] **Step 2: Tambah tombol "Cek ke Alat Sekarang" di baris tombol Simpan**

Cari:

```js
      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !pctOk}>
          <Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan Rencana'}
        </button>
        {!pctOk && <span className="text-xs" style={{ color: 'var(--danger)' }}>Perbaiki total persen ke 100% dulu.</span>}
      </div>
```

Ganti jadi:

```js
      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !pctOk}>
          <Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan Rencana'}
        </button>
        <button className="btn btn-secondary" onClick={checkSyncNow} disabled={checking || device?.is_online === false}
          title={device?.is_online === false ? 'Alat sedang offline' : 'Bandingkan rencana ini dengan jadwal yang saat ini dilaporkan alat'}>
          <RefreshCw size={16} /> {checking ? 'Mengecek…' : 'Cek ke Alat Sekarang'}
        </button>
        {!pctOk && <span className="text-xs" style={{ color: 'var(--danger)' }}>Perbaiki total persen ke 100% dulu.</span>}
      </div>
```

- [ ] **Step 3: Tambah panel hasil `checkResult`, setelah panel `verify` yang sudah ada**

Cari:

```js
          {verify.status === 'error' && <>Tidak bisa memeriksa status alat sekarang — cek manual di tab Diagnostik.</>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
```

Ganti jadi:

```js
          {verify.status === 'error' && <>Tidak bisa memeriksa status alat sekarang — cek manual di tab Diagnostik.</>}
        </div>
      )}

      {checkResult && (
        <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: checkResult.status === 'ok' ? 'rgba(34,197,94,0.12)' : checkResult.status === 'checking' ? 'var(--bg-elevated)' : 'rgba(239,68,68,0.12)',
          color: checkResult.status === 'ok' ? '#15803d' : checkResult.status === 'checking' ? 'var(--text-secondary)' : '#b91c1c',
          border: `1px solid ${checkResult.status === 'ok' ? '#22c55e' : checkResult.status === 'checking' ? 'var(--border-primary)' : '#ef4444'}` }}>
          {checkResult.status === 'checking' && <>🔄 Mengecek jadwal langsung ke alat…</>}
          {checkResult.status === 'offline' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Alat sedang <strong>OFFLINE</strong> — tidak bisa dipastikan konsisten sekarang. Data terakhir dari alat: {formatSecondsAgo(checkResult.secondsAgo)}.</span>
            </div>
          )}
          {checkResult.status === 'ok' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Semua sesi cocok dengan alat. Alat online, data {formatSecondsAgo(checkResult.secondsAgo)}.</span>
            </div>
          )}
          {checkResult.status === 'mismatch' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Alat online (data {formatSecondsAgo(checkResult.secondsAgo)}), tapi{' '}
                {checkResult.mismatches?.length > 0 && <>sesi <strong>{checkResult.mismatches.join(', ')}</strong> TIDAK cocok dengan yang didefinisikan di sini.{' '}</>}
                {checkResult.extraIndexes > 0 && <>Ada {checkResult.extraIndexes} jadwal aktif di alat yang tidak terdaftar di Rencana Pakan ini (sisa edit manual lama).</>}
              </span>
            </div>
          )}
          {checkResult.status === 'error' && <>Tidak bisa memeriksa status alat sekarang — cek manual di tab Diagnostik.</>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
```

- [ ] **Step 4: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: build sukses tanpa error.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FeedPlanCard.jsx
git commit -m "feat(pakan): tombol + panel Cek ke Alat Sekarang di Rencana Pakan"
```

---

### Task 3: Verifikasi manual end-to-end

Tidak ada test suite otomatis di project ini. Task 1-2 sudah diverifikasi lewat `npm run build`. Perilaku interaktif perlu dicek manual di browser setelah deploy.

- [ ] **Step 1: Deploy** — jalankan `./run.sh` (tidak ada migrasi database di fitur ini, murni frontend).

- [ ] **Step 2:** Buka Pakan Lele → Rencana Pakan Harian untuk kolam yang feeder-nya online. Klik "Cek ke Alat Sekarang" → harus tampil "✓ Semua sesi cocok dengan alat" (asumsi belum ada perubahan yang belum disimpan).

- [ ] **Step 3:** Ubah salah satu jam sesi di form TANPA klik Simpan, lalu klik "Cek ke Alat Sekarang" lagi → harus terdeteksi sesi itu TIDAK cocok (form belum disimpan, device masih pakai jam lama).

- [ ] **Step 4:** Klik "Simpan Rencana", tunggu verifikasi otomatis pasca-simpan selesai, lalu klik "Cek ke Alat Sekarang" sekali lagi → harus kembali cocok.

- [ ] **Step 5:** Kalau memungkinkan, matikan/cabut daya feeder sebentar, klik "Cek ke Alat Sekarang" → harus tampil peringatan OFFLINE (bukan hasil cocok/tidak cocok dari data basi).
