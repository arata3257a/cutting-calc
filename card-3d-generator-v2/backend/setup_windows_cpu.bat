@echo off
setlocal
cd /d %~dp0
title AI 3D Maker - Windows Setup

echo =========================================
echo AI 3D Maker v2 - FREE LOCAL SETUP
echo External paid API: 0 yen
echo =========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed.
  echo Install Git for Windows first, then run this file again.
  pause
  exit /b 1
)

set PY=python
py -3.10 --version >nul 2>nul
if not errorlevel 1 set PY=py -3.10

%PY% --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found.
  echo Python 3.10 is recommended.
  pause
  exit /b 1
)

if not exist .venv (
  echo [1/6] Creating Python environment...
  %PY% -m venv .venv
  if errorlevel 1 goto :fail
)

call .venv\Scripts\activate.bat

echo [2/6] Updating pip/setuptools...
python -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :fail

echo [3/6] Installing CPU PyTorch...
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto :fail

if not exist TripoSR\run.py (
  echo [4/6] Downloading TripoSR...
  git clone https://github.com/VAST-AI-Research/TripoSR.git TripoSR
  if errorlevel 1 goto :fail
) else (
  echo [4/6] TripoSR already exists.
)

echo [5/6] Installing TripoSR dependencies...
python -m pip install -r TripoSR\requirements.txt
if errorlevel 1 goto :fail

echo [6/6] Installing local API dependencies...
python -m pip install -r requirements-api.txt
if errorlevel 1 goto :fail

echo.
echo =========================================
echo SETUP COMPLETE
echo Double-click start_windows.bat next.
echo =========================================
pause
exit /b 0

:fail
echo.
echo [ERROR] Setup stopped.
echo Copy or screenshot the error shown above.
pause
exit /b 1
