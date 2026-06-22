# 🛰️ Broker MQTT VPS — Smart Aquaculture

Broker MQTT **mandiri (milik sendiri)** untuk menjembatani device lele di kolam
jauh dengan server trin lewat internet. Mosquitto + **TLS** di VPS ber-IP publik.

```
  ESP32 (kolam, WiFi internet) ──mqtts:8883 (TLS)──►  VPS (broker mosquitto)
                                                          ▲
  Backend trin (LELE_MQTT_*) ──mqtts:8883 (TLS)──────────┘
```

Kenapa di VPS, bukan di server trin? Server trin hanya punya ingress Cloudflare
Tunnel (HTTP/WS), tak ada port TCP publik untuk MQTT. VPS ber-IP publik
memungkinkan ESP32 konek MQTT+TLS langsung dengan firmware sederhana
(`PubSubClient` + `WiFiClientSecure`).

---

## Spek VPS
Cukup yang paling kecil: **1 vCPU / 1 GB RAM / 20 GB**. Mosquitto sangat ringan.
OS: **Ubuntu 22.04 / 24.04 LTS** (jangan 16.04 — sudah EOL).

## Langkah cepat (di VPS)

```bash
# 1. Pasang Docker (sekali saja)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Salin folder vps-broker/ ini ke VPS, lalu:
cd vps-broker
cp .env.example .env
nano .env            # set DOMAIN, MQTT_PASSWORD (kuat), pilih TLS_MODE

# 3. Buka firewall
sudo ufw allow 8883/tcp
# (mode letsencrypt) sudo ufw allow 80/tcp

# 4. Jalankan (auto: passwd + cert + start)
./run.sh
```

`./run.sh` akan menampilkan persis nilai `LELE_MQTT_*` untuk ditempel ke `.env`
app utama di server trin, plus setting ESP32.

## Pilih mode TLS

| Mode | Kapan | Catatan |
|------|-------|---------|
| `selfsigned` (default) | Mulai cepat, tanpa domain | Client pakai `certs/ca.crt` atau `setInsecure()`. Set `LELE_MQTT_TLS_INSECURE=true` di app utama. |
| `letsencrypt` | Produksi, punya domain | Butuh A record `DOMAIN` → IP VPS (DNS-only/grey cloud) + port 80. Cert terpercaya, client tak perlu file CA. |

**Disarankan `letsencrypt`** memakai subdomain, mis. `mqtt.trin-polman.id`
(buat A record DNS-only ke IP VPS — JANGAN proxied, karena MQTT bukan HTTP).

## Wiring ke server trin

Di `.env` app utama (folder root), isi:
```
LELE_MQTT_HOST=mqtt.trin-polman.id
LELE_MQTT_PORT=8883
LELE_MQTT_USER=aquaculture
LELE_MQTT_PASSWORD=<password broker VPS>
LELE_MQTT_TLS_INSECURE=false        # true hanya bila self-signed
```
Lalu: `./run.sh prod-restart`. Backend akan log `✓ MQTT lele (remote) terhubung`.

## Perintah runner
`./run.sh` `up | down | restart | status | logs | passwd | certs | renew | doctor | help`

- `renew` — perpanjang sertifikat Let's Encrypt (jadwalkan via cron sebulan sekali).
- Data device & dashboard tetap di server trin; broker hanya meneruskan pesan.

## Uji koneksi
```bash
# dari laptop (Let's Encrypt)
mosquitto_sub -h mqtt.trin-polman.id -p 8883 --capath /etc/ssl/certs \
  -u aquaculture -P 'PASSWORD' -t '#' -v
# self-signed: ganti --capath ... dengan  --cafile certs/ca.crt   (atau --insecure)
```

Setup firmware ESP32 (TLS) ada di [../docs/MQTT-HARDWARE.md](../docs/MQTT-HARDWARE.md).
