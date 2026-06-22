#!/usr/bin/env bash
# ======================================================================
# Smart Aquaculture — one-click runner (Linux/macOS/Git Bash)
# Disesuaikan untuk server lab trin (docker-host VM, 4 GB RAM, Cloudflare Tunnel).
#
# Pemakaian:
#   ./run.sh            # setup penuh + start (mode lokal/dev, buka port internal)
#   ./run.sh deploy     # mode PRODUKSI persisten (server) — hanya frontend+MQTT
#   ./run.sh help       # daftar semua perintah
# ======================================================================
set -euo pipefail

cd "$(dirname "$0")"
PROJECT="Smart Aquaculture"

# ---------- warna (hanya bila TTY) ----------
if [ -t 1 ]; then
  R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; C='\033[0;36m'; N='\033[0m'; BOLD='\033[1m'
else
  R=''; G=''; Y=''; B=''; C=''; N=''; BOLD=''
fi
log()  { echo -e "${C}▶${N} $*"; }
ok()   { echo -e "${G}✔${N} $*"; }
warn() { echo -e "${Y}⚠${N} $*"; }
err()  { echo -e "${R}✖${N} $*" >&2; }
hr()   { echo -e "${B}────────────────────────────────────────────────────────${N}"; }

# ---------- docker compose wrapper (v2 / v1) ----------
DC_BIN=()
detect_dc() {
  if docker compose version >/dev/null 2>&1; then DC_BIN=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then DC_BIN=(docker-compose)
  fi
}
# File compose: base = produksi (hanya frontend+MQTT); dev = + override debug.
CF=(-f docker-compose.yml)
CF_DEV=(-f docker-compose.yml -f docker-compose.debug.yml)
dc() { "${DC_BIN[@]}" "${CF[@]}" "$@"; }

# ---------- prasyarat ----------
need_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "Docker tidak ditemukan. Install Docker Engine / Docker Desktop dulu."
    err "  Linux: https://docs.docker.com/engine/install/"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "Docker daemon tidak aktif. Jalankan/aktifkan Docker lalu coba lagi."
    err "  Linux: sudo systemctl start docker"
    exit 1
  fi
  detect_dc
  if [ "${#DC_BIN[@]}" -eq 0 ]; then
    err "Docker Compose tidak ditemukan (butuh 'docker compose' v2 atau 'docker-compose')."
    exit 1
  fi
}

# ---------- env ----------
ensure_env() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      ok "File .env dibuat dari .env.example (sesuaikan bila perlu)."
    else
      warn ".env.example tidak ada — lanjut dengan default compose."
    fi
  fi
}
load_env() {
  if [ -f .env ]; then
    set -a; # shellcheck disable=SC1091
    . ./.env; set +a
  fi
  WEB_PORT="${WEB_PORT:-3000}"
  BACKEND_PORT="${BACKEND_PORT:-5000}"
  GRAFANA_PORT="${GRAFANA_PORT:-3001}"
  INFLUX_PORT="${INFLUX_PORT:-8086}"
  DB_PORT="${DB_PORT:-5432}"
  MQTT_PORT="${MQTT_PORT:-1883}"
}

# ---------- cek secret placeholder (untuk deploy) ----------
SECRET_KEYS=(DB_PASSWORD MQTT_PASSWORD INFLUX_TOKEN INFLUX_ADMIN_PASSWORD GRAFANA_ADMIN_PASSWORD)
DEFAULTS=("aquaculture123" "aquaculture123" "my-super-secret-auth-token" "admin123456" "admin123")
check_secrets() {
  local found=0 i=0
  for key in "${SECRET_KEYS[@]}"; do
    local val def
    val="$(grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
    def="${DEFAULTS[$i]}"
    if [ "$val" = "$def" ]; then
      warn "Secret ${BOLD}${key}${N} masih nilai default ('${def}')."
      found=1
    fi
    i=$((i+1))
  done
  if [ "$found" = "1" ]; then
    hr
    warn "Masih ada secret DEFAULT di .env. Untuk PRODUKSI ganti dulu!"
    warn "Jika MQTT_PASSWORD diganti, jalankan juga: ${BOLD}./run.sh mqtt-passwd${N}"
    if [ -t 0 ]; then
      read -r -p "Tetap lanjut deploy dengan secret default? [y/N] " ans
      case "${ans:-N}" in y|Y) ;; *) err "Dibatalkan. Ganti secret di .env lalu ulangi."; exit 1;; esac
    else
      warn "Mode non-interaktif: lanjut, tapi SANGAT disarankan ganti secret."
    fi
  else
    ok "Semua secret sudah diganti dari default."
  fi
}

# ---------- mosquitto passwd ----------
ensure_mqtt_passwd() {
  if [ ! -f mosquitto/config/passwd ]; then
    warn "mosquitto/config/passwd belum ada — membuat dari MQTT_USER/MQTT_PASSWORD..."
    mqtt_passwd
  fi
}
mqtt_passwd() {
  load_env
  local u="${MQTT_USER:-aquaculture}" p="${MQTT_PASSWORD:-aquaculture123}"
  log "Regenerasi mosquitto/config/passwd untuk user '${u}'..."
  docker run --rm -v "$(pwd)/mosquitto/config:/mosquitto/config" eclipse-mosquitto:2.0 \
    mosquitto_passwd -b -c /mosquitto/config/passwd "$u" "$p"
  ok "passwd MQTT diperbarui. Restart broker bila sedang berjalan: ./run.sh restart"
}

# ---------- cek port bentrok ----------
port_used() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then ss -ltn 2>/dev/null | grep -q ":${p} "
  elif command -v lsof >/dev/null 2>&1; then lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v netstat >/dev/null 2>&1; then netstat -ltn 2>/dev/null | grep -q ":${p} "
  else return 1; fi
}
# Hanya frontend (WEB_PORT) & MQTT (MQTT_PORT) yang dipublikasikan ke host.
preflight_ports() {
  load_env
  local running
  running="$(dc ps -q 2>/dev/null | wc -l | tr -d ' ')"
  [ "${running:-0}" != "0" ] && return 0   # sudah jalan: biarkan compose yang urus
  if port_used "$WEB_PORT"; then
    warn "Port ${BOLD}${WEB_PORT}${N} (frontend) sudah dipakai proses lain di host."
    warn "→ Ganti ${BOLD}WEB_PORT${N} di .env ke port bebas, lalu ulangi."
  fi
  if port_used "$MQTT_PORT"; then
    warn "Port ${BOLD}${MQTT_PORT}${N} (MQTT) sudah dipakai proses lain di host."
    warn "→ Ganti ${BOLD}MQTT_PORT${N} di .env, atau matikan broker lama."
  fi
}

# ---------- tunggu siap ----------
# Cek lewat proxy frontend (/api/health) supaya berlaku untuk dev maupun prod
# (backend tidak punya port host di mode produksi).
wait_health() {
  load_env
  local url="http://127.0.0.1:${WEB_PORT}/api/health"
  log "Menunggu app siap (${url})..."
  local tries=60
  while [ $tries -gt 0 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      ok "App sehat (frontend + backend + DB merespon)."
      return 0
    fi
    sleep 2; tries=$((tries-1))
  done
  warn "Belum merespon dalam batas waktu. Cek log: ./run.sh logs"
  return 0
}

# ---------- ringkasan ----------
summary() {
  load_env
  local mode="${1:-lokal}"
  hr
  echo -e "${BOLD}${G}  ${PROJECT} sudah berjalan (mode ${mode})${N}"
  hr
  echo -e "  ${BOLD}Akses:${N}"
  echo -e "    Frontend (Web App) : ${C}http://localhost:${WEB_PORT}${N}"
  echo -e "    Grafana (embed)    : ${C}http://localhost:${WEB_PORT}/grafana/${N}"
  echo -e "    API health         : ${C}http://localhost:${WEB_PORT}/api/health${N}"
  if [ "$mode" = "lokal" ]; then
    echo
    echo -e "  ${BOLD}Akses langsung (dev only, port internal di 127.0.0.1):${N}"
    echo -e "    Grafana admin : ${C}http://127.0.0.1:${GRAFANA_PORT}${N}  (admin / \$GRAFANA_ADMIN_PASSWORD)"
    echo -e "    InfluxDB      : ${C}http://127.0.0.1:${INFLUX_PORT}${N}    (admin / \$INFLUX_ADMIN_PASSWORD)"
    echo -e "    PostgreSQL    : ${C}127.0.0.1:${DB_PORT}${N}              (\$DB_USER / \$DB_PASSWORD)"
  else
    echo
    echo -e "  ${BOLD}Produksi:${N} port DB/Influx/Grafana/backend ${BOLD}tidak${N} dibuka ke host"
    echo -e "  (diakses lewat proxy frontend). Untuk psql/influx pakai:"
    echo -e "    ${C}./run.sh logs${N}  atau  ${C}docker compose exec postgres psql -U \$DB_USER \$DB_NAME${N}"
  fi
  echo -e "    MQTT broker (ESP32 LAN): ${C}<ip-host>:${MQTT_PORT}${N}"
  echo
  echo -e "  ${BOLD}Data demo${N} sudah di-seed otomatis (database/init.sql). Tanpa login."
  hr
  echo -e "  Stop : ${Y}./run.sh down${N}  | Status : ${Y}./run.sh status${N}  | Log : ${Y}./run.sh logs${N}"
  hr
}

cloudflare_hint() {
  load_env
  echo
  echo -e "${BOLD}${B}  Publikasi via Cloudflare Tunnel (server trin):${N}"
  echo -e "  1) Cloudflare dashboard → Tunnels → ${BOLD}proxmox-server${N} → Public Hostname"
  echo -e "  2) Tambah: ${C}aquaculture.trin-polman.id${N}  →  service ${C}http://localhost:${WEB_PORT}${N}"
  echo -e "  3) Set ${BOLD}GRAFANA_ROOT_URL=https://aquaculture.trin-polman.id/grafana/${N} di .env, lalu ./run.sh prod-restart"
  echo -e "  4) ESP32 LAN → MQTT ke ${C}172.16.67.5:${MQTT_PORT}${N} (pastikan UFW allow ${MQTT_PORT})"
  echo
  echo -e "  ${BOLD}Cek kecepatan (TTFB) lewat domain:${N}"
  echo -e "  ${C}curl -s -o /dev/null -w 'TTFB:%{time_starttransfer} Total:%{time_total}\\n' https://aquaculture.trin-polman.id/api/health${N}"
  hr
}

# ---------- aksi inti ----------
do_up() {
  need_docker; ensure_env; ensure_mqtt_passwd
  CF=("${CF_DEV[@]}")        # dev: buka port internal ke 127.0.0.1
  preflight_ports
  log "Build & start stack (mode lokal/dev)..."
  dc up -d --build
  wait_health
  summary "lokal"
  echo -e "  ${Y}Catatan:${N} ini mode lokal. Untuk SERVER pakai ${BOLD}./run.sh deploy${N}."
}

do_deploy() {
  need_docker; ensure_env
  hr; echo -e "${BOLD}  Mode PRODUKSI (deploy server)${N}"; hr
  check_secrets
  ensure_mqtt_passwd
  CF=(-f docker-compose.yml)  # prod: hanya frontend + MQTT yang di-publish
  preflight_ports
  log "Build & start stack (detached, restart=unless-stopped, tahan reboot)..."
  dc up -d --build
  wait_health
  summary "produksi"
  cloudflare_hint
}

do_down()    { need_docker; log "Menghentikan semua container..."; dc down; ok "Selesai (data volume tetap aman)."; }
do_restart() { need_docker; log "Restart..."; dc restart; ok "Selesai."; }
do_status()  { need_docker; dc ps; }
do_logs()    { need_docker; shift || true; dc logs -f --tail=100 "$@"; }

do_reset() {
  need_docker
  warn "Ini akan MENGHAPUS semua data (volume DB/Influx/Grafana)!"
  if [ -t 0 ]; then
    read -r -p "Ketik 'HAPUS' untuk konfirmasi: " ans
    [ "$ans" = "HAPUS" ] || { err "Dibatalkan."; exit 1; }
  fi
  dc down -v
  ok "Stack + volume dihapus. Jalankan ./run.sh untuk mulai bersih."
}

do_doctor() {
  hr; echo -e "${BOLD}  Doctor — diagnosa${N}"; hr
  command -v docker >/dev/null 2>&1 && ok "docker: $(docker --version)" || err "docker: TIDAK ADA"
  detect_dc; [ "${#DC_BIN[@]}" -gt 0 ] && ok "compose: ${DC_BIN[*]}" || err "compose: TIDAK ADA"
  docker info >/dev/null 2>&1 && ok "docker daemon: aktif" || err "docker daemon: MATI"
  [ -f .env ] && ok ".env: ada" || warn ".env: belum ada (akan dibuat dari .env.example)"
  [ -f mosquitto/config/passwd ] && ok "mosquitto passwd: ada" || warn "mosquitto passwd: belum ada (jalankan ./run.sh mqtt-passwd)"
  load_env
  echo -e "  ${BOLD}Port host yang dipakai produksi (frontend, MQTT):${N}"
  for p in "$WEB_PORT" "$MQTT_PORT"; do
    if port_used "$p"; then warn "port $p: SEDANG DIPAKAI (ganti di .env bila bukan app ini)"; else ok "port $p: bebas"; fi
  done
  hr
}

usage() {
  cat <<EOF
$(echo -e "${BOLD}${PROJECT} — runner${N}")

  ./run.sh [perintah]

  ${BOLD}Lokal / dev${N}  (buka port internal ke 127.0.0.1 via docker-compose.debug.yml)
    (kosong) | up   Setup penuh + start stack
    down            Stop semua container (data aman)
    restart         Restart semua container
    status          Tampilkan status container
    logs [svc]      Ikuti log (semua / service tertentu)
    reset           HAPUS semua data (volume) lalu bersih
    doctor          Diagnosa prasyarat & port
    mqtt-passwd     (Re)generate mosquitto passwd dari .env
    help            Tampilkan bantuan ini

  ${BOLD}Server / produksi${N}  (HANYA frontend + MQTT yang di-publish ke host)
    deploy | prod   Start mode produksi (cek secret + petunjuk Cloudflare Tunnel)
    prod-logs       Alias logs (Ctrl+C keluar log, app tetap jalan)
    prod-down       Stop stack produksi
    prod-restart    Restart stack produksi

  Default tanpa argumen = setup + start ${BOLD}dev lokal${N} (bukan untuk server).
EOF
}

# ---------- dispatch ----------
cmd="${1:-up}"
case "$cmd" in
  ""|up|start)        do_up ;;
  deploy|prod)        do_deploy ;;
  down|stop)          do_down ;;
  restart)            do_restart ;;
  status|ps)          do_status ;;
  logs)               do_logs "$@" ;;
  prod-logs)          do_logs "$@" ;;
  prod-down)          do_down ;;
  prod-restart)       do_restart ;;
  reset|hard-reset)   do_reset ;;
  doctor)             do_doctor ;;
  mqtt-passwd)        need_docker; mqtt_passwd ;;
  help|-h|--help)     usage ;;
  *) err "Perintah tidak dikenal: $cmd"; echo; usage; exit 1 ;;
esac
