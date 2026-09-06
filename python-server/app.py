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

try:
    from PIL import Image as PILImage
    from PIL import ImageOps as PILImageOps
except Exception:
    PILImage = None
    PILImageOps = None

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

def _png_base64_to_raster(png_data_url, width_dots=576):
    raw = base64.b64decode(png_data_url.split(',', 1)[-1])
    img = PILImage.open(io.BytesIO(raw)).convert('L')
    if img.width != width_dots:
        ratio = width_dots / float(img.width)
        img = img.resize((width_dots, max(1, int(img.height * ratio))), PILImage.LANCZOS)
    img = img.point(lambda p: 255 if p > 200 else 0).convert('1')
    width = img.width
    bytes_per_row = (width + 7) // 8
    height = img.height
    px = img.load()
    rows = bytearray(bytes_per_row * height)
    for y in range(height):
        base = y * bytes_per_row
        for x in range(width):
            if px[x, y] == 0:
                rows[base + x // 8] |= 0x80 >> (x % 8)
    out = bytearray()
    out += b'\x1b\x40'
    out += b'\x1d\x76\x30\x30'
    out += bytes([bytes_per_row & 0xFF, (bytes_per_row >> 8) & 0xFF])
    out += bytes([height & 0xFF, (height >> 8) & 0xFF])
    out += bytes(rows)
    out += b'\x1b\x64' + bytes([3])
    out += b'\x1bi\x00'
    return bytes(out)


LAST_PRINT_MODE = 'texto'


def print_receipt(printer_name, order_data, organization_data, image_data_url=None, image_width=576):
    global LAST_PRINT_MODE
    if printer_name and printer_name.startswith(SIMULATOR_NAME):
        LAST_PRINT_MODE = 'simulador'
        return print_simulated(printer_name, order_data, organization_data)
    if image_data_url and PILImage:
        try:
            raster = _png_base64_to_raster(image_data_url, int(image_width or 576))
            ok = (print_mac if IS_MAC else print_win)(printer_name, raster)
            if ok:
                logger.info(f"Raster (HTML -> bit-image) impreso en {printer_name}")
                LAST_PRINT_MODE = 'raster'
                return True
            logger.warning("Raster devolvió fallo, usando formato texto")
        except Exception as e:
            logger.warning(f"Raster falló ({str(e)[:120]}) — usando formato texto")
    escpos_data = format_receipt(order_data, organization_data)
    if IS_MAC:
        ok = print_mac(printer_name, escpos_data)
    elif IS_WINDOWS:
        ok = print_win(printer_name, escpos_data)
    else:
        logger.error("Unsupported platform")
        ok = False
    LAST_PRINT_MODE = 'texto' if ok else 'error'
    return ok

SIMULATOR_NAME = 'FoodHub Simulador (PDF)'
_last_simulated_pdf = None


def _money(value):
    try:
        return f"${float(value or 0):,.0f}"
    except (TypeError, ValueError):
        return '$0'


def print_simulated(printer_name, order_data, organization_data):
    global _last_simulated_pdf
    try:
        from fpdf import FPDF
        from fpdf.enums import XPos, YPos
        pdf = FPDF(unit='mm', format=(80, 230))
        pdf.set_auto_page_break(False)
        pdf.add_page()
        pdf.set_left_margin(4)
        pdf.set_right_margin(4)

        C = (33, 33, 33)
        G = (107, 114, 128)
        W = 72.0

        def dashed(y=None):
            pdf.set_dash_pattern(1.2, 1.2)
            pdf.line(4, (y if y is not None else pdf.get_y()), 4 + W, (y if y is not None else pdf.get_y()))
            pdf.set_dash_pattern()

        def solid(y=None):
            pdf.set_line_width(0.5)
            pdf.line(4, (y if y is not None else pdf.get_y()), 4 + W, (y if y is not None else pdf.get_y()))
            pdf.set_line_width(0.2)

        ot = str(order_data.get('order_type', '') or '').lower()
        dt = str(order_data.get('delivery_type', '') or '').lower()
        actual = dt if ot in ('online', 'whatsapp') else ot
        type_label = {'delivery': 'DELIVERY', 'pickup': 'RETIRO EN LOCAL', 'table': 'MESA'}.get(actual, actual.upper())

        # ── Tipo de pedido ─────────────────────────────────────
        if type_label:
            pdf.set_text_color(*C)
            pdf.set_font('Helvetica', 'B', 11)
            y0 = pdf.get_y()
            pdf.ln(2.5)
            dashed(y0 + 1.2)
            pdf.ln(1)
            pdf.cell(0, 6, type_label, ln=1, align='C')
            dashed()
            pdf.ln(2)

        # ── Recuadro negro del título (igual que la web) ────
        name = str(organization_data.get('name', '')).upper()
        pdf.set_fill_color(0, 0, 0)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font('Helvetica', 'B', 11)
        pdf.cell(W, 9, str(name), ln=1, align='C', fill=True)
        pdf.set_text_color(*C)
        pdf.ln(1.5)
        solid()
        pdf.ln(2)

        # ── Número de pedido grande + fecha ─────────────────
        _num = str(order_data.get('order_number', ''))
        if _num and not _num.startswith('#'):
            _num = '#' + _num
        pdf.set_font('Helvetica', 'B', 30)
        pdf.cell(0, 13, _num, ln=1, align='C')
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(*C)
        if order_data.get('order_date'):
            pdf.cell(0, 4, str(order_data.get('order_date', '')), ln=1, align='C')
        pdf.ln(1.5)
        dashed()
        pdf.ln(2)

        pdf.set_font('Helvetica', '', 8.5)
        if order_data.get('customer_name') or order_data.get('customer_phone'):
            pdf.set_font('Helvetica', 'B', 8)
            pdf.cell(0, 4, 'DATOS DEL CLIENTE', ln=1)
            pdf.set_font('Helvetica', '', 8.5)
            if order_data.get('customer_name'):
                pdf.set_font('Helvetica', 'B', 8.5)
                pdf.cell(0, 4, str(order_data.get('customer_name', '')).upper(), ln=1)
                pdf.set_font('Helvetica', '', 8.5)
            if order_data.get('customer_phone'):
                pdf.cell(0, 4, 'Tel: ' + str(order_data.get('customer_phone', '')), ln=1)
            pdf.ln(1.5)

        if order_data.get('notes'):
            pdf.set_font('Helvetica', 'B', 8)
            pdf.cell(0, 4, 'COMENTARIOS', ln=1)
            pdf.set_font('Helvetica', 'B', 8.5)
            pdf.set_fill_color(243, 244, 246)
            pdf.set_text_color(*C)
            _note_lines = str(order_data.get('notes', '')).upper()
            pdf.multi_cell(W, 5, _note_lines, fill=True, ln=1)
            pdf.ln(1.5)

        # ── Ítems ─────────────────────────────────────────────
        raw_items = order_data.get('order_items') or order_data.get('items', [])
        parents = [i for i in raw_items if not i.get('parent_item_id')] if raw_items else raw_items

        pdf.set_font('Helvetica', 'B', 8)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(12, 4, 'Cant', border='B', fill=True, ln=0)
        pdf.cell(42, 4, 'Descripción', border='B', fill=True, ln=0)
        pdf.cell(18, 4, 'Total', border='B', fill=True, ln=1, align='R')

        pdf.set_font('Helvetica', '', 8.5)
        for item in parents:
            _qty = float(item.get('quantity', 1) or 1)
            _unit = float(item.get('price') or item.get('unit_price') or 0)
            _name = str(item.get('name') or item.get('product_name') or 'Item')
            _row_start = pdf.get_y()
            pdf.set_x(4)
            pdf.set_font('Helvetica', 'B', 8.5)
            pdf.cell(12, 4, f"{_qty:g}x", ln=0)
            pdf.set_font('Helvetica', 'B', 9)
            pdf.multi_cell(42, 4, _name, new_x=XPos.RIGHT, new_y=YPos.TOP)
            _name_bottom = pdf.get_y()
            pdf.set_font('Helvetica', '', 8.5)
            pdf.set_xy(58, _row_start)
            pdf.cell(18, 4, _money(_unit * _qty), ln=0, align='R')
            pdf.set_xy(4, max(_name_bottom, _row_start + 4))
            for v in item.get('order_item_variants', []) or []:
                pdf.cell(0, 4, '- ' + str(v.get('variant_option_name', '')), ln=1)
            for ing in item.get('order_item_ingredients', []) or []:
                _line = '+ ' + str(ing.get('ingredient_name', ''))
                if float(ing.get('price', 0) or 0) > 0:
                    _line += f" (+{_money(ing.get('price'))})"
                pdf.set_x(4)
                pdf.multi_cell(W - 6, 4, _line)
            for child in raw_items:
                if child.get('parent_item_id') != item.get('id'):
                    continue
                cq = float(child.get('quantity', 0) or 0) / (_qty or 1)
                cline = f"    {cq:g}x {str(child.get('product_name', ''))}"
                for cv in child.get('order_item_variants', []) or []:
                    cline += f" ({str(cv.get('variant_option_name', ''))})"
                pdf.set_font('Helvetica', '', 8.5)
                pdf.set_x(4)
                pdf.multi_cell(0, 4, cline)

        pdf.ln(1)
        dashed()
        pdf.ln(2)

        # ── Totales (subtotal = total - despacho, como la web) ─
        _dev = float(order_data.get('delivery_fee', 0) or 0)
        _total = float(order_data.get('total', 0) or 0)
        _subtotal = max(_total - _dev, 0)
        pdf.set_font('Helvetica', '', 8.5)
        pdf.cell(46, 5, 'Subtotal', ln=0)
        pdf.cell(26, 5, _money(_subtotal), ln=1, align='R')
        if _dev > 0:
            pdf.cell(46, 5, 'Despacho', ln=0)
            pdf.cell(26, 5, _money(_dev), ln=1, align='R')
        pdf.ln(1)
        solid()
        pdf.ln(2)
        pdf.set_font('Helvetica', 'B', 16)
        pdf.cell(46, 10, 'TOTAL', ln=0)
        pdf.cell(26, 10, _money(_total), ln=1, align='R')

        pdf.ln(2)
        dashed()
        pdf.ln(2)

        if not order_data.get('is_paid', True):
            pdf.set_text_color(255, 255, 255)
            pdf.set_fill_color(0, 0, 0)
            pdf.set_font('Helvetica', 'B', 11)
            pdf.cell(0, 7, 'NO PAGADO', ln=1, align='C', fill=True)
            pdf.cell(0, 7, 'COBRAR AL CLIENTE', ln=1, align='C', fill=True)
            pdf.set_text_color(*C)
            pdf.ln(2)

        if order_data.get('payment_display'):
            pdf.set_font('Helvetica', 'B', 8.5)
            pdf.cell(0, 4, str(order_data.get('payment_display', '')), ln=1, align='C')
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 6, '¡Gracias por preferirnos!', ln=1, align='C')
        pdf.set_font('Helvetica', '', 6)
        pdf.set_text_color(*G)
        pdf.cell(0, 2, '', ln=1)
        pdf.cell(0, 2, '- - - - - - - - - - - - - - - -', ln=1, align='C')
        pdf.cell(0, 3, 'P O W E R E D   B Y   F O O D H U B   P O S', ln=1, align='C')

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
            'order_type': data.get('order_type', ''),
            'delivery_type': data.get('delivery_type', ''),
            'table_name': data.get('table_name', ''),
            'customer_name': data.get('customer_name', ''),
            'customer_phone': data.get('customer_phone', ''),
            'delivery_address': data.get('delivery_address', ''),
            'notes': data.get('notes', ''),
            'items': data.get('items', []),
            'order_items': data.get('order_items') or data.get('items', []),
            'subtotal': data.get('subtotal', 0),
            'tax': data.get('tax', 0),
            'delivery_fee': data.get('delivery_fee', 0),
            'total': data.get('total', 0),
            'payments': data.get('payments', []),
            'is_paid': data.get('is_paid', True),
            'payment_display': data.get('payment_display', ''),
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

        success = print_receipt(printer_name, order_data, organization_data,
                                image_data_url=data.get('image'), image_width=data.get('image_width', 576))
        if not success:
            return jsonify({'error': 'Print failed'}), 500

        simulated = bool(printer_name and printer_name.startswith(SIMULATOR_NAME))
        response = {'success': True, 'printer': printer_name, 'mode': LAST_PRINT_MODE}
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
