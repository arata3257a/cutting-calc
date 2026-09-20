@echo off
setlocal
cd /d %~dp0
title AI 3D Maker - PC Check

echo ===== PC CHECK =====
echo.
echo [Windows]
ver
echo.
echo [Python]
python --version 2>nul
if errorlevel 1 echo Not found
echo.
echo [Git]
git --version 2>nul
if errorlevel 1 echo Not found
echo.
echo [NVIDIA GPU]
nvidia-smi 2>nul
if errorlevel 1 echo NVIDIA GPU / driver not detected.
echo.
echo [Local install]
if exist .venv\Scripts\python.exe (echo Python environment: OK) else (echo Python environment: NOT SETUP)
if exist TripoSR\run.py (echo TripoSR: OK) else (echo TripoSR: NOT SETUP)
echo.
pause
