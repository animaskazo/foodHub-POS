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
        return f"${float(value or 0):,.0f}".replace(',', '.')
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

    # ── Segundo ticket: mensaje personalizado (tras el corte) ──
    # Sin número de pedido: solo saludo + mensaje + despedida.
    extra_message = str(order.get('extra_message', '') or '').strip()
    if extra_message:
        extra_greeting = str(order.get('extra_greeting', '') or '').strip()
        buffer += FEED_LINES(2)
        buffer += ALIGN_CENTER + encode_text(SOLID) + b'\n'
        for line in _wrap(store_name, WIDTH) or ['']:
            buffer += ALIGN_CENTER + BOLD_ON + encode_text(line) + b'\n' + BOLD_OFF
        buffer += ALIGN_CENTER + encode_text(DASHED) + b'\n'
        if extra_greeting:
            for line in _wrap(extra_greeting, WIDTH):
                buffer += ALIGN_CENTER + BOLD_ON + encode_text(line) + b'\n' + BOLD_OFF
        for line in _wrap(extra_message, WIDTH):
            buffer += ALIGN_CENTER + encode_text(line) + b'\n'
        buffer += ALIGN_CENTER + BOLD_ON + encode_text('¡Gracias por su visita!') + b'\n' + BOLD_OFF
        buffer += FEED_LINES(3)
        buffer += CUT_PAPER

    return bytes(buffer)


# ─────────────────────────────────────────────
# Renderizador de ticket con diseño (Pillow).
# Replica public/print.css + PrintableReceipt.jsx:
#   receipt-order-type 20px/900, dashed
#   receipt-title-box negro, 20px/900, padding 4mm
#   receipt-order-number 40px/900, date 12px
#   section-title 11px, items th 12px / name 13px/700,
#   variants 12px, totals 13px / TOTAL 22px/900,
#   unpaid 18px/900 negro, footer 12px/18px/10px.
# Conversión: 80mm = 302.36px CSS -> PX2DOT; mm -> MM.
# Se dibuja a 2x (S) y se baja a width_dots para nitidez.
# Lienzo alto + recorte explícito a Y (getbbox no sirve en blanco).
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
    except Exception:
        return None

    org = organization_data or {}
    order = order_data or {}

    S = 2
    W = width_dots * S
    PX2DOT = width_dots / 302.36  # px CSS -> dots térmicos
    MM = width_dots / 80.0        # dots por mm

    def px(css):
        return max(4, int(round(css * PX2DOT * S)))

    def mm(v):
        return int(round(v * MM * S))

    MARG = mm(2)  # receipt-content padding lateral 2mm
    CONTENT = W - 2 * MARG
    x0 = MARG
    x1 = W - MARG

    type_label = _order_type_label(order)
    name = str(org.get('name', order.get('store_name', '')) or 'Tienda').upper()

    def F(css, bold=False):
        return _receipt_font(px(css), bold)

    def tw(f, txt):
        try:
            return f.getlength(str(txt))
        except Exception:
            try:
                return d.textlength(str(txt), font=f)
            except Exception:
                return len(str(txt)) * px(7) * 0.6

    def fh(f):
        try:
            b = f.getbbox('Ag')
            return max(4, b[3] - b[1])
        except Exception:
            return px(10)

    def lh(f, mult=1.35):
        return int(fh(f) * mult)

    def wrap_txt(txt, f, maxw):
        words = str(txt).split(' ')
        lines, cur = [], ''
        for w_ in words:
            trial = (cur + ' ' + w_).strip()
            if not cur or tw(f, trial) <= maxw:
                # palabra única más larga que la columna: partir por caracteres
                if tw(f, w_) > maxw and not cur:
                    part = ''
                    for ch in w_:
                        if tw(f, part + ch) <= maxw:
                            part += ch
                        else:
                            lines.append(part)
                            part = ch
                    cur = part
                else:
                    cur = trial
            else:
                lines.append(cur)
                cur = w_
        if cur:
            lines.append(cur)
        return lines or ['']

    def solid_line(y, css_px=2):
        d.line([(x0, y), (x1, y)], fill=BLACK, width=max(2, px(css_px)))

    def dashed_line(y, css_px=1.5, color=None, dash_mm=1.6, gap_mm=1.2):
        c = color if color else BLACK
        w = max(2, px(css_px))
        seg = max(px(4), mm(dash_mm))
        gap = max(px(2), mm(gap_mm))
        xx = x0
        while xx < x1:
            d.line([(xx, y), (min(xx + seg, x1), y)], fill=c, width=w)
            xx += seg + gap

    raw_items = order.get('order_items') or order.get('items', [])
    parents = [i for i in raw_items if not (i.get('parent_item_id'))] if raw_items else raw_items
    H = 12000 * S

    img = PILImage.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    Y = mm(5)  # receipt-content padding superior 5mm

    BLACK = (0, 0, 0)
    WHITE = (255, 255, 255)
    GRAY = (107, 114, 128)
    DARK = (51, 51, 51)
    GRAY800 = (31, 41, 55)
    LIGHT_BG = (243, 244, 246)  # bg-gray-100 de comentarios

    def text_center(y, txt, f, color=BLACK):
        t = str(txt)
        w = tw(f, t)
        d.text(((W - w) / 2, y), t, font=f, fill=color)
        return w

    def text_left(x, y, txt, f, color=BLACK):
        d.text((x, y), str(txt), font=f, fill=color)

    # ── Tipo de pedido: 20px/900, padding 2mm, dashed arriba/abajo, márgenes 3mm ──
    if type_label:
        Y += mm(3)
        dashed_line(Y, 2)
        Y += mm(2)
        f = F(20, True)
        text_center(Y, type_label, f, BLACK)
        Y += lh(f, 1.0) + mm(2)
        dashed_line(Y, 2)
        Y += mm(3)

    # ── Caja negra del título: 20px/900, padding 4mm/2mm, radius 4px ──
    f_title = F(20, True)
    pad_v, pad_h = mm(4), mm(2)
    title_lines = wrap_txt(name, f_title, CONTENT - 2 * pad_h) or [name]
    if len(title_lines) > 2:
        f_title = F(16, True)
        title_lines = wrap_txt(name, f_title, CONTENT - 2 * pad_h)
    box_h = len(title_lines) * lh(f_title, 1.15) + 2 * pad_v
    try:
        d.rounded_rectangle([x0, Y, x1, Y + box_h], radius=px(4), fill=BLACK)
    except Exception:
        d.rectangle([x0, Y, x1, Y + box_h], fill=BLACK)
    yy = Y + pad_v
    for ln in title_lines:
        text_center(yy, ln, f_title, WHITE)
        yy += lh(f_title, 1.15)
    Y += box_h + mm(2)  # margin-bottom 2mm

    # ── Divider sólido 2px, márgenes 3mm ──
    solid_line(Y, 2)
    Y += mm(3)

    # ── Número 40px/900 (line-height 1, margin-top 4mm) + fecha 12px (margin-bottom 4mm) ──
    num = str(order.get('order_number', ''))
    if num and not num.startswith('#'):
        num = '#' + num
    Y += mm(4)
    if num:
        f_num = F(40, True)
        # reducir si no cabe (números muy largos)
        while tw(f_num, num) > CONTENT and f_num.size > px(20):
            f_num = _receipt_font(int(f_num.size * 0.9), True)
        text_center(Y, num, f_num, BLACK)
        Y += lh(f_num, 1.0)
    date_line = str(order.get('order_date', '') or '')
    if date_line:
        f_date = F(12, False)
        text_center(Y + mm(0.5), date_line, f_date, DARK)
        Y += lh(f_date, 1.3) + mm(0.5)
    Y += mm(4)
    dashed_line(Y, 1.5)
    Y += mm(3)

    # ── Datos del cliente ──
    customer = str(order.get('customer_name', '') or '')
    phone = str(order.get('customer_phone', '') or '')
    address = str(order.get('delivery_address', '') or '')
    if customer or phone or address:
        f_sec = F(11, True)
        text_left(x0, Y, 'DATOS DEL CLIENTE', f_sec, BLACK)
        Y += lh(f_sec, 1.3) + mm(1)
        if customer:
            f_c = F(14, True)
            for ln in wrap_txt(customer.upper(), f_c, CONTENT):
                text_left(x0, Y, ln, f_c, BLACK)
                Y += lh(f_c, 1.3)
        if address:
            f_a = F(13, False)
            if customer:
                Y += mm(1)
            for ln in wrap_txt(address, f_a, CONTENT):
                text_left(x0, Y, ln, f_a, BLACK)
                Y += lh(f_a, 1.3)
        if phone:
            f_p = F(13, False)
            Y += mm(1)
            text_left(x0, Y, f'Tel: {phone}', f_p, BLACK)
            Y += lh(f_p, 1.3)
        Y += mm(4)  # mb-4

    # ── Comentarios: cajita gris bg-gray-100, texto 14px/700 uppercase ──
    notes = str(order.get('notes', '') or '')
    if notes:
        f_sec = F(11, True)
        text_left(x0, Y, 'COMENTARIOS', f_sec, BLACK)
        Y += lh(f_sec, 1.3) + mm(1)
        f_n = F(14, True)
        nlines = wrap_txt(notes.upper(), f_n, CONTENT - 2 * mm(2))
        box_pad = mm(2)
        box_h = len(nlines) * lh(f_n, 1.3) + 2 * box_pad
        try:
            d.rounded_rectangle([x0, Y, x1, Y + box_h], radius=px(4), fill=LIGHT_BG)
        except Exception:
            d.rectangle([x0, Y, x1, Y + box_h], fill=LIGHT_BG)
        yn = Y + box_pad
        for ln in nlines:
            text_left(x0 + box_pad, yn, ln, f_n, BLACK)
            yn += lh(f_n, 1.3)
        Y += box_h + mm(4)

    # ── Ítems: th 12px/bold, pb 2mm, borde sólido; filas pt 2mm/pb 1mm, sep dashed ──
    f_head = F(12, True)
    f_qty = F(13, True)
    f_name = F(13, True)
    f_sub = F(12, False)
    f_price = F(13, False)
    col_q = px(32)       # w-8
    col_price = px(70)
    gap = px(4)
    col_descr_w = CONTENT - col_q - col_price - 2 * gap
    x_q = x0
    x_desc = x_q + col_q + gap
    x_price_r = x1

    text_left(x_q, Y, 'Cant', f_head, BLACK)
    text_left(x_desc, Y, 'Descripción', f_head, BLACK)
    t = 'Total'
    text_left(x_price_r - tw(f_head, t), Y, t, f_head, BLACK)
    Y += lh(f_head, 1.3) + mm(2)
    solid_line(Y, 1.5)
    Y += mm(2)

    for idx, it in enumerate(parents):
        qty = float(it.get('quantity', 1) or 1)
        unit = float(it.get('price') or it.get('unit_price') or 0)
        total_price = unit * qty
        qty_str = f"{qty:g}x"
        name_i = str(it.get('name') or it.get('product_name') or 'Item')
        total_str = _money(total_price)

        row_top = Y
        text_left(x_q, row_top, qty_str, f_qty, BLACK)
        yn = row_top
        for ln in wrap_txt(name_i, f_name, col_descr_w):
            text_left(x_desc, yn, ln, f_name, BLACK)
            yn += lh(f_name, 1.3)
        text_left(x_price_r - tw(f_price, total_str), row_top, total_str, f_price, BLACK)
        Y = max(yn, row_top + lh(f_qty, 1.3))

        for v in it.get('order_item_variants', []) or []:
            text_left(x_desc + mm(1), Y, f"- {v.get('variant_option_name', '')}", f_sub, GRAY800)
            Y += lh(f_sub, 1.3)
        for ing in it.get('order_item_ingredients', []) or []:
            es = f"+ {ing.get('ingredient_name', '')}"
            ip = float(ing.get('price', 0) or 0)
            if ip > 0:
                es += f" (+{_money(ip)})"
            for ln in wrap_txt(es, f_sub, col_descr_w - mm(1)):
                text_left(x_desc + mm(1), Y, ln, f_sub, GRAY800)
                Y += lh(f_sub, 1.3)
        for ch in raw_items:
            if ch.get('parent_item_id') != it.get('id'):
                continue
            cq = float(ch.get('quantity', 0) or 0) / (qty or 1)
            cq_str = f"{cq:g}x" if float(cq).is_integer() else f"{cq}x"
            cline = f"{cq_str} {ch.get('product_name', '')}"
            for cv in ch.get('order_item_variants', []) or []:
                cline += f" ({cv.get('variant_option_name', '')})"
            cu = float(ch.get('unit_price', 0) or 0)
            if cu > 0:
                cline += f" (+{_money(cu)})"
            for ln in wrap_txt(cline, f_sub, col_descr_w - mm(2)):
                text_left(x_desc + mm(2), Y, ln, f_sub, GRAY800)
                Y += lh(f_sub, 1.3)
        Y += mm(1)  # pb 1mm
        # separador dashed #999 entre filas (no en la última)
        if idx < len(parents) - 1:
            dashed_line(Y, 1, color=(153, 153, 153))
            Y += mm(2)  # pt 2mm siguiente fila
        else:
            Y += mm(2)

    # ── Totales: base 13px; TOTAL 22px/900 con borde superior 2px ──
    Y += mm(4 - 2)  # receipt-totals margin-top 4mm (ya avanzamos 2mm)
    total = float(order.get('total', 0) or 0)
    dev = float(order.get('delivery_fee', 0) or 0)
    subtotal = max(total - dev, 0)

    def tot_row(label, value):
        nonlocal Y
        f = F(13, False)
        text_left(x0, Y, label, f, BLACK)
        v = _money(value)
        text_left(x1 - tw(f, v), Y, v, f, BLACK)
        Y += lh(f, 1.35)

    tot_row('Subtotal', subtotal)
    if dev > 0:
        tot_row('Despacho', dev)
    Y += mm(2)
    solid_line(Y, 2)
    Y += mm(2)
    f_total = F(22, True)
    text_left(x0, Y, 'TOTAL', f_total, BLACK)
    v = _money(total)
    text_left(x1 - tw(f_total, v), Y, v, f_total, BLACK)
    Y += lh(f_total, 1.2) + mm(4)

    dashed_line(Y, 1.5)
    Y += mm(4)

    # ── NO PAGADO: una sola caja negra 18px/900, padding 3mm ──
    is_paid = bool(order.get('is_paid', True))
    if order.get('payments') and any(p.get('status') == 'pending' for p in order.get('payments', [])):
        is_paid = False
    if not is_paid:
        f_u = F(18, True)
        lines = ['NO PAGADO', 'COBRAR AL CLIENTE']
        # encoger si no caben
        while any(tw(f_u, t) > CONTENT - mm(4) for t in lines):
            f_u = _receipt_font(int(f_u.size * 0.92), True)
        box_pad_v = mm(3)
        box_h = len(lines) * lh(f_u, 1.25) + 2 * box_pad_v
        d.rectangle([x0, Y, x1, Y + box_h], fill=BLACK)
        yu = Y + box_pad_v
        for t in lines:
            text_center(yu, t, f_u, WHITE)
            yu += lh(f_u, 1.25)
        Y += box_h + mm(4)

    # ── Footer: pago 12px/bold, gracias 18px/bold, powered 10px gris ──
    pay = str(order.get('payment_display', '') or '')
    if pay:
        f_pay = F(12, True)
        text_center(Y, pay.upper(), f_pay, BLACK)
        Y += lh(f_pay, 1.3) + mm(1)
    f_thx = F(18, True)
    text_center(Y, '¡Gracias por preferirnos!', f_thx, BLACK)
    Y += lh(f_thx, 1.3) + mm(2)
    f_pw = F(10, False)
    text_center(Y, 'P O W E R E D   B Y   F O O D H U B   P O S', f_pw, GRAY)
    Y += lh(f_pw, 1.3) + mm(5)  # padding inferior 5mm

    # Recorte explícito al contenido real (alto automático, como la web).
    bottom = max(int(Y), mm(10))
    bottom = min(bottom, H)
    img = img.crop((0, 0, W, bottom))

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
