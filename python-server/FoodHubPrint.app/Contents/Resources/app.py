import os
import sys
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

IS_WINDOWS = platform.system() == 'Windows'
IS_MAC = platform.system() == 'Darwin'

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
    escpos_data = format_receipt(order_data, organization_data)
    if IS_MAC:
        return print_mac(printer_name, escpos_data)
    elif IS_WINDOWS:
        return print_win(printer_name, escpos_data)
    else:
        logger.error("Unsupported platform")
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

        return jsonify({'success': True, 'printer': printer_name})

    except Exception as e:
        logger.error(f"Print error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/printers', methods=['GET'])
def list_printers():
    try:
        printers = get_printers()
        return jsonify({'printers': printers})
    except Exception as e:
        logger.error(f"Error listing printers: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'platform': platform.system(), 'printer': get_default_printer()})

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

if __name__ == '__main__':
    from waitress import serve
    logger.info(f"Starting FoodHub POS Print Server ({platform.system()}) on http://localhost:8088")
    serve(app, host='127.0.0.1', port=8088)
    from waitress import serve
    logger.info(f"Starting FoodHub POS Print Server ({platform.system()}) on http://localhost:8088")
    serve(app, host='127.0.0.1', port=8088)
