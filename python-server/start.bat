@echo off
chcp 65001 >nul
title FoodHub Print Server
color 0A
mode con: cols=60 lines=15

echo ============================================
echo   FoodHub POS - Print Server
echo   Starting...
echo ============================================
echo.

REM Get the directory where this script is located
set SERVER_DIR=%~dp0
cd /d "%SERVER_DIR%"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado.
    echo.
    echo Descarga e instala Python 3.10+ desde:
    echo https://python.org
    echo Asegurate de marcar "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

REM Create venv if not exists
if not exist "venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    python -m venv venv
)

REM Activate venv and install deps
call venv\Scripts\activate.bat
echo Instalando dependencias...
pip install flask waitress fpdf2 pystray Pillow --quiet
if errorlevel 1 (
    echo ERROR: No se pudieron instalar las dependencias.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   TODO LISTO - Iniciando servidor...
echo   Abre el POS en el navegador.
echo   Puerto: 8088
echo ============================================
echo.

python app.py
