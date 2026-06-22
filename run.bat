@echo off
REM ====================================================================
REM  Smart Aquaculture - one-click runner (Windows)
REM  Mirror dari run.sh. Default = setup + start (mode lokal).
REM  Untuk server pakai Linux + ./run.sh deploy.
REM ====================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "PROJECT=Smart Aquaculture"

REM ---- pilih subcommand ----
set "CMD=%~1"
if "%CMD%"=="" set "CMD=up"

REM ---- deteksi docker ----
where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker tidak ditemukan. Install Docker Desktop dulu.
  goto :end
)
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker daemon tidak aktif. Jalankan Docker Desktop lalu coba lagi.
  goto :end
)

REM ---- pilih compose v2/v1 ----
set "DC=docker compose"
docker compose version >nul 2>&1
if errorlevel 1 set "DC=docker-compose"

REM ---- file compose: base=produksi (frontend+MQTT), dev=+override debug ----
set "CFBASE=-f docker-compose.yml"
set "CFDEV=-f docker-compose.yml -f docker-compose.debug.yml"

REM ---- routing perintah ----
if /i "%CMD%"=="up"           goto :up
if /i "%CMD%"=="start"        goto :up
if /i "%CMD%"=="deploy"       goto :deploy
if /i "%CMD%"=="prod"         goto :deploy
if /i "%CMD%"=="down"         goto :down
if /i "%CMD%"=="stop"         goto :down
if /i "%CMD%"=="prod-down"    goto :down
if /i "%CMD%"=="restart"      goto :restart
if /i "%CMD%"=="prod-restart" goto :restart
if /i "%CMD%"=="status"       goto :status
if /i "%CMD%"=="ps"           goto :status
if /i "%CMD%"=="logs"         goto :logs
if /i "%CMD%"=="prod-logs"    goto :logs
if /i "%CMD%"=="reset"        goto :reset
if /i "%CMD%"=="hard-reset"   goto :reset
if /i "%CMD%"=="doctor"       goto :doctor
if /i "%CMD%"=="mqtt-passwd"  goto :mqttpasswd
if /i "%CMD%"=="help"         goto :usage
if /i "%CMD%"=="-h"           goto :usage
if /i "%CMD%"=="--help"       goto :usage
echo [ERROR] Perintah tidak dikenal: %CMD%
echo.
goto :usage

REM ====================================================================
:ensure_env
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [OK] File .env dibuat dari .env.example.
  )
)
exit /b 0

:ensure_passwd
if not exist "mosquitto\config\passwd" (
  echo [WARN] mosquitto\config\passwd belum ada - membuat dari .env...
  call :mqttpasswd_run
)
exit /b 0

:get_webport
set "WEB_PORT=3000"
if exist ".env" (
  for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
    if /i "%%A"=="WEB_PORT" set "WEB_PORT=%%B"
  )
)
exit /b 0

REM ====================================================================
:up
call :ensure_env
call :ensure_passwd
echo [..] Build ^& start stack (mode lokal, buka port internal ke 127.0.0.1)...
%DC% %CFDEV% up -d --build
if errorlevel 1 goto :end
call :get_webport
echo.
echo ============================================================
echo   %PROJECT% sudah berjalan (mode LOKAL)
echo ============================================================
echo   Frontend   : http://localhost:!WEB_PORT!
echo   Grafana    : http://localhost:!WEB_PORT!/grafana/
echo   API health : http://localhost:!WEB_PORT!/api/health
echo   (dev) Grafana admin http://127.0.0.1:3001  ^|  Postgres 127.0.0.1:5432
echo ============================================================
echo   Stop: run.bat down   ^|  Status: run.bat status  ^|  Log: run.bat logs
echo   Catatan: untuk SERVER gunakan Linux + ./run.sh deploy
echo ============================================================
goto :end

:deploy
call :ensure_env
echo ============================================================
echo   Mode PRODUKSI (deploy) - hanya frontend + MQTT di-publish
echo ============================================================
echo [WARN] Pastikan secret di .env sudah DIGANTI dari default!
echo        (DB_PASSWORD, MQTT_PASSWORD, INFLUX_TOKEN, *_ADMIN_PASSWORD)
echo        Jika MQTT_PASSWORD diganti: run.bat mqtt-passwd
echo.
call :ensure_passwd
%DC% %CFBASE% up -d --build
if errorlevel 1 goto :end
call :get_webport
echo.
echo ============================================================
echo   Deploy selesai. Frontend: http://localhost:!WEB_PORT!
echo   Cloudflare Tunnel: arahkan subdomain -^> http://localhost:!WEB_PORT!
echo ============================================================
goto :end

:down
echo [..] Menghentikan semua container...
%DC% down
echo [OK] Selesai (data volume tetap aman).
goto :end

:restart
echo [..] Restart...
%DC% restart
echo [OK] Selesai.
goto :end

:status
%DC% ps
goto :end

:logs
%DC% logs -f --tail=100 %2 %3 %4
goto :end

:reset
echo [WARN] Ini akan MENGHAPUS semua data (volume DB/Influx/Grafana)!
set /p ANS=Ketik HAPUS untuk konfirmasi:
if /i not "!ANS!"=="HAPUS" (
  echo Dibatalkan.
  goto :end
)
%DC% down -v
echo [OK] Stack + volume dihapus.
goto :end

:doctor
echo ============================================================
echo   Doctor - diagnosa
echo ============================================================
docker --version
%DC% version
if exist ".env" (echo [OK] .env ada) else (echo [WARN] .env belum ada)
if exist "mosquitto\config\passwd" (echo [OK] mosquitto passwd ada) else (echo [WARN] mosquitto passwd belum ada - run.bat mqtt-passwd)
echo ============================================================
goto :end

:mqttpasswd
call :mqttpasswd_run
goto :end

:mqttpasswd_run
set "MU=aquaculture"
set "MP=aquaculture123"
if exist ".env" (
  for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
    if /i "%%A"=="MQTT_USER" set "MU=%%B"
    if /i "%%A"=="MQTT_PASSWORD" set "MP=%%B"
  )
)
echo [..] Regenerasi mosquitto\config\passwd untuk user !MU!...
docker run --rm -v "%cd%\mosquitto\config:/mosquitto/config" eclipse-mosquitto:2.0 mosquitto_passwd -b -c /mosquitto/config/passwd "!MU!" "!MP!"
echo [OK] passwd MQTT diperbarui.
exit /b 0

:usage
echo.
echo   %PROJECT% - runner (Windows)
echo.
echo   run.bat [perintah]
echo     (kosong) ^| up   Setup + start (mode lokal)
echo     deploy ^| prod   Mode produksi
echo     down            Stop semua container
echo     restart         Restart
echo     status          Status container
echo     logs [svc]      Ikuti log
echo     reset           HAPUS semua data (volume)
echo     doctor          Diagnosa prasyarat
echo     mqtt-passwd     (Re)generate mosquitto passwd dari .env
echo     help            Bantuan ini
echo.
goto :end

:end
endlocal
pause
