#!/bin/bash
echo "=========================================="
echo "  FoodHub POS - Instalador (macOS)"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 no encontrado."
    echo "Instala desde https://python.org o con Homebrew: brew install python3"
    exit 1
fi

echo "Python encontrado: $(python3 --version)"

# Create venv inside the app bundle
APP_DIR="$SCRIPT_DIR/FoodHubPrint.app"
VENVDIR="$APP_DIR/venv"

if [ ! -d "$VENVDIR" ]; then
    echo "Creando entorno virtual dentro de FoodHubPrint.app..."
    python3 -m venv "$VENVDIR"
fi

echo "Instalando Flask..."
"$VENVDIR/bin/pip" install flask --quiet

if [ $? -ne 0 ]; then
    echo "ERROR: Falló la instalación de Flask."
    exit 1
fi

echo ""
echo "=========================================="
echo "  INSTALACIÓN COMPLETA"
echo "=========================================="
echo ""
echo "Para iniciar manualmente:"
echo "  open -a FoodHubPrint"
echo ""
echo "Para iniciar automáticamente al encender el Mac:"
echo "  bash '$SCRIPT_DIR/setup_autostart.sh'"
echo ""
echo "La impresora debe estar conectada por USB"
echo "y añadida en 'Preferencias del Sistema > Impresoras'."
echo ""

# Setup autostart
if [ -f "$SCRIPT_DIR/com.foodhub.print.plist" ]; then
    echo "LaunchAgent disponible en: $SCRIPT_DIR/com.foodhub.print.plist"
    echo "Para instalarlo:"
    echo "  cp $SCRIPT_DIR/com.foodhub.print.plist ~/Library/LaunchAgents/"
    echo "  launchctl load ~/Library/LaunchAgents/com.foodhub.print.plist"
    echo ""
fi
