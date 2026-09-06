import os
import sys
import time
import traceback
import threading
import webbrowser
import platform
import subprocess
import tempfile
import json
import logging
import atexit
import signal
import base64
import io
from flask import Flask, request, jsonify, send_file
from fpdf import FPDF

from printer_service import format_receipt

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    _LOG_DIR = os.path.dirname(os.path.abspath(__file__))
    _fh = logging.FileHandler(os.path.join(_LOG_DIR, 'foodhub-print.log'), encoding='utf-8')
    _fh.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    logger.addHandler(_fh)
except Exception as _e:
    print(f'No se pudo crear el archivo de log: {_e}')

IS_WINDOWS = platform.system() == 'Windows'
IS_MAC = platform.system() == 'Darwin'

AUTOSTART_LABEL = 'FoodHubPrint'
MAC_LAUNCH_AGENT = os.path.expanduser('~/Library/LaunchAgents/com.foodhub.print.plist')


def is_autostart_enabled():
    try:
        if IS_WINDOWS:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                 r'Software\Microsoft\Windows\CurrentVersion\Run',
                                 0, winreg.KEY_READ)
            try:
                winreg.QueryValueEx(key, AUTOSTART_LABEL)
                return True
            finally:
                winreg.CloseKey(key)
        elif IS_MAC:
            return os.path.exists(MAC_LAUNCH_AGENT)
    except Exception as e:
        logger.warning(f"Error leyendo autostart: {e}")
    return False


def set_autostart(enabled):
    try:
        if IS_WINDOWS:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                 r'Software\Microsoft\Windows\CurrentVersion\Run',
                                 0, winreg.KEY_SET_VALUE)
            try:
                if enabled:
                    winreg.SetValueEx(key, AUTOSTART_LABEL, 0, winreg.REG_SZ, f'"{sys.executable}"')
                else:
                    try:
                        winreg.DeleteValue(key, AUTOSTART_LABEL)
                    except FileNotFoundError:
                        pass
            finally:
                winreg.CloseKey(key)
        elif IS_MAC:
            if enabled:
                os.makedirs(os.path.dirname(MAC_LAUNCH_AGENT), exist_ok=True)
                python = sys.executable
                app_py = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app.py')
                plist_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.foodhub.print</string>
  <key>ProgramArguments</key><array><string>{python}</string><string>{app_py}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict></plist>'''
                with open(MAC_LAUNCH_AGENT, 'w', encoding='utf-8') as f:
                    f.write(plist_content)
                subprocess.run(['launchctl', 'load', MAC_LAUNCH_AGENT],
                               capture_output=True, timeout=10)
            else:
                if os.path.exists(MAC_LAUNCH_AGENT):
                    subprocess.run(['launchctl', 'unload', MAC_LAUNCH_AGENT],
                                   capture_output=True, timeout=10)
                    os.remove(MAC_LAUNCH_AGENT)
        logger.info(f"Autostart {'activado' if enabled else 'desactivado'}")
        return True
    except Exception as e:
        logger.error(f"Error cambiando autostart: {e}")
        return False


def _toggle_autostart(icon=None, item=None):
    set_autostart(not is_autostart_enabled())


def _autostart_checked(item):
    return is_autostart_enabled()


def _autostart_label():
    if IS_WINDOWS:
        return 'Iniciar con Windows'
    if IS_MAC:
        return 'Iniciar con el Mac'
    return 'Iniciar al encender el PC'

_temp_files = []

def _cleanup_temp_files():
    for f in _temp_files:
        try:
            if os.path.exists(f):
                os.unlink(f)
        except Exception:
            pass
    _temp_files.clear()

atexit.register(_cleanup_temp_files)

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Max-Age'] = '3600'
    return response

DEFAULT_PRINTER = None

def get_printers_mac():
    try:
        result = subprocess.run(['lpstat', '-p'], capture_output=True, text=True, timeout=5)
        printers = []
        for line in result.stdout.strip().split('\n'):
            if 'printer' in line and 'is' in line:
                name = line.split()[1] if line.split() else ''
                if name:
                    printers.append(name)
        return printers
    except Exception:
        return []

def get_printers_win():
    try:
        import win32print
        printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_SHARED)]
        return printers
    except ImportError:
        return []

def get_printers():
    if IS_MAC:
        return get_printers_mac()
    elif IS_WINDOWS:
        return get_printers_win()
    return []

def get_default_printer():
    global DEFAULT_PRINTER
    if DEFAULT_PRINTER:
        return DEFAULT_PRINTER

    if IS_MAC:
        printers = get_printers_mac()
        for name in printers:
            lower = name.lower()
            if any(k in lower for k in ['thermal', 'pos', 'epson', 'xprinter', 'bixolon', 'star']):
                DEFAULT_PRINTER = name
                logger.info(f"Auto-detected Mac printer: {name}")
                return name
        if printers:
            DEFAULT_PRINTER = printers[0]
            logger.info(f"Using first Mac printer: {DEFAULT_PRINTER}")
    elif IS_WINDOWS:
        try:
            import win32print
            for printer_info in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_SHARED):
                name = printer_info[2]
                if any(k in name.lower() for k in ['thermal', 'pos', 'epson', 'xprinter', 'bixolon', 'star']):
                    DEFAULT_PRINTER = name
                    logger.info(f"Auto-detected Windows printer: {name}")
                    return name
            printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_SHARED)]
            if printers:
                DEFAULT_PRINTER = printers[0]
                logger.info(f"Using first Windows printer: {DEFAULT_PRINTER}")
        except ImportError:
            pass

    return DEFAULT_PRINTER

def print_mac(printer_name, escpos_data):
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as f:
            f.write(escpos_data)
            temp_path = f.name
        _temp_files.append(temp_path)

        result = subprocess.run(
            ['lp', '-o', 'raw', '-d', printer_name, temp_path],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            logger.error(f"lp error: {result.stderr.strip()}")
            return False
        logger.info(f"Mac: Receipt printed on {printer_name}")
        return True
    except subprocess.TimeoutExpired:
        logger.error(f"lp command timed out for {printer_name}")
        return False
    except Exception as e:
        logger.error(f"Mac print error: {str(e)}")
        return False
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
                _temp_files.remove(temp_path)
            except Exception:
                pass

def print_win(printer_name, escpos_data):
    import win32print
    hPrinter = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(hPrinter, 1, ("FoodHub Receipt", None, "RAW"))
        win32print.StartPagePrinter(hPrinter)
        win32print.WritePrinter(hPrinter, escpos_data)
        win32print.EndPagePrinter(hPrinter)
        win32print.EndDocPrinter(hPrinter)
        logger.info(f"Windows: Receipt printed on {printer_name}")
        return True
    finally:
        win32print.ClosePrinter(hPrinter)

def print_receipt(printer_name, order_data, organization_data):
    if printer_name and printer_name.startswith(SIMULATOR_NAME):
        return print_simulated(printer_name, order_data, organization_data)
    escpos_data = format_receipt(order_data, organization_data)
    if IS_MAC:
        return print_mac(printer_name, escpos_data)
    elif IS_WINDOWS:
        return print_win(printer_name, escpos_data)
    else:
        logger.error("Unsupported platform")
        return False

SIMULATOR_NAME = 'FoodHub Simulador (PDF)'
_last_simulated_pdf = None


def print_simulated(printer_name, order_data, organization_data):
    global _last_simulated_pdf
    try:
        from fpdf import FPDF
        pdf = FPDF(unit='mm', format=(80, 190))
        pdf.set_auto_page_break(False)
        pdf.add_page()
        pdf.set_left_margin(4)
        pdf.set_right_margin(4)

        C = (33, 33, 33)
        G = (107, 114, 128)

        pdf.set_font('Helvetica', 'B', 12)
        pdf.set_text_color(*C)
        pdf.cell(0, 5, str(organization_data.get('name', '')).upper(), ln=1, align='C')

        pdf.set_font('Helvetica', '', 8)
        pdf.set_text_color(*G)
        addr = organization_data.get('address', '')
        phone = organization_data.get('phone', '')
        if addr:
            pdf.cell(0, 4, str(addr), ln=1, align='C')
        if phone:
            pdf.cell(0, 4, 'Tel: ' + str(phone), ln=1, align='C')
        if not addr and not phone:
            pdf.ln(2)

        pdf.ln(1)
        pdf.line(4, pdf.get_y(), 76, pdf.get_y())
        pdf.ln(1)

        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(*C)
        pdf.cell(0, 5, "Ticket: #" + str(order_data.get('order_number', '')), ln=1, align='C')
        pdf.ln(1.5)

        pdf.set_font('Helvetica', '', 8.5)
        pdf.set_text_color(*C)
        rows = [
            ('Fecha', order_data.get('order_date', '')),
            ('Mesa', order_data.get('table_name', '')),
            ('Cliente', order_data.get('customer_name', '')),
        ]
        for label, value in rows:
            if value:
                pdf.cell(22, 4, label + ':', ln=0)
                pdf.cell(0, 4, str(value), ln=1, align='R')

        pdf.ln(1)
        pdf.set_font('Helvetica', 'B', 7.5)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(42, 4, 'Articulo', border='B', fill=True, ln=0)
        pdf.cell(8, 4, 'Cant', border='B', fill=True, ln=0, align='C')
        pdf.cell(12, 4, 'P.U.', border='B', fill=True, ln=0, align='R')
        pdf.cell(14, 4, 'SubT', border='B', fill=True, ln=1, align='R')

        pdf.set_font('Helvetica', '', 8.5)
        total = float(order_data.get('total', 0) or 0)
        for item in order_data.get('items', []):
            name = item.get('name', '')
            qty = item.get('quantity', 1)
            unit = float(item.get('price', 0) or 0)
            subt = qty * unit
            y0 = pdf.get_y()
            pdf.cell(42, 4, str(name)[:42], ln=0)
            pdf.cell(8, 4, str(qty), ln=0, align='C')
            pdf.cell(12, 4, f"{unit:,.0f}", ln=0, align='R')
            pdf.cell(14, 4, f"{subt:,.0f}", ln=1, align='R')

        pdf.ln(1)
        pdf.line(4, pdf.get_y(), 76, pdf.get_y())
        pdf.ln(1)

        subtotal = float(order_data.get('subtotal', 0) or 0)
        tax = float(order_data.get('tax', 0) or 0)
        for label, value in (('Subtotal', subtotal), ('IVA', tax), ('TOTAL', total)):
            bold = label == 'TOTAL'
            pdf.set_font('Helvetica', 'B' if bold else '', 10 if bold else 8.5)
            pdf.set_text_color(*C)
            pdf.cell(50, 5, label, ln=0)
            pdf.cell(26, 5, f"${value:,.0f}", ln=1, align='R')

        pdf.ln(1)
        pdf.set_font('Helvetica', 'B', 8)
        footer = organization_data.get('footer', '')
        message = organization_data.get('message', '')
        pdf.set_text_color(*C)
        if footer:
            pdf.cell(0, 4, str(footer), ln=1, align='C')
        if message:
            pdf.cell(0, 4, str(message), ln=1, align='C')
        pdf.ln(1)
        pdf.set_font('Helvetica', '', 6.5)
        pdf.set_text_color(*G)
        pdf.cell(0, 3, 'Ticket generado por FoodHub POS', ln=1, align='C')

        ticket_no = str(order_data.get('order_number', ''))
        safe_no = ''.join(c for c in ticket_no if c.isalnum() or c in '-_') or 'ticket'
        downloads = os.path.join(os.path.expanduser('~'), 'Downloads')
        os.makedirs(downloads, exist_ok=True)
        out_path = os.path.join(downloads, f'FoodHub-Ticket-{safe_no}.pdf')
        pdf.output(out_path)
        _last_simulated_pdf = out_path
        logger.info(f"Simulador: ticket guardado en {out_path}")
        return True
    except Exception as e:
        logger.error(f"Error en simulador: {str(e)}")
        return False

@app.route('/print', methods=['POST'])
def print_receipt_api():
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        order_data = {
            'order_number': data.get('order_number', ''),
            'order_date': data.get('order_date', ''),
            'table_name': data.get('table_name', ''),
            'customer_name': data.get('customer_name', ''),
            'items': data.get('items', []),
            'subtotal': data.get('subtotal', 0),
            'tax': data.get('tax', 0),
            'total': data.get('total', 0),
        }
        organization_data = {
            'name': data.get('store_name', ''),
            'address': data.get('store_address', ''),
            'phone': data.get('store_phone', ''),
            'footer': data.get('store_footer', '¡Gracias por su compra!'),
            'message': data.get('store_message', ''),
        }

        printer_name = data.get('printer_name') or get_default_printer()
        if not printer_name:
            return jsonify({'error': 'No printer configured'}), 500

        success = print_receipt(printer_name, order_data, organization_data)
        if not success:
            return jsonify({'error': 'Print failed'}), 500

        simulated = bool(printer_name and printer_name.startswith(SIMULATOR_NAME))
        response = {'success': True, 'printer': printer_name}
        if simulated and _last_simulated_pdf:
            response['simulated'] = True
            response['pdf_path'] = _last_simulated_pdf
        return jsonify(response)

    except Exception as e:
        logger.error(f"Print error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/printers', methods=['GET'])
def list_printers():
    try:
        printers = get_printers()
        if SIMULATOR_NAME not in printers:
            printers = [SIMULATOR_NAME] + printers
        return jsonify({'printers': printers})
    except Exception as e:
        logger.error(f"Error listing printers: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/last-ticket', methods=['GET'])
def last_ticket():
    if _last_simulated_pdf and os.path.exists(_last_simulated_pdf):
        return send_file(_last_simulated_pdf, mimetype='application/pdf',
                         as_attachment=False, download_name=os.path.basename(_last_simulated_pdf))
    return jsonify({'error': 'Aun no hay un ticket simulado'}), 404

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'platform': platform.system(), 'printer': get_default_printer()})

@app.route('/autostart', methods=['GET', 'POST'])
def autostart():
    if request.method == 'POST':
        body = request.get_json(silent=True) or {}
        ok = set_autostart(bool(body.get('enabled')))
        if not ok:
            return jsonify({'error': 'No se pudo cambiar el inicio automatico'}), 500
        return jsonify({'enabled': is_autostart_enabled()})
    return jsonify({'enabled': is_autostart_enabled()})

@app.route('/', methods=['GET'])
def status_page():
    try:
        printers = get_printers()
        default = printer_default = None
        try:
            default = get_default_printer()
        except Exception:
            default = None
        printer_rows = ''.join(
            f'<li>{p} {"<strong>(predeterminada)</strong>" if p == default else ""}</li>' for p in printers
        )
        if _last_simulated_pdf and os.path.exists(_last_simulated_pdf):
            LAST_TICKET_LINK = ('<p><a href="/last-ticket" target="_blank" style="color:#2563eb;font-weight:700">'
                                'Ver &uacute;ltimo ticket simulado (PDF)</a></p>')
        else:
            LAST_TICKET_LINK = '<p style="color:#9ca3af">Sin tickets simulados aun</p>'
        STATUS_JS = '''<script>
  fetch('/autostart').then(function(r){return r.json();}).then(function(d){document.getElementById('autostart').checked=d.enabled;});
  document.getElementById('autostart').addEventListener('change', async function(){
    const d = await fetch('/autostart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:this.checked})}).then(r=>r.json());
    document.getElementById('autostart-msg').innerHTML = d.enabled ? 'Se iniciar automáticamente al encender el equipo.' : 'Autostart desactivado.';
  });
</script>'''
        return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>FoodHub POS - Print Server</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{{font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}}
  .card{{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;max-width:420px;width:100%;box-shadow:0 4px 12px rgba(0,0,0,.06)}}
  .dot{{display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;margin-right:6px;animation:pulse 2s infinite}}
  @keyframes pulse{{0%,100%{{opacity:1}}50%{{opacity:.3}}}}
  h1{{font-size:20px;margin:0 0 4px}} p{{color:#374151;margin:6px 0;font-size:14px}}
  .ok{{color:#059669;font-weight:700}} ul{{padding-left:18px;color:#374151;font-size:14px}}
</style>
</head><body><div class="card">
  <h1><span class="dot"></span>FoodHub POS Print Server</h1>
  <p class="ok">Conectado correctamente</p>
  <p>Sistema: <strong>{platform.system()}</strong> &middot; Puerto <strong>8088</strong></p>
  {LAST_TICKET_LINK}
  <p>Impresora predeterminada: <strong>{default or 'No detectada'}</strong></p>
  <p>Impresoras detectadas:</p><ul>{printer_rows or '<li>Ninguna</li>'}</ul>
  <p style="margin-top:16px;padding:10px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;display:flex;align-items:center;gap:10px">
    <input type="checkbox" id="autostart" style="width:18px;height:18px">
    <label for="autostart" style="font-weight:600;cursor:pointer">Iniciar autom&aacute;ticamente al encender el PC</label>
  </p>
  <p id="autostart-msg" style="font-size:13px"></p>
</div>
{STATUS_JS}</body></html>"""
    except Exception as e:
        logger.error(f"Error en página de estado: {str(e)}")
        return '<p>Error generando estado</p>', 500

@app.route('/test', methods=['POST'])
def test_print():
    try:
        test_order = {
            'store_name': 'FoodHub POS',
            'store_address': 'Calle Principal 123',
            'store_phone': '+56 9 1234 5678',
            'order_number': 'TEST-001',
            'order_date': '2026-09-04 14:30',
            'table_name': 'Mesa 5',
            'customer_name': 'Cliente Prueba',
            'items': [
                {'name': 'Item Prueba 1', 'quantity': 2, 'price': 1000},
                {'name': 'Item Prueba 2', 'quantity': 1, 'price': 2500},
            ],
            'subtotal': 2000,
            'tax': 360,
            'total': 2360,
            'store_footer': '¡Gracias por su compra!',
            'store_message': 'Vuelva pronto'
        }

        printer_name = request.json.get('printer_name') if request.json else None
        printer_name = printer_name or get_default_printer()

        if not printer_name:
            return jsonify({'error': 'No printer configured'}), 500

        success = print_receipt(printer_name, test_order, {})
        return jsonify({'success': success, 'printer': printer_name})
    except Exception as e:
        logger.error(f"Test print error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────
# Icono de barra de tareas / menú (Windows + macOS)
# Desactivable con la variable FOODHUB_NO_TRAY=1
# ─────────────────────────────────────────────
TRAY_AVAILABLE = False
try:
    import pystray
    from PIL import Image, ImageDraw, ImageFont
    TRAY_AVAILABLE = True
except Exception as e:
    logger.info(f"pystray/Pillow no disponibles, sin icono de barra: {e}")

_server = None
_icon = None
_stop = threading.Event()


def stop_server(icon=None, item=None):
    logger.info("Deteniendo servidor desde la barra de tareas...")
    _stop.set()
    if _icon is not None:
        try:
            _icon.stop()
        except Exception:
            pass
    if _server is not None:
        try:
            _server.close()
        except Exception:
            pass


def _tray_open_status(icon=None, item=None):
    webbrowser.open('http://localhost:8088/')


def _tray_test_print(icon=None, item=None):
    try:
        printer = get_default_printer()
        if not printer:
            printers = get_printers()
            printer = printers[0] if printers else None
        if not printer:
            logger.warning("Sin impresora configurada para la prueba")
            return
        test_order = {
            'store_name': 'FoodHub POS',
            'store_address': 'Calle Principal 123',
            'store_phone': '+56 9 1234 5678',
            'order_number': 'TEST-TRAY',
            'order_date': time.strftime('%d/%m/%Y %H:%M'),
            'table_name': '',
            'customer_name': 'Ticket de prueba',
            'items': [
                {'name': 'Item Prueba 1', 'quantity': 1, 'price': 1000},
                {'name': 'Item Prueba 2', 'quantity': 1, 'price': 2500},
            ],
            'subtotal': 3500,
            'tax': 0,
            'total': 3500,
            'store_footer': '¡Gracias por su compra!',
            'store_message': 'FoodHub POS',
        }
        print_receipt(printer, test_order, {})
    except Exception as e:
        logger.error(f"Error en prueba desde la barra: {str(e)}")


def _tray_image():
    size = 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([3, 3, size - 3, size - 3], fill=(16, 185, 129, 255))
    font = None
    for path in ('/System/Library/Fonts/SFNS.ttf',
                 '/System/Library/Fonts/Supplemental/Arial.ttf',
                 'C:/Windows/Fonts/arial.ttf',
                 'arial.ttf'):
        try:
            font = ImageFont.truetype(path, 30)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    draw.text((size / 2, size / 2), 'FH', fill=(255, 255, 255, 255), font=font, anchor='mm')
    return img


def start_tray():
    global _icon
    if not TRAY_AVAILABLE:
        logger.error("ICONO NO DISPONIBLE: falta pystray/Pillow")
        print('AVISO: No se pudo cargar pystray/Pillow. Instala: pip install pystray Pillow')
        return
    if os.environ.get('FOODHUB_NO_TRAY'):
        logger.info("Icono de barra desactivado (FOODHUB_NO_TRAY=1)")
        return
    try:
        menu = pystray.Menu(
            pystray.MenuItem('FoodHub POS Print Server', None, enabled=False),
            pystray.MenuItem('Ver estado', _tray_open_status),
            pystray.MenuItem('Imprimir prueba', _tray_test_print),
            pystray.MenuItem(_autostart_label(), _toggle_autostart, checked=_autostart_checked),
            pystray.MenuItem('Salir', stop_server),
        )
        _icon = pystray.Icon(
            'foodhub-pos',
            _tray_image(),
            'FoodHub POS - Conectado',
            menu,
        )
        logger.info("Icono de barra de tareas iniciado")
        print('ICONO DE BARRA ACTIVO - revisa la bandeja del sistema (suele estar tras la flecha ^).')
        _icon.run()
    except Exception as e:
        _icon = None
        logger.error(f"No se pudo iniciar el icono de barra:\n{traceback.format_exc()}")
        print(f"ERROR iniciando el icono: {e}")
        print("El servidor sigue corriendo en segundo plano. Puedes cerrar esta ventana para detenerlo.")


if __name__ == '__main__':
    from waitress import create_server

    try:
        _server = create_server(app, host='127.0.0.1', port=8088)
    except Exception as e:
        logger.error(f"No se pudo iniciar el servidor (puerto 8088 ocupado):\n{traceback.format_exc()}")
        print('ERROR: No se pudo iniciar el servidor en el puerto 8088.')
        print(f'Detalle: {e}')
        print('Revisa si ya hay otra instancia abierta ejecutandose.')
        os.system('pause')
        sys.exit(1)

    threading.Thread(target=_server.run, daemon=True).start()
    logger.info(f"FoodHub POS Print Server ({platform.system()}) en http://localhost:8088")

    if TRAY_AVAILABLE and not os.environ.get('FOODHUB_NO_TRAY'):
        start_tray()  # bloquea hasta "Salir"
    if not _stop.is_set():
        # Sin icono (o terminado de forma anómala): mantener el servidor vivo
        _stop.wait()
