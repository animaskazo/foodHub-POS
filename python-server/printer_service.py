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
INVERT_ON = b'\x1D\x42\x01'
INVERT_OFF = b'\x1D\x42\x00'
FEED_LINES = lambda n: b'\x1B\x64' + bytes([n])
CUT_PAPER = b'\x1B\x69\x00'
CASH_DRAWER = b'\x1B\x70\x00\x32\x06'

WIDTH = 40
DASHED = '-' * WIDTH
SOLID = '=' * WIDTH

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


def _wrap(text, width):
    text = str(text)
    if len(text) <= width:
        return [text]
    words = text.split(' ')
    lines, cur = [], ''
    for word in words:
        if len(cur) + (1 if cur else 0) + len(word) <= width:
            cur = cur + (' ' if cur else '') + word
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or ['']


def _money(value):
    try:
        return f"${float(value or 0):,.0f}"
    except (TypeError, ValueError):
        return '$0'


def _order_type_label(order_data):
    ot = str(order_data.get('order_type', '') or '').lower()
    dt = str(order_data.get('delivery_type', '') or '').lower()
    actual = dt if ot in ('online', 'whatsapp') else ot
    labels = {'delivery': 'DELIVERY', 'pickup': 'RETIRO EN LOCAL', 'table': 'MESA'}
    if actual in labels:
        return labels[actual]
    return actual.upper() if actual else ''


def format_receipt(order_data, organization_data=None):
    org = organization_data or {}
    order = order_data or {}
    buffer = bytearray()

    buffer += PRINTER_INIT
    buffer += FEED_LINES(2)

    store_name = str(org.get('name', order.get('store_name', 'Tienda'))).upper()
    store_address = str(org.get('address', order.get('store_address', '')))
    store_phone = str(org.get('phone', order.get('store_phone', '')))
    store_footer = str(org.get('footer', order.get('store_footer', '¡Gracias por su compra!')))
    store_message = str(org.get('message', order.get('store_message', '')))
    number = str(order.get('order_number', ''))
    date_line = str(order.get('order_date', ''))
    customer_name = str(order.get('customer_name', '') or '')
    customer_phone = str(order.get('customer_phone', '') or '')
    delivery_address = str(order.get('delivery_address', '') or '')
    notes = str(order.get('notes', '') or '')
    is_paid = bool(order.get('is_paid', True))
    if order.get('payments') and any(p.get('status') == 'pending' for p in order.get('payments', [])):
        is_paid = False
    payment_display = str(order.get('payment_display', '') or '')

    # ── Tipo de pedido ─────────────────────────────────────
    order_type = _order_type_label(order)
    if order_type:
        buffer += ALIGN_CENTER + encode_text(DASHED) + b'\n'
        buffer += BOLD_ON + encode_text(order_type) + b'\n' + BOLD_OFF
        buffer += encode_text(DASHED) + b'\n'

    # ── Caja de título (nombre de la tienda) ───────────────
    buffer += ALIGN_CENTER
    buffer += INVERT_ON
    for line in _wrap(store_name, WIDTH - 2) or ['']:
        buffer += encode_text(' ' + line.ljust(WIDTH - 2) + ' ') + b'\n'
    buffer += INVERT_OFF

    if store_address:
        buffer += encode_text(_wrap(store_address, WIDTH)[0]) + b'\n'
    if store_phone:
        buffer += ALIGN_CENTER + encode_text(f"Tel: {store_phone}") + b'\n'

    buffer += ALIGN_CENTER + encode_text(SOLID) + b'\n'

    # ── Número de pedido grande ─────────────────────────────
    buffer += ALIGN_CENTER
    buffer += set_text_size(2, 2) + BOLD_ON
    buffer += encode_text(number) + b'\n'
    buffer += set_text_size(1, 1) + BOLD_OFF
    if date_line:
        buffer += encode_text(date_line) + b'\n'

    buffer += ALIGN_CENTER + encode_text(DASHED) + b'\n'

    # ── Datos del cliente ───────────────────────────────────
    has_customer = bool(customer_name or delivery_address or customer_phone)
    if has_customer:
        buffer += ALIGN_LEFT
        buffer += BOLD_ON + encode_text('DATOS DEL CLIENTE') + b'\n' + BOLD_OFF
        if customer_name:
            buffer += encode_text(customer_name.upper()) + b'\n'
        if delivery_address:
            for line in _wrap(delivery_address, WIDTH):
                buffer += encode_text(' ') + b'\n' if line == '' else encode_text(line) + b'\n'
        if customer_phone:
            buffer += encode_text(f"Tel: {customer_phone}") + b'\n'

    # ── Comentarios ─────────────────────────────────────────
    if notes:
        buffer += ALIGN_LEFT
        buffer += BOLD_ON + encode_text('COMENTARIOS') + b'\n' + BOLD_OFF
        for line in _wrap(notes, WIDTH):
            buffer += encode_text(line) + b'\n'

    # ── Ítems ───────────────────────────────────────────────
    buffer += ALIGN_LEFT
    raw_items = order.get('order_items') or order.get('items', [])
    parents = [i for i in raw_items if not (i.get('parent_item_id'))] if raw_items else []
    if not parents:
        parents = raw_items

    buffer += BOLD_ON
    buffer += encode_text(f"{'Cant':>4} {'Descripcion':<26} {'Total':>10}") + b'\n'
    buffer += BOLD_OFF

    for item in parents:
        name = str(item.get('name') or item.get('product_name') or 'Item')
        qty = float(item.get('quantity', 1) or 1)
        unit_price = float(item.get('price') or item.get('unit_price') or 0)
        total_price = unit_price * qty
        qty_str = f"{qty:g}x" if float(qty).is_integer() else f"{qty}x"
        total_str = _money(total_price)

        head = f"{qty_str} {name}"
        pad = WIDTH - len(head) - len(total_str)
        if pad >= 0:
            buffer += encode_text(head + ' ' * pad + total_str) + b'\n'
        else:
            for line in _wrap(head, WIDTH - len(total_str) - 1):
                buffer += encode_text(line) + b'\n'
            buffer += encode_text(' ' * (WIDTH - len(total_str)) + total_str) + b'\n'
        # Extra data: variantes / ingredientes / combinados
        for v in item.get('order_item_variants', []) or []:
            buffer += encode_text(f"- {str(v.get('variant_option_name', ''))}") + b'\n'
        for ing in item.get('order_item_ingredients', []) or []:
            ings = f"+ {str(ing.get('ingredient_name', ''))}"
            ip = float(ing.get('price', 0) or 0)
            if ip > 0:
                ings += f" (+{_money(ip)})"
            buffer += encode_text(ings) + b'\n'
        item_id = item.get('id')
        for child in raw_items:
            if child.get('parent_item_id') != item_id:
                continue
            cq = float(child.get('quantity', 0) or 0) / (qty or 1)
            cq_str = f"{cq:g}x" if float(cq).is_integer() else f"{cq}x"
            cline = f"    {cq_str} {str(child.get('product_name', ''))}"
            for cv in child.get('order_item_variants', []) or []:
                cline += f" ({str(cv.get('variant_option_name', ''))})"
            for line in _wrap(cline, WIDTH):
                buffer += encode_text(line) + b'\n'

    buffer += encode_text(DASHED) + b'\n'

    # ── Totales ─────────────────────────────────────────────
    subtotal = float(order.get('subtotal', 0) or 0)
    tax = float(order.get('tax', 0) or 0)
    delivery_fee = float(order.get('delivery_fee', 0) or 0)
    total = float(order.get('total', 0) or 0)
    for label, value in (('Subtotal', subtotal), ('Despacho', delivery_fee), ('IVA', tax)):
        if label == 'Despacho' and value <= 0:
            continue
        if label == 'IVA' and value <= 0:
            continue
        buffer += ALIGN_RIGHT
        buffer += encode_text(f"{label}: {_money(value)}") + b'\n'
    buffer += ALIGN_RIGHT
    buffer += INVERT_ON + BOLD_ON
    buffer += encode_text(f"TOTAL: {_money(total)}") + b'\n'
    buffer += INVERT_OFF + BOLD_OFF

    buffer += ALIGN_CENTER + encode_text(DASHED) + b'\n'

    # ── Aviso de no pago ────────────────────────────────────
    if not is_paid:
        buffer += ALIGN_CENTER
        buffer += INVERT_ON + encode_text('NO PAGADO') + b'\n'
        buffer += INVERT_OFF
        buffer += ALIGN_CENTER + BOLD_ON + encode_text('COBRAR AL CLIENTE') + b'\n' + BOLD_OFF
        buffer += ALIGN_CENTER + encode_text(DASHED) + b'\n'

    # ── Footer ──────────────────────────────────────────────
    buffer += FEED_LINES(1)
    if payment_display:
        buffer += ALIGN_CENTER + BOLD_ON + encode_text(payment_display) + b'\n' + BOLD_OFF
    buffer += ALIGN_CENTER + BOLD_ON + encode_text('¡Gracias por preferirnos!') + b'\n' + BOLD_OFF
    buffer += ALIGN_CENTER + encode_text('Powered by FoodHub POS') + b'\n'

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
