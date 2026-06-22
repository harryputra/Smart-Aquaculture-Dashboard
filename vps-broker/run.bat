@echo off
REM ====================================================================
REM  Broker MQTT VPS - runner (Windows, untuk uji lokal via Docker Desktop)
REM  Produksi sebenarnya: jalankan ./run.sh di VPS Linux.
REM ====================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=up"

where docker >nul 2>&1
if errorlevel 1 ( echo [ERROR] Docker tidak ditemukan. & goto :end )
docker info >nul 2>&1
if errorlevel 1 ( echo [ERROR] Docker daemon mati. & goto :end )
set "DC=docker compose"
docker compose version >nul 2>&1
if errorlevel 1 set "DC=docker-compose"

if not exist ".env" ( copy /y ".env.example" ".env" >nul & echo [OK] .env dibuat - EDIT dulu DOMAIN/MQTT_PASSWORD! )

REM baca DOMAIN, MQTT_USER, MQTT_PASSWORD dari .env
set "DOMAIN=mqtt.local"
set "MQTT_USER=aquaculture"
set "MQTT_PASSWORD="
for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
  if /i "%%A"=="DOMAIN" set "DOMAIN=%%B"
  if /i "%%A"=="MQTT_USER" set "MQTT_USER=%%B"
  if /i "%%A"=="MQTT_PASSWORD" set "MQTT_PASSWORD=%%B"
)

if /i "%CMD%"=="up"       goto :up
if /i "%CMD%"=="start"    goto :up
if /i "%CMD%"=="down"     goto :down
if /i "%CMD%"=="stop"     goto :down
if /i "%CMD%"=="restart"  goto :restart
if /i "%CMD%"=="status"   goto :status
if /i "%CMD%"=="logs"     goto :logs
if /i "%CMD%"=="passwd"   goto :passwd
if /i "%CMD%"=="certs"    goto :certs
if /i "%CMD%"=="help"     goto :usage
echo [ERROR] Perintah tak dikenal: %CMD%
goto :usage

:up
if not exist "mosquitto\config\passwd" call :passwd_run
if not exist "certs\server.crt" call :certs_run
%DC% up -d
if errorlevel 1 goto :end
echo.
echo ============================================================
echo   Broker MQTT aktif (uji lokal)
echo   Endpoint: mqtts://%DOMAIN%:8883  user=%MQTT_USER%
echo   Produksi: jalankan ./run.sh di VPS Linux.
echo ============================================================
goto :end

:down
%DC% down
echo [OK] Broker dihentikan.
goto :end

:restart
%DC% restart
echo [OK] Broker direstart.
goto :end

:status
%DC% ps
goto :end

:logs
%DC% logs -f --tail=100
goto :end

:passwd
call :passwd_run
echo [..] Restart: run.bat restart
goto :end

:passwd_run
if "%MQTT_PASSWORD%"=="" ( echo [ERROR] MQTT_PASSWORD di .env kosong. & goto :end )
if "%MQTT_PASSWORD%"=="GANTI_DENGAN_PASSWORD_KUAT" ( echo [ERROR] Ganti MQTT_PASSWORD di .env dulu. & goto :end )
echo [..] Membuat passwd untuk %MQTT_USER%...
docker run --rm -v "%cd%\mosquitto\config:/mosquitto/config" eclipse-mosquitto:2.0 mosquitto_passwd -b -c /mosquitto/config/passwd "%MQTT_USER%" "%MQTT_PASSWORD%"
echo [OK] passwd dibuat.
exit /b 0

:certs
call :certs_run
echo [..] Restart: run.bat restart
goto :end

:certs_run
if not exist "certs" mkdir certs
echo [..] Membuat sertifikat self-signed (CN=%DOMAIN%) via docker openssl...
docker run --rm -v "%cd%\certs:/certs" alpine/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout /certs/server.key -out /certs/server.crt -subj "/CN=%DOMAIN%" -addext "subjectAltName=DNS:%DOMAIN%"
copy /y "certs\server.crt" "certs\ca.crt" >nul
echo [OK] Self-signed dibuat. certs\ca.crt = CA untuk client.
exit /b 0

:usage
echo.
echo   Broker MQTT VPS - runner (Windows)
echo     up^|down^|restart^|status^|logs^|passwd^|certs^|help
echo   Produksi: pakai ./run.sh di VPS Linux.
echo.
goto :end

:end
endlocal
pause
