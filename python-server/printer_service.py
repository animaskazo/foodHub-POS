import os
import sys
import io

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

    # ── Recuadro negro del título (igual que la web) ────────
    buffer += ALIGN_CENTER
    buffer += INVERT_ON
    for line in _wrap(store_name, WIDTH - 2) or ['']:
        buffer += encode_text(' ' + line.ljust(WIDTH - 2) + ' ') + b'\n'
    buffer += INVERT_OFF

    buffer += ALIGN_CENTER + encode_text(SOLID) + b'\n'

    # ── Número de pedido grande + fecha ─────────────────────
    if number and not number.startswith('#'):
        number = '#' + number
    buffer += ALIGN_CENTER + set_text_size(2, 2) + BOLD_ON
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
            buffer += BOLD_ON + encode_text(customer_name.upper()) + b'\n' + BOLD_OFF
        if delivery_address:
            for line in _wrap(delivery_address, WIDTH):
                buffer += encode_text(line) + b'\n'
        if customer_phone:
            buffer += encode_text(f"Tel: {customer_phone}") + b'\n'

    # ── Comentarios ─────────────────────────────────────────
    if notes:
        buffer += ALIGN_LEFT
        buffer += BOLD_ON + encode_text('COMENTARIOS') + b'\n' + BOLD_OFF
        for line in _wrap(notes, WIDTH):
            buffer += BOLD_ON + encode_text(line.upper()) + b'\n' + BOLD_OFF

    # ── Ítems ───────────────────────────────────────────────
    buffer += ALIGN_LEFT
    raw_items = order.get('order_items') or order.get('items', [])
    parents = [i for i in raw_items if not (i.get('parent_item_id'))] if raw_items else []
    if not parents:
        parents = raw_items

    buffer += BOLD_ON
    buffer += encode_text(f"{'Cant':>4} {'Descripción':<23} {'Total':>11}") + b'\n'
    buffer += BOLD_OFF
    buffer += encode_text(SOLID) + b'\n'

    def _tot_row(label, value, size=1):
        mv = _money(value)
        pad = max(1, (WIDTH // size) - len(label) - len(mv))
        return encode_text(label + ' ' * pad + mv) + b'\n'

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
            buffer += BOLD_ON + encode_text(head + ' ' * pad + total_str) + b'\n' + BOLD_OFF
        else:
            for line in _wrap(head, WIDTH - len(total_str) - 1):
                buffer += BOLD_ON + encode_text(line) + b'\n' + BOLD_OFF
            buffer += BOLD_ON + encode_text(' ' * max(1, WIDTH - len(total_str)) + total_str) + b'\n' + BOLD_OFF
        # Variantes / ingredientes / combinados
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
            cu = float(child.get('unit_price', 0) or 0)
            if cu > 0:
                cline += f" (+{_money(cu)})"
            for line in _wrap(cline, WIDTH):
                buffer += encode_text(line) + b'\n'

    buffer += encode_text(DASHED) + b'\n'

    # ── Totales (subtotal = total − despacho, como la web) ──
    total = float(order.get('total', 0) or 0)
    delivery_fee = float(order.get('delivery_fee', 0) or 0)
    subtotal = max(total - delivery_fee, 0)
    buffer += ALIGN_LEFT
    buffer += _tot_row('Subtotal', subtotal)
    if delivery_fee > 0:
        buffer += _tot_row('Despacho', delivery_fee)
    buffer += encode_text(SOLID) + b'\n'
    buffer += set_text_size(2, 2) + BOLD_ON
    buffer += _tot_row('TOTAL', total)
    buffer += set_text_size(1, 1) + BOLD_OFF

    buffer += ALIGN_CENTER + encode_text(DASHED) + b'\n'

    # ── Aviso de no pago (recuadro negro, como la web) ──────
    if not is_paid:
        buffer += ALIGN_CENTER
        buffer += INVERT_ON + encode_text('NO PAGADO'.ljust(WIDTH)) + b'\n'
        buffer += INVERT_OFF
        buffer += ALIGN_CENTER + INVERT_ON + encode_text('COBRAR AL CLIENTE'.ljust(WIDTH)) + b'\n' + INVERT_OFF

    # ── Footer ──────────────────────────────────────────────
    buffer += FEED_LINES(1)
    if payment_display:
        buffer += ALIGN_CENTER + BOLD_ON + encode_text(payment_display) + b'\n' + BOLD_OFF
    buffer += ALIGN_CENTER + BOLD_ON + encode_text('¡Gracias por preferirnos!') + b'\n' + BOLD_OFF
    buffer += ALIGN_CENTER + encode_text('-' * 24) + b'\n'
    buffer += ALIGN_CENTER + encode_text('Powered by FoodHub POS') + b'\n'

    buffer += FEED_LINES(3)
    buffer += CUT_PAPER

    return bytes(buffer)


# ─────────────────────────────────────────────
# Renderizador de ticket con diseño (Pillow).
# Genera un PNG del ticket con el MISMO layout de la web
# (caja negra del título, número grande, tabla de items,
# totales, aviso NO PAGADO), para que Python pueda imprimir
# con diseño aunque el navegador no envíe la imagen raster.
# ─────────────────────────────────────────────
def _receipt_font(size, bold=False):
    try:
        from PIL import ImageFont
    except Exception:
        return None
    candidates = []
    if sys.platform == 'win32':
        candidates = [
            (r'C:\Windows\Fonts\arialbd.ttf' if bold else r'C:\Windows\Fonts\arial.ttf'),
            r'C:\Windows\Fonts\segoeuib.ttf' if bold else r'C:\Windows\Fonts\segoeui.ttf',
            r'C:\Windows\Fonts\calibrib.ttf' if bold else r'C:\Windows\Fonts\calibri.ttf',
        ]
    else:
        candidates = [
            ('/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf'),
            ('/System/Library/Fonts/Helvetica.ttc' if not bold else '/System/Library/Fonts/Helvetica.ttc'),
        ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default()
    except Exception:
        return None


def render_receipt_image(order_data, organization_data=None, width_dots=576):
    try:
        from PIL import Image as PILImage
        from PIL import ImageDraw
    except Exception as e:
        logger = sys.modules.get('logging')
        if logger:
            logger.warning(f"Pillow no disponible para render: {e}")
        return None

    org = organization_data or {}
    order = order_data or {}

    # Escala para calidad: dibujamos a 2x y bajamos a width_dots
    S = 2
    W = width_dots * S
    MARG = 8 * S  # 8px a escala
    CONTENT = W - 2 * MARG
    x0 = MARG
    x1 = W - MARG

    # Título / número / orden
    type_label = _order_type_label(order)
    name = str(org.get('name', order.get('store_name', '')) or 'Tienda').upper()

    def font(size, bold=False):
        return _receipt_font(size, bold)

    def text_w(f, txt):
        return f.getlength(txt)

    def draw_items(d, f, txt, x, y, color):
        d.text((x, y), txt, font=f, fill=color)

    # Medir alto total primero de forma manual (layout simple de una sola pasada)
    # Alturas por sección en pixels @ escala 2x
    pad_y = 14 * S
    line_h = 12 * S
    big_h = 30 * S
    num_h = 44 * S

    # Dibujamos sobre un alto generoso y al final recortamos al contenido real
    # (equivalente a @page auto de CSS), evitando cortar contenido.
    raw_items = order.get('order_items') or order.get('items', [])
    parents = [i for i in raw_items if not (i.get('parent_item_id'))] if raw_items else raw_items
    item_lines = 0
    for it in parents:
        item_lines += 1
        item_lines += len(it.get('order_item_variants', []) or [])
        item_lines += len(it.get('order_item_ingredients', []) or [])
        for ch in raw_items:
            if ch.get('parent_item_id') == it.get('id'):
                item_lines += 1
    H = 120 * S + item_lines * (line_h + 3 * S) + 120 * S

    img = PILImage.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    Y = 6 * S

    BLACK = (0, 0, 0)
    WHITE = (255, 255, 255)
    GRAY = (107, 114, 128)
    DARK = (51, 51, 51)

    # ── Tipo de pedido (dashed alrededor) ──
    if type_label:
        f = font(16 * S, True)
        y0 = Y
        # líneas punteadas
        dd = 4 * S
        def dashed_h(y):
            xx = x0
            while xx < x1:
                d.line([(xx, y), (min(xx + 4 * S, x1), y)], fill=BLACK, width=2)
                xx += dd
        dashed_h(y0)
        tw = text_w(f, type_label)
        d.text(((W - tw) / 2, y0 + 6 * S), type_label, font=f, fill=BLACK)
        Y = y0 + 10 * S + 16 * S
        dashed_h(Y)
        Y += 6 * S

    # ── Caja negra del título ──
    f = font(13 * S, True)
    box_h = int(22 * S)
    d.rectangle([x0, Y, x1, Y + box_h], fill=BLACK)
    tw = text_w(f, name)
    if tw > CONTENT - 20 * S:
        f = font(11 * S, True)
        tw = text_w(f, name)
    d.text(((W - tw) / 2, Y + (box_h - 16 * S) / 2), name, font=f, fill=WHITE)
    Y += box_h + 8 * S

    # ── Divider sólido ──
    d.line([(x0, Y), (x1, Y)], fill=BLACK, width=3)
    Y += 6 * S

    # ── Número de pedido grande + fecha ──
    num = str(order.get('order_number', ''))
    if num and not num.startswith('#'):
        num = '#' + num
    f = font(30 * S, True)
    tw = text_w(f, num)
    d.text(((W - tw) / 2, Y), num, font=f, fill=BLACK)
    Y += int(44 * S)
    date_line = str(order.get('order_date', ''))
    if date_line:
        f = font(10 * S, False)
        d.text(((W - text_w(f, date_line)) / 2, Y), date_line, font=f, fill=DARK)
        Y += int(18 * S)

    # ── Divider dashed ──
    dd = 4 * S
    def dashed_y(y):
        xx = x0
        while xx < x1:
            d.line([(xx, y), (min(xx + 4 * S, x1), y)], fill=BLACK, width=2)
            xx += dd
    dashed_y(Y)
    Y += 6 * S

    # Funciones de helpers de texto
    def section(title):
        nonlocal Y
        f = font(9 * S, True)
        d.text((x0, Y), title, font=f, fill=BLACK)
        Y += int(14 * S)

    def line_pad(txt, size=9 * S, bold=False, color=BLACK, indent=0):
        nonlocal Y
        f = font(size, bold)
        d.text((x0 + indent, Y), txt, font=f, fill=color)
        Y += int(size * 1.35)

    def wrap(txt, size, fontobj, maxw):
        words = str(txt).split(' ')
        lines, cur = [], ''
        for w_ in words:
            trial = (cur + ' ' + w_).strip()
            if text_w(fontobj, trial) <= maxw:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w_
        if cur:
            lines.append(cur)
        return lines or ['']

    # ── Datos del cliente ──
    customer = str(order.get('customer_name', '') or '')
    phone = str(order.get('customer_phone', '') or '')
    address = str(order.get('delivery_address', '') or '')
    if customer or phone or address:
        section('DATOS DEL CLIENTE')
        if customer:
            line_pad(customer.upper(), 9 * S, True)
        if address:
            for ln in wrap(address, 9 * S, font(9 * S), CONTENT):
                line_pad(ln, 9 * S, False)
        if phone:
            line_pad(f'Tel: {phone}', 9 * S, False)
        Y += 6 * S

    # ── Comentarios ──
    notes = str(order.get('notes', '') or '')
    if notes:
        section('COMENTARIOS')
        f = font(9 * S, True)
        for ln in wrap(notes, 9 * S, f, CONTENT):
            d.text((x0, Y), ln.upper(), font=f, fill=BLACK)
            Y += int(14 * S)
        Y += 6 * S

    # ── Items ──
    f_head = font(9 * S, True)
    f_item = font(9 * S, True)
    col_q = 30 * S
    col_price = 60 * S
    col_descr_w = CONTENT - col_q - col_price
    x_q = x0
    x_desc = x_q + col_q
    x_price = x0 + CONTENT - col_price

    d.text((x_q, Y), 'Cant', font=f_head, fill=BLACK)
    d.text((x_desc, Y), 'Descripción', font=f_head, fill=BLACK)
    d.text((x_price, Y), 'Total', font=f_head, fill=BLACK)
    Y += int(16 * S)
    d.line([(x0, Y), (x1, Y)], fill=BLACK, width=2)
    Y += int(8 * S)

    for it in parents:
        qty = float(it.get('quantity', 1) or 1)
        unit = float(it.get('price') or it.get('unit_price') or 0)
        total_price = unit * qty
        qty_str = f"{qty:g}x"
        name_i = str(it.get('name') or it.get('product_name') or 'Item')
        total_str = _money(total_price)

        d.text((x_q, Y), qty_str, font=f_item, fill=BLACK)
        for idx, ln in enumerate(wrap(name_i, 9 * S, f_item, col_descr_w)):
            d.text((x_desc, Y + idx * int(13 * S)), ln, font=f_item, fill=BLACK)
        nlines = max(1, len(wrap(name_i, 9 * S, f_item, col_descr_w)))
        d.text((x_price, Y), total_str, font=f_item, fill=BLACK)

        Y += nlines * int(13 * S)

        for v in it.get('order_item_variants', []) or []:
            d.text((x_desc + 8 * S, Y), f"- {v.get('variant_option_name', '')}", font=font(8 * S), fill=DARK)
            Y += int(13 * S)
        for ing in it.get('order_item_ingredients', []) or []:
            es = f"+ {ing.get('ingredient_name', '')}"
            ip = float(ing.get('price', 0) or 0)
            if ip > 0:
                es += f" (+{_money(ip)})"
            d.text((x_desc + 8 * S, Y), es, font=font(8 * S), fill=DARK)
            Y += int(13 * S)
        for ch in raw_items:
            if ch.get('parent_item_id') != it.get('id'):
                continue
            cq = float(ch.get('quantity', 0) or 0) / (qty or 1)
            cq_str = f"{cq:g}x" if float(cq).is_integer() else f"{cq}x"
            cline = f"    {cq_str} {ch.get('product_name', '')}"
            for cv in ch.get('order_item_variants', []) or []:
                cline += f" ({cv.get('variant_option_name', '')})"
            cu = float(ch.get('unit_price', 0) or 0)
            if cu > 0:
                cline += f" (+{_money(cu)})"
            for ln in wrap(cline, 8 * S, font(8 * S), col_descr_w):
                d.text((x_desc + 10 * S, Y), ln, font=font(8 * S), fill=DARK)
                Y += int(12 * S)

    Y += 8 * S
    dd = 4 * S
    def dashed_line():
        nonlocal Y
        xx = x0
        while xx < x1:
            d.line([(xx, Y), (min(xx + 4 * S, x1), Y)], fill=BLACK, width=2)
            xx += dd
        Y += 6 * S
    dashed_line()

    # ── Totales ──
    total = float(order.get('total', 0) or 0)
    dev = float(order.get('delivery_fee', 0) or 0)
    subtotal = max(total - dev, 0)
    f_tot = font(9 * S, False)
    def tot_row(label, value):
        nonlocal Y
        f = font(9 * S, False)
        d.text((x0, Y), label, font=f, fill=BLACK)
        v = _money(value)
        d.text((x1 - text_w(font(9 * S), v), Y), v, font=f, fill=BLACK)
        Y += int(14 * S)
    tot_row('Subtotal', subtotal)
    if dev > 0:
        tot_row('Despacho', dev)
    Y += 4 * S
    d.line([(x0, Y), (x1, Y)], fill=BLACK, width=3)
    Y += 8 * S
    f_total = font(16 * S, True)
    d.text((x0, Y), 'TOTAL', font=f_total, fill=BLACK)
    v = _money(total)
    d.text((x1 - text_w(f_total, v), Y), v, font=f_total, fill=BLACK)
    Y += int(30 * S)

    # ── Divider + aviso NO PAGADO ──
    dashed_line()

    is_paid = bool(order.get('is_paid', True))
    if order.get('payments') and any(p.get('status') == 'pending' for p in order.get('payments', [])):
        is_paid = False
    if not is_paid:
        f = font(11 * S, True)
        for txt in ('NO PAGADO', 'COBRAR AL CLIENTE'):
            tw = text_w(f, txt)
            d.rectangle([x0, Y, x1, Y + int(20 * S)], fill=BLACK)
            d.text(((W - tw) / 2, Y + int(6 * S)), txt, font=f, fill=WHITE)
            Y += int(22 * S)
        Y += 6 * S

    # ── Footer ──
    pay = str(order.get('payment_display', '') or '')
    if pay:
        f = font(9 * S, True)
        d.text(((W - text_w(f, pay)) / 2, Y), pay, font=f, fill=BLACK)
        Y += int(16 * S)
    f = font(12 * S, True)
    txt = '¡Gracias por preferirnos!'
    d.text(((W - text_w(f, txt)) / 2, Y), txt, font=f, fill=BLACK)
    Y += int(20 * S)
    f = font(7 * S, False)
    txt = 'P O W E R E D   B Y   F O O D H U B   P O S'
    d.text(((W - text_w(f, txt)) / 2, Y), txt, font=f, fill=GRAY)

    # Recortar al contenido real (alto automático, como la web)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # Redimensionar a resolución final
    img = img.resize((width_dots, max(1, int(img.height / S))), PILImage.LANCZOS)
    return img


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
