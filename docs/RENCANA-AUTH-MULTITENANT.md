# 🔐 Rencana: Auth Multi-Tenant + Role + Quick-Login

Menambahkan autentikasi & multi-user ke Smart-Aquaculture. Keputusan terkunci:
- **Multi-tenant** (1 platform, banyak UMKM; data terisolasi per organisasi).
- **Peran**: `superadmin` · `pemilik` · `pekerja` · `pengamat`.
- **Quick-Login aman** (pola `sim_pbl`): aktif di demo, default off di produksi.

Mengikuti **standar keamanan global**: bcrypt, JWT (access pendek + refresh,
cookie HttpOnly+Secure+SameSite), rate-limit + lockout login, admin dari `.env`,
validasi server, role tak boleh dari client.

## Model data (tenant)
- **organizations** (UMKM/tenant) — induk dari farms.
- **users** — `org_id` (null=superadmin) + `role` + `password_hash`.
- **farms.org_id** → organisasi pemilik. Pond mewarisi tenant via farm.
- Scoping data: user hanya lihat farm/pond di `org_id`-nya; superadmin lihat semua.

## Hak akses per peran
| Aksi | superadmin | pemilik | pekerja | pengamat |
|---|---|---|---|---|
| Kelola organisasi & semua user | ✅ | – | – | – |
| Kelola user di org-nya | ✅ | ✅ | – | – |
| Keuangan (biaya, profit, harga) | ✅ | ✅ | – | 👁️ lihat |
| Hapus kolam/siklus/device | ✅ | ✅ | – | – |
| Operasional (monitor, pakan, sampling, mortalitas, kontrol hardware) | ✅ | ✅ | ✅ | 👁️ lihat |
| Pengaturan threshold/jadwal | ✅ | ✅ | ✅ | – |
| Lihat data | ✅ | ✅ | ✅ | ✅ |

## Fase pembangunan
**Fase 0 — Fondasi (skema DB)** ✅ *(migration-auth.sql, registered di run.sh)*
- `organizations`, `users`, `quick_login_config` (singleton), `auth_audit`; `farms.org_id`.
- Backfill: org `org_default` + tautkan farm lama ke situ.

**Fase 1 — Backend auth inti**
- `backend/auth.js`: bcrypt + JWT (cookie HttpOnly), endpoint `login/logout/refresh/me`,
  middleware `requireAuth` & `requireRole`, rate-limit login, bootstrap admin dari `.env`.
- Deps: `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `express-rate-limit`.

**Fase 2 — Proteksi & scoping**
- Terapkan `requireAuth` ke semua `/api` (kecuali auth/health), `requireRole` untuk
  rute terbatas (keuangan/hapus/kelola-user), filter query per `org_id` (tenant).

**Fase 3 — Frontend**
- Halaman Login, auth context, proteksi route, auto-refresh, logout, **UI per-role**
  (sembunyikan Keuangan/Pengaturan/Hapus untuk pekerja/pengamat).

**Fase 4 — Manajemen pengguna & organisasi**
- Pemilik kelola pekerja/pengamat; superadmin kelola organisasi + semua user.

**Fase 5 — Quick-Login aman (sim_pbl)**
- Config DB singleton, toggle on/off, URL token acak `/q/<token>` (constant-time),
  opsional passphrase/expiry, audit, `showButtonOnLogin`. Demo on, prod off.

**Fase 6 — Mode demo vs deploy**
- `demo`: seed user contoh tiap peran + quick-login ON. `deploy`: admin dari `.env`,
  quick-login OFF. Seeder esensial vs demo terpisah (standar global).

## Catatan
- Tambah `AUTH_SECRET` + `ADMIN_EMAIL`/`ADMIN_PASSWORD` ke `.env.example` & compose.
- Tiap fase = commit terpisah & bisa diuji; auth TIDAK di-enforce sebelum Fase 3 siap
  (agar app tak terkunci saat pembangunan).
