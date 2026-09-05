@echo off
chcp 65001 >nul
echo ==========================================
echo  FoodHub POS - Instalador (Windows)
echo ==========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado.
    echo Descarga e instala desde https://python.org
    echo Asegurate de marcar "Add Python to PATH".
    pause
    exit /b 1
)

echo Python encontrado.
echo.

REM Create venv
echo Creando entorno virtual...
python -m venv venv
call venv\Scripts\activate.bat

echo Instalando dependencias...
pip install flask waitress fpdf2 pystray Pillow
if errorlevel 1 (
    echo ERROR: Falló la instalacion de dependencias.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo  INSTALACION COMPLETA
echo ==========================================
echo.
echo Para iniciar el servidor de impresion:
echo   cd %~dp0
echo   call venv\Scripts\activate.bat
echo   python app.py
echo.
echo Luego abre el POS en el navegador.
echo La impresora debe estar conectada por USB
echo y agregada en "Dispositivos e Impresoras".
echo.
echo Para crear un .exe standalone:
echo   Ejecuta build_win.bat
echo.

pause
