#!/usr/bin/env bash
# ======================================================================
# Broker MQTT VPS — one-click runner (mosquitto + TLS)
# Untuk device lele remote (kolam jauh) + backend trin sebagai client.
#
#   ./run.sh            # setup cert + passwd + start broker
#   ./run.sh help       # daftar perintah
# ======================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ -t 1 ]; then
  R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; C='\033[0;36m'; N='\033[0m'; BOLD='\033[1m'
else R=''; G=''; Y=''; B=''; C=''; N=''; BOLD=''; fi
log(){ echo -e "${C}▶${N} $*"; }
ok(){ echo -e "${G}✔${N} $*"; }
warn(){ echo -e "${Y}⚠${N} $*"; }
err(){ echo -e "${R}✖${N} $*" >&2; }
hr(){ echo -e "${B}────────────────────────────────────────────────────────${N}"; }

DC_BIN=()
detect_dc(){ if docker compose version >/dev/null 2>&1; then DC_BIN=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then DC_BIN=(docker-compose); fi; }
dc(){ "${DC_BIN[@]}" "$@"; }

need_docker(){
  command -v docker >/dev/null 2>&1 || { err "Docker belum terpasang. Di Ubuntu:"; \
    err "  curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker \$USER"; exit 1; }
  docker info >/dev/null 2>&1 || { err "Docker daemon mati. sudo systemctl start docker"; exit 1; }
  detect_dc; [ "${#DC_BIN[@]}" -gt 0 ] || { err "docker compose tidak ada."; exit 1; }
}

ensure_env(){
  [ -f .env ] || { cp .env.example .env; ok ".env dibuat dari .env.example — EDIT dulu (DOMAIN, MQTT_PASSWORD)!"; }
}
load_env(){
  ensure_env
  set -a; . ./.env; set +a
  TLS_MODE="${TLS_MODE:-selfsigned}"; DOMAIN="${DOMAIN:-}"; PUBLIC_IP="${PUBLIC_IP:-}"
  LE_EMAIL="${LE_EMAIL:-}"; MQTT_USER="${MQTT_USER:-aquaculture}"
  MQTT_PASSWORD="${MQTT_PASSWORD:-}"; MQTT_PORT="${MQTT_PORT:-8883}"
}

gen_passwd(){
  load_env
  [ -n "$MQTT_PASSWORD" ] && [ "$MQTT_PASSWORD" != "GANTI_DENGAN_PASSWORD_KUAT" ] || {
    err "MQTT_PASSWORD di .env masih kosong/placeholder. Isi password kuat dulu."; exit 1; }
  log "Membuat file passwd untuk user '${MQTT_USER}'..."
  docker run --rm -v "$(pwd)/mosquitto/config:/mosquitto/config" eclipse-mosquitto:2.0 \
    mosquitto_passwd -b -c /mosquitto/config/passwd "$MQTT_USER" "$MQTT_PASSWORD"
  ok "passwd dibuat."
}

gen_certs(){
  load_env
  mkdir -p certs
  if [ "$TLS_MODE" = "letsencrypt" ]; then
    [ -n "$DOMAIN" ] && [ -n "$LE_EMAIL" ] || { err "letsencrypt butuh DOMAIN & LE_EMAIL di .env."; exit 1; }
    warn "Pastikan: (1) A record ${DOMAIN} → IP VPS ini (DNS-only), (2) port 80 terbuka & bebas."
    log "Meminta sertifikat Let's Encrypt untuk ${DOMAIN}..."
    docker run --rm -p 80:80 -v "$(pwd)/certs/letsencrypt:/etc/letsencrypt" certbot/certbot \
      certonly --standalone --non-interactive --agree-tos -m "$LE_EMAIL" -d "$DOMAIN"
    cp "certs/letsencrypt/live/${DOMAIN}/fullchain.pem" certs/server.crt
    cp "certs/letsencrypt/live/${DOMAIN}/privkey.pem"  certs/server.key
    ok "Sertifikat Let's Encrypt terpasang (perpanjang dgn: ./run.sh renew)."
  else
    [ -n "$DOMAIN" ] || { err "selfsigned butuh DOMAIN (CN/SAN) di .env."; exit 1; }
    local san="DNS:${DOMAIN}"; [ -n "$PUBLIC_IP" ] && san="${san},IP:${PUBLIC_IP}"
    log "Membuat sertifikat self-signed (CN=${DOMAIN}, SAN=${san})..."
    command -v openssl >/dev/null 2>&1 || { err "openssl tidak ada. sudo apt install -y openssl"; exit 1; }
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -keyout certs/server.key -out certs/server.crt \
      -subj "/CN=${DOMAIN}" -addext "subjectAltName=${san}"
    cp certs/server.crt certs/ca.crt
    ok "Self-signed dibuat. ${BOLD}certs/ca.crt${N} = CA untuk client (ESP32 setCACert / backend)."
    warn "Karena self-signed: set ${BOLD}LELE_MQTT_TLS_INSECURE=true${N} di app utama (atau pin ca.crt)."
  fi
  # Pastikan terbaca user mosquitto (uid 1883) di dalam container.
  chmod 644 certs/server.crt certs/server.key 2>/dev/null || true
  [ -f certs/ca.crt ] && chmod 644 certs/ca.crt || true
}

ensure_ready(){
  [ -f mosquitto/config/passwd ] || gen_passwd
  { [ -f certs/server.crt ] && [ -f certs/server.key ]; } || gen_certs
}

summary(){
  load_env
  local pubip; pubip="${PUBLIC_IP:-<IP-VPS>}"
  hr; echo -e "${BOLD}${G}  Broker MQTT aktif${N}"; hr
  echo -e "  Endpoint TLS : ${C}mqtts://${DOMAIN:-$pubip}:${MQTT_PORT}${N}"
  echo -e "  User / Pass  : ${C}${MQTT_USER}${N} / (sesuai .env)"
  echo -e "  Mode TLS     : ${C}${TLS_MODE}${N}"
  echo
  echo -e "  ${BOLD}Buka firewall VPS:${N}"
  echo -e "    sudo ufw allow ${MQTT_PORT}/tcp"
  [ "$TLS_MODE" = "letsencrypt" ] && echo -e "    sudo ufw allow 80/tcp   (untuk perpanjang cert)"
  echo
  echo -e "  ${BOLD}Wiring backend trin (.env app utama):${N}"
  echo -e "    LELE_MQTT_HOST=${DOMAIN:-$pubip}"
  echo -e "    LELE_MQTT_PORT=${MQTT_PORT}"
  echo -e "    LELE_MQTT_USER=${MQTT_USER}"
  echo -e "    LELE_MQTT_PASSWORD=<password .env ini>"
  [ "$TLS_MODE" = "selfsigned" ] && echo -e "    LELE_MQTT_TLS_INSECURE=true"
  echo -e "    lalu di server trin: ${Y}./run.sh prod-restart${N}"
  echo
  echo -e "  ${BOLD}ESP32:${N} MQTT_SERVER=\"${DOMAIN:-$pubip}\", MQTT_PORT=${MQTT_PORT} (TLS). Lihat docs/MQTT-HARDWARE.md"
  hr
  echo -e "  Uji dari laptop: ${C}mosquitto_sub -h ${DOMAIN:-$pubip} -p ${MQTT_PORT} --capath /etc/ssl/certs \\${N}"
  echo -e "  ${C}  -u ${MQTT_USER} -P 'PASSWORD' -t '#' -v${N}   ${Y}(self-signed: ganti --capath ... dgn --cafile certs/ca.crt atau tambah --insecure)${N}"
  hr
}

case "${1:-up}" in
  ""|up|start)
    need_docker; ensure_ready
    log "Start broker..."; dc up -d
    summary ;;
  down|stop)    need_docker; dc down; ok "Broker dihentikan." ;;
  restart)      need_docker; dc restart; ok "Broker direstart." ;;
  status|ps)    need_docker; dc ps ;;
  logs)         need_docker; dc logs -f --tail=100 ;;
  passwd)       need_docker; gen_passwd; warn "Restart broker: ./run.sh restart" ;;
  certs)        need_docker; gen_certs; warn "Restart broker: ./run.sh restart" ;;
  renew)
    need_docker; load_env
    [ "$TLS_MODE" = "letsencrypt" ] || { err "renew hanya untuk TLS_MODE=letsencrypt."; exit 1; }
    docker run --rm -p 80:80 -v "$(pwd)/certs/letsencrypt:/etc/letsencrypt" certbot/certbot renew
    cp "certs/letsencrypt/live/${DOMAIN}/fullchain.pem" certs/server.crt
    cp "certs/letsencrypt/live/${DOMAIN}/privkey.pem"  certs/server.key
    chmod 644 certs/server.crt certs/server.key
    dc restart; ok "Cert diperpanjang & broker direstart." ;;
  doctor)
    hr; echo -e "${BOLD}  Doctor${N}"; hr
    command -v docker >/dev/null 2>&1 && ok "docker: $(docker --version)" || err "docker: TIDAK ADA"
    detect_dc; [ "${#DC_BIN[@]}" -gt 0 ] && ok "compose: ${DC_BIN[*]}" || err "compose: TIDAK ADA"
    [ -f .env ] && ok ".env: ada" || warn ".env: belum ada"
    [ -f mosquitto/config/passwd ] && ok "passwd: ada" || warn "passwd: belum (./run.sh passwd)"
    { [ -f certs/server.crt ] && [ -f certs/server.key ]; } && ok "cert: ada" || warn "cert: belum (./run.sh certs)"
    hr ;;
  help|-h|--help)
    cat <<EOF
Broker MQTT VPS — perintah:
  (kosong)|up   Setup cert+passwd + start broker
  down          Stop broker
  restart       Restart broker
  status        Status container
  logs          Ikuti log
  passwd        (Re)generate file passwd dari .env
  certs         (Re)generate sertifikat (selfsigned/letsencrypt)
  renew         Perpanjang sertifikat Let's Encrypt
  doctor        Diagnosa
  help          Bantuan ini
EOF
    ;;
  *) err "Perintah tak dikenal: $1"; exit 1 ;;
esac
