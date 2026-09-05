import os
import sys

# ESC/POS commands for generic thermal printers
PRINTER_INIT = b'\x1B\x40'
ALIGN_LEFT = b'\x1B\x61\x00'
ALIGN_CENTER = b'\x1B\x61\x01'
ALIGN_RIGHT = b'\x1B\x61\x02'
BOLD_ON = b'\x1B\x45\x01'
BOLD_OFF = b'\x1B\x45\x00'
UNDERLINE_ON = b'\x1B\x2D\x01'
UNDERLINE_OFF = b'\x1B\x2D\x00'
FEED_LINES = lambda n: b'\x1B\x64' + bytes([n])
CUT_PAPER = b'\x1B\x69\x00'
CASH_DRAWER = b'\x1B\x70\x00\x32\x06'

def encode_text(text):
    result = b''
    for char in text:
        if ord(char) < 128:
            result += char.encode('latin-1')
        elif char == 'ñ':
            result += b'\xF1'
        elif char == 'Ñ':
            result += b'\xD1'
        elif char == 'á':
            result += b'\xE1'
        elif char == 'é':
            result += b'\xE9'
        elif char == 'í':
            result += b'\xED'
        elif char == 'ó':
            result += b'\xF3'
        elif char == 'ú':
            result += b'\xFA'
        elif char == 'ü':
            result += b'\xFC'
        else:
            result += char.encode('utf-8', errors='replace')
    return result

def set_text_size(width, height):
    if width > 1 or height > 1:
        return b'\x1D\x21' + bytes([(width - 1) | ((height - 1) << 2)])
    return b'\x1D\x21\x00'

def format_receipt(order_data, organization_data=None):
    org = organization_data or {}
    buffer = bytearray()
    
    buffer += PRINTER_INIT
    buffer += FEED_LINES(2)
    
    # Header - centered
    buffer += ALIGN_CENTER
    buffer += BOLD_ON
    
    # Store name from organization_data
    store_name = org.get('name', order_data.get('store_name', 'Tienda'))
    store_address = org.get('address', order_data.get('store_address', ''))
    store_phone = org.get('phone', order_data.get('store_phone', ''))
    store_footer = org.get('footer', order_data.get('store_footer', '¡Gracias por su compra!'))
    store_message = org.get('message', order_data.get('store_message', ''))
    
    store_name = store_name.upper()
    buffer += encode_text(store_name) + b'\n'
    buffer += encode_text(store_address) + b'\n'
    buffer += encode_text(f"Tel: {store_phone}") + b'\n'
    
    buffer += BOLD_OFF
    buffer += encode_text('-' * 40) + b'\n'
    
    # Order info
    buffer += ALIGN_LEFT
    buffer += encode_text(f"Ticket: #{order_data.get('order_number', 'N/A')}") + b'\n'
    buffer += encode_text(f"Fecha: {order_data.get('order_date', '')}") + b'\n'
    buffer += encode_text(f"Mesa: {order_data.get('table_name', '')}") + b'\n'
    buffer += encode_text(f"Cliente: {order_data.get('customer_name', '')}") + b'\n'
    buffer += encode_text('-' * 40) + b'\n'
    
    # Items header
    buffer += BOLD_ON
    buffer += encode_text(f"{'Artículo':<20} {'Cant':>5} {'P.U.':>8} {'SubT':>8}") + b'\n'
    buffer += encode_text('-' * 40) + b'\n'
    buffer += BOLD_OFF
    
    # Items
    items = order_data.get('items', [])
    for item in items:
        name = item.get('name', 'Item')[:20]
        qty = item.get('quantity', 1)
        price = item.get('price', 0)
        subtotal = qty * price
        line = f"{name:<20} {qty:>5} {price:>8.2f} {subtotal:>8.2f}"
        buffer += encode_text(line) + b'\n'
    
    buffer += encode_text('-' * 40) + b'\n'
    
    # Totals
    buffer += ALIGN_RIGHT
    buffer += BOLD_ON
    total = order_data.get('total', 0)
    subtotal = order_data.get('subtotal', total)
    tax = order_data.get('tax', 0)
    buffer += encode_text(f"Subtotal:  ${subtotal:>8.2f}") + b'\n'
    if tax > 0:
        buffer += encode_text(f"Impuesto:  ${tax:>8.2f}") + b'\n'
    buffer += encode_text(f"TOTAL:    ${total:>8.2f}") + b'\n'
    buffer += BOLD_OFF
    
    # Footer
    buffer += FEED_LINES(2)
    buffer += ALIGN_CENTER
    buffer += encode_text(store_footer) + b'\n'
    buffer += encode_text(store_message) + b'\n'
    buffer += encode_text('-' * 40) + b'\n'
    buffer += encode_text('Ticket generado por FoodHub POS') + b'\n'
    
    buffer += FEED_LINES(3)
    buffer += CUT_PAPER
    
    return bytes(buffer)


if __name__ == '__main__':
    # Quick test
    test_order = {
        'store_name': 'Pizza Nostra',
        'store_address': 'Calle Principal 123',
        'store_phone': '+56 9 1234 5678',
        'order_number': '001',
        'order_date': '2026-09-04 14:30',
        'table_name': 'Mesa 5',
        'customer_name': 'Juan Pérez',
        'items': [
            {'name': 'Pizza Margarita', 'quantity': 2, 'price': 8500},
            {'name': 'Coca Cola 500ml', 'quantity': 1, 'price': 1500},
        ],
        'subtotal': 18500,
        'tax': 3330,
        'total': 21830,
        'store_footer': '¡Gracias por su compra!',
        'store_message': 'Vuelva pronto'
    }
    data = format_receipt(test_order)
    print(f"Generated {len(data)} bytes of ESC/POS commands")
    print(f"First 20 bytes: {data[:20].hex()}")
