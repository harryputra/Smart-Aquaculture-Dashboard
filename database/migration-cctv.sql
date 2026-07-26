-- ======================================================================
-- CCTV — peluncur portal (mis. BARDI IPC) + kredensial per organisasi.
-- Portal CCTV OEM (Bardi/Tuya) TIDAK bisa di-embed (X-Frame-Options: deny) &
-- tak bisa auto-login lintas-origin. Solusi: simpan kredensial di server
-- (per-org, di balik login) + buka portal di tab baru + tombol salin.
-- Kamera dipetakan ke kolam sebagai katalog (opsional URL langsung per kamera).
--
-- Catatan: kolom `password` sengaja plaintext — ini kredensial layanan pihak
-- ketiga yang HARUS bisa ditampilkan ulang (tidak bisa di-hash 1 arah).
-- Perlindungan: hanya via API ber-authGate + scope org + tak ada di bundle FE.
-- ======================================================================

CREATE TABLE IF NOT EXISTS cctv_config (
  org_id          TEXT PRIMARY KEY,
  enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
  portal_url      TEXT         NOT NULL DEFAULT 'https://ipc.bardi.co.id/login',
  provider_label  TEXT         NOT NULL DEFAULT 'BARDI IPC',
  country_region  TEXT         DEFAULT '+62 (Indonesia)',
  account         TEXT         DEFAULT '',
  password        TEXT         DEFAULT '',
  note            TEXT         DEFAULT '',
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cctv_cameras (
  id          SERIAL PRIMARY KEY,
  org_id      TEXT         NOT NULL,
  pond_id     TEXT,
  name        TEXT         NOT NULL DEFAULT 'Kamera',
  url         TEXT         DEFAULT '',
  note        TEXT         DEFAULT '',
  sort        INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cctv_cameras_org ON cctv_cameras(org_id);
