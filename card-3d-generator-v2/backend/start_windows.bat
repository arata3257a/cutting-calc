@echo off
setlocal
cd /d %~dp0
title AI 3D Maker - Local Server

if not exist .venv\Scripts\python.exe (
  echo Setup has not been run yet.
  echo Run setup_windows_cpu.bat first.
  pause
  exit /b 1
)

if not exist TripoSR\run.py (
  echo TripoSR was not found.
  echo Run setup_windows_cpu.bat first.
  pause
  exit /b 1
)

call .venv\Scripts\activate.bat
set TRIPOSR_PATH=%CD%\TripoSR
set TRIPOSR_DEVICE=cpu
set TRIPOSR_MC_RESOLUTION=160

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object {$_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown'} ^| Sort-Object InterfaceMetric ^| Select-Object -First 1 -ExpandProperty IPAddress); if($ip){$ip}else{'127.0.0.1'}"`) do set LANIP=%%i

echo =========================================
echo AI 3D Maker LOCAL SERVER
echo External paid API: 0 yen
echo =========================================
echo.
echo PC:
echo   http://localhost:8000/
echo.
echo Smartphone on the same Wi-Fi:
echo   http://%LANIP%:8000/
echo.
echo Keep this black window open while generating.
echo First 3D generation downloads the model files.
echo CPU mode can take a long time.
echo =========================================
echo.

start "" http://localhost:8000/
python -m uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo Server stopped.
pause
