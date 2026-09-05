#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Copy LaunchAgent to user's LaunchAgents
mkdir -p ~/Library/LaunchAgents
cp "$SCRIPT_DIR/com.foodhub.print.plist" ~/Library/LaunchAgents/com.foodhub.print.plist

# Make sure FoodHubPrint.app is in /Applications
if [ -d "$SCRIPT_DIR/FoodHubPrint.app" ]; then
    cp -R "$SCRIPT_DIR/FoodHubPrint.app" /Applications/FoodHubPrint.app 2>/dev/null
    echo "FoodHubPrint.app copiado a /Applications/"
fi

# Load the LaunchAgent
launchctl unload ~/Library/LaunchAgents/com.foodhub.print.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.foodhub.print.plist

echo ""
echo "=========================================="
echo "  AUTOSTART CONFIGURADO"
echo "=========================================="
echo ""
echo "El servidor iniciara al encender el Mac."
echo "Para verificar que esta activo:"
echo "  launchctl list | grep foodhub"
echo ""
echo "Para desactivar:"
echo "  launchctl unload ~/Library/LaunchAgents/com.foodhub.print.plist"
echo ""
