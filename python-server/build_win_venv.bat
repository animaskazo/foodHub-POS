@echo off
chcp 65001 >nul
echo ==========================================
echo  FoodHub POS - Build .exe (con venv)
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

REM Create venv if not exists
if not exist "venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    python -m venv venv
)

call venv\Scripts\activate.bat

echo Instalando PyInstaller y dependencias...
pip install pyinstaller flask waitress fpdf2 pystray Pillow
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de paquetes.
    pause
    exit /b 1
)

echo.
echo Creando .exe con PyInstaller (puede tardar unos minutos)...
python -m PyInstaller --onefile --name "FoodHubPrint" --console --add-data "app.py;." --add-data "printer_service.py;." --add-data "requirements.txt;." --hidden-import "flask" --hidden-import "waitress" --hidden-import "fpdf" --collect-all "PIL" --collect-submodules "pystray" app.py
if errorlevel 1 (
    echo ERROR: Falló la creacion del .exe.
    echo Revisa el mensaje de error de arriba.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo  BUILD COMPLETADO
echo ==========================================
echo.
echo El .exe esta en: dist\FoodHubPrint.exe
echo.
echo Para instalarlo:
echo   1. Copia FoodHubPrint.exe a una carpeta
echo   2. Ejecutalo con doble clic
echo   3. La impresora debe estar en "Dispositivos e Impresoras"
echo.
echo Para crear un acceso directo al inicio:
echo   Win+R - shell:startup - pega un acceso directo
echo.

pause