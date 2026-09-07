@echo off
chcp 65001 >nul
echo ==========================================
echo  FoodHub POS Print Server - Build (.exe)
echo ==========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado.
    echo Descarga e instala desde https://python.org
    pause
    exit /b 1
)

echo Python encontrado.
echo.

REM Install PyInstaller
echo Instalando PyInstaller...
pip install pyinstaller flask waitress fpdf2 Pillow pystray
if errorlevel 1 (
    echo ERROR: Falló la instalacion.
    pause
    exit /b 1
)

echo.
echo Creando .exe con PyInstaller...
pyinstaller --onefile --name "FoodHubPrint" --console --add-data "app.py;." --add-data "printer_service.py;." --add-data "requirements.txt;." --hidden-import "flask" --hidden-import "waitress" --hidden-import "fpdf" --collect-all "PIL" --collect-submodules "pystray" app.py
if errorlevel 1 (
    echo ERROR: Falló la creacion del .exe.
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
echo Para instalar:
echo   1. Copia FoodHubPrint.exe a una carpeta
echo   2. Ejecutalo como administrador
echo   3. La impresora debe estar en "Dispositivos e Impresoras"
echo.
echo Para iniciar automaticamente:
echo   Agrega FoodHubPrint.exe al inicio de Windows.
echo.

pause
