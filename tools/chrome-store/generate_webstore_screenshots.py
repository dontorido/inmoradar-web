from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

# Requires Pillow. Generates the official Chrome Web Store image set.

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "chrome-web-store"
LOGO = ROOT / "assets" / "inmoradar-brand-mark-transparent.png"

W, H = 1280, 800
BG = "#FAFAFA"
SURFACE = "#FFFFFF"
INK = "#09090B"
MUTED = "#52525B"
SOFT = "#71717A"
LINE = "#E4E4E7"
RADAR = "#FF4500"
RADAR_DARK = "#B83100"
RADAR_SOFT = "#FFF1EB"
GOOD = "#0EA66B"
GOOD_SOFT = "#E9FBF2"
AMBER = "#F59E0B"
AMBER_SOFT = "#FFF7E6"
DARK = "#070708"
BLUE_SOFT = "#EEF6FF"


def font(name, size):
    candidates = {
        "black": [
            r"C:\Windows\Fonts\ariblk.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
        ],
        "bold": [
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\segoeuib.ttf",
        ],
        "body": [
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ],
        "mono": [
            r"C:\Windows\Fonts\consola.ttf",
            r"C:\Windows\Fonts\lucon.ttf",
        ],
    }
    for path in candidates[name]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


F = {
    "hero": font("black", 76),
    "hero_sm": font("black", 58),
    "h2": font("black", 40),
    "h3": font("bold", 24),
    "body": font("body", 23),
    "body_sm": font("body", 18),
    "body_xs": font("body", 15),
    "bold": font("bold", 20),
    "bold_sm": font("bold", 16),
    "mono": font("mono", 13),
    "mono_sm": font("mono", 11),
    "num": font("black", 54),
    "num_sm": font("black", 36),
    "tab": font("bold", 14),
}


def rounded(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def shadow(canvas, xy, radius, alpha=34, blur=18):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(xy, radius=radius, fill=(9, 9, 11, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer)


def grid_bg(img, dark=False):
    d = ImageDraw.Draw(img)
    color = "#333333" if dark else "#E9E9ED"
    for x in range(0, W, 44):
        d.line((x, 0, x, H), fill=color, width=1)
    for y in range(0, H, 44):
        d.line((0, y, W, y), fill=color, width=1)


def text(draw, xy, value, fill=INK, font_obj=None, anchor=None):
    draw.text(xy, value, fill=fill, font=font_obj or F["body"], anchor=anchor)


def wrap(draw, value, width, font_obj):
    words = value.split()
    lines, current = [], ""
    for word in words:
        test = (current + " " + word).strip()
        if draw.textbbox((0, 0), test, font=font_obj)[2] <= width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(draw, xy, value, width, font_obj=F["body"], fill=MUTED, line_gap=8):
    x, y = xy
    for line in wrap(draw, value, width, font_obj):
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += font_obj.size + line_gap
    return y


def logo(canvas, x, y, size=42, dark_word=False):
    d = ImageDraw.Draw(canvas)
    if LOGO.exists():
        mark = Image.open(LOGO).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        canvas.alpha_composite(mark, (x, y))
    else:
        rounded(d, (x, y, x + size, y + size), size // 2, INK)
    word_font = font("black", int(size * 0.48))
    d.text((x + size + 12, y + size * 0.18), "Inmo", font=word_font, fill=INK if not dark_word else SURFACE)
    left = d.textbbox((0, 0), "Inmo", font=word_font)[2]
    d.text((x + size + 12 + left, y + size * 0.18), "Radar", font=word_font, fill=RADAR)


def pill(draw, xy, value, fill=SURFACE, outline=LINE, color=INK, dot=None):
    x, y = xy
    tw = draw.textbbox((0, 0), value, font=F["mono"])[2]
    w = tw + 34 + (18 if dot else 0)
    rounded(draw, (x, y, x + w, y + 34), 17, fill, outline)
    tx = x + 17
    if dot:
        draw.ellipse((x + 14, y + 12, x + 24, y + 22), fill=dot)
        tx += 16
    draw.text((tx, y + 9), value.upper(), font=F["mono"], fill=color)
    return x + w


def headline(draw, x, y, lines, white=False, orange_line=None, small=False):
    f = F["hero_sm"] if small else F["hero"]
    lh = f.size - 4
    orange_lines = set()
    if isinstance(orange_line, (list, tuple, set)):
        orange_lines = set(orange_line)
    elif orange_line is not None:
        orange_lines = {orange_line}
    for i, line in enumerate(lines):
        fill = RADAR if i in orange_lines else (SURFACE if white else INK)
        draw.text((x, y + i * lh), line, font=f, fill=fill)


def portal_card(canvas, x, y):
    d = ImageDraw.Draw(canvas)
    shadow(canvas, (x, y, x + 518, y + 534), 30, 25, 18)
    rounded(d, (x, y, x + 518, y + 534), 30, SURFACE, LINE)
    rounded(d, (x + 24, y + 24, x + 494, y + 246), 24, "#F7F7F8", None)
    for i, c in enumerate(["#FFB199", "#F6D365", "#C3E8FF"]):
        rounded(d, (x + 48 + i * 128, y + 50, x + 150 + i * 128, y + 214), 18, c)
    d.text((x + 32, y + 274), "Piso luminoso en Madrid", font=F["h3"], fill=INK)
    d.text((x + 32, y + 313), "389.000 € · 142 m² · 3 hab.", font=F["body_sm"], fill=MUTED)
    for i, label in enumerate(["Ascensor", "Terraza", "Metro cerca", "Buen estado"]):
        pill(d, (x + 32 + (i % 2) * 168, y + 358 + (i // 2) * 48), label, fill="#F4F4F5", outline=LINE, color=INK)
    rounded(d, (x + 32, y + 482, x + 250, y + 512), 15, INK)
    d.text((x + 60, y + 490), "Contactar", font=F["bold_sm"], fill=SURFACE)


def extension_shell(canvas, x, y, tab="Resumen"):
    d = ImageDraw.Draw(canvas)
    shadow(canvas, (x, y, x + 390, y + 632), 28, 42, 22)
    rounded(d, (x, y, x + 390, y + 632), 28, SURFACE, "#DADDE3")
    rounded(d, (x, y, x + 390, y + 106), 28, INK, None)
    logo(canvas, x + 22, y + 21, 32, dark_word=True)
    rounded(d, (x + 240, y + 24, x + 306, y + 48), 12, (255, 255, 255, 18), "#4B5563")
    d.text((x + 253, y + 30), "v1.0.10", font=F["mono_sm"], fill="#D4D4D8")
    d.text((x + 22, y + 70), "Analiza inmuebles antes de contactar", font=F["body_xs"], fill="#B9BDC6")
    tabs = ["Resumen", "Costes", "Entorno"]
    tx = x + 16
    for t in tabs:
        active = t == tab
        rounded(d, (tx, y + 118, tx + 112, y + 150), 12, INK if active else "#F4F4F5", LINE)
        d.text((tx + 33, y + 127), t, font=F["tab"], fill=SURFACE if active else MUTED)
        tx += 122
    return (x + 18, y + 166, x + 372, y + 612)


def insight(draw, x, y, title, body, icon="i"):
    rounded(draw, (x, y, x + 354, y + 78), 20, INK)
    draw.ellipse((x + 16, y + 19, x + 56, y + 59), fill="#E0F2FE")
    draw.text((x + 29, y + 29), icon, font=F["bold_sm"], fill="#0369A1")
    draw.text((x + 70, y + 16), title.upper(), font=F["mono_sm"], fill=RADAR)
    paragraph(draw, (x + 70, y + 35), body, 260, F["body_xs"], SURFACE, 1)


def score_cards(draw, x, y):
    for i, (label, value) in enumerate([("Inmueble", "7,4"), ("Zona", "6,8")]):
        cx = x + i * 180
        rounded(draw, (cx, y, cx + 170, y + 116), 20, SURFACE, "#DADDE3")
        draw.text((cx + 18, y + 17), label.upper(), font=F["mono_sm"], fill="#8A8F99")
        draw.text((cx + 18, y + 42), value, font=F["num"], fill="#C95A0A")
        draw.text((cx + 96, y + 68), "/10", font=F["body_xs"], fill="#9CA3AF")
        draw.rounded_rectangle((cx + 18, y + 96, cx + 152, y + 100), radius=2, fill="#ECEFF3")
        draw.rounded_rectangle((cx + 18, y + 96, cx + 122, y + 100), radius=2, fill="#FF9900")


def price_card(draw, x, y):
    rounded(draw, (x, y, x + 354, y + 196), 22, GOOD_SOFT, "#A7F3D0")
    draw.text((x + 20, y + 25), "-22,0%", font=F["num_sm"], fill=GOOD)
    rounded(draw, (x + 132, y + 30, x + 232, y + 55), 12, GOOD, None)
    draw.text((x + 145, y + 36), "BUEN PRECIO", font=F["mono_sm"], fill=SURFACE)
    labels = [("Precio anuncio", "1.082 €/m²"), ("Referencia mercado", "1.387 €/m²")]
    for i, (a, b) in enumerate(labels):
        bx = x + 20 + i * 166
        rounded(draw, (bx, y + 82, bx + 146, y + 140), 14, SURFACE, "#D6EEE2")
        draw.text((bx + 12, y + 95), a.upper(), font=F["mono_sm"], fill="#8A8F99")
        draw.text((bx + 12, y + 116), b, font=F["bold_sm"], fill=INK)
    paragraph(draw, (x + 20, y + 154), "Comparación orientativa contra referencia de mercado disponible.", 310, F["body_xs"], "#26714D", 1)


def cost_rows(draw, x, y):
    rows = [("Entrada 20%", "59.000 €"), ("ITP Madrid", "17.700 €"), ("Notaría + registro", "2.400 €"), ("Cuota estimada", "1.180 €/mes"), ("Comunidad", "78 €/mes")]
    for i, (a, b) in enumerate(rows):
        yy = y + i * 54
        rounded(draw, (x, yy, x + 354, yy + 42), 13, "#F7F7F8", LINE)
        draw.text((x + 16, yy + 13), a, font=F["body_xs"], fill=MUTED)
        draw.text((x + 220, yy + 12), b, font=F["bold_sm"], fill=INK)


def env_rows(draw, x, y):
    rows = [("Dificultad parking", "8/10"), ("Metro más cercano", "240 m"), ("Bus cercano", "4 líneas"), ("Ruido probable", "Bajo"), ("Confianza", "76%")]
    for i, (a, b) in enumerate(rows):
        yy = y + i * 54
        rounded(draw, (x, yy, x + 354, yy + 42), 13, "#F7F7F8", LINE)
        draw.text((x + 16, yy + 13), a, font=F["body_xs"], fill=MUTED)
        draw.text((x + 236, yy + 12), b, font=F["bold_sm"], fill=INK)


def site_panel(canvas, x, y, w=600, h=260):
    d = ImageDraw.Draw(canvas)
    shadow(canvas, (x, y, x + w, y + h), 28, 28, 20)
    rounded(d, (x, y, x + w, y + h), 28, SURFACE, LINE)
    logo(canvas, x + 26, y + 24, 36)
    rounded(d, (x + w - 178, y + 28, x + w - 30, y + 68), 20, RADAR, None)
    d.text((x + w - 142, y + 40), "Empezar gratis", font=F["bold_sm"], fill=SURFACE)
    compact = h <= 230
    d.text((x + 30, y + 96), "Descubre lo que el anuncio no te cuenta.", font=F["h3"] if compact else F["h2"], fill=INK)
    paragraph(d, (x + 30, y + (132 if compact else 146)), "Web, guías y extensión conectadas para analizar anuncios antes de contactar.", w - 60, F["body_xs"] if compact else F["body_sm"], MUTED, 3 if compact else 5)
    for i, (k, v) in enumerate([("PRECIO", "€/m²"), ("COSTES", "Entrada"), ("ZONA", "Parking")]):
        bx = x + 30 + i * 176
        rounded(d, (bx, y + h - 64, bx + 154, y + h - 18), 14, "#FAFAFA", LINE)
        d.text((bx + 14, y + h - 51), k, font=F["mono_sm"], fill=RADAR)
        d.text((bx + 14, y + h - 32), v, font=F["bold_sm"], fill=INK)


def footer_note(draw, value, dark=False):
    draw.text((64, 744), value, font=F["mono"], fill=(255, 255, 255, 150) if dark else "#7A7A82")


def base(dark=False):
    img = Image.new("RGBA", (W, H), DARK if dark else BG)
    grid_bg(img, dark=dark)
    return img


def screenshot_01():
    img = base()
    d = ImageDraw.Draw(img)
    logo(img, 64, 42, 42)
    pill(d, (64, 126), "Copiloto inmobiliario", dot=RADAR)
    headline(d, 64, 180, ["Analiza anuncios", "antes de", "contactar."], orange_line=(1, 2), small=True)
    paragraph(d, (68, 392), "InmoRadar añade una capa de análisis sobre Idealista, Fotocasa, Pisos.com y Habitaclia para revisar precio, costes y zona en segundos.", 492)
    for i, item in enumerate(["2 días gratis", "Sin pago inicial", "Premium 1,99 €/semana"]):
        pill(d, (68 + i * 170, 504), item, fill=SURFACE, outline=LINE, color=INK)
    portal_card(img, 640, 106)
    body = extension_shell(img, 880, 86, "Resumen")
    insight(d, body[0], body[1], "Insight del día", "Precio, costes y logística diaria antes de contactar.", "✦")
    score_cards(d, body[0], body[1] + 96)
    price_card(d, body[0], body[1] + 232)
    footer_note(d, "Screenshot 01 · Análisis del anuncio")
    return img.convert("RGB")


def screenshot_02():
    img = base()
    d = ImageDraw.Draw(img)
    logo(img, 64, 42, 42)
    pill(d, (64, 126), "Precio real vs mercado", dot=GOOD)
    headline(d, 64, 180, ["Detecta si está", "caro o barato."], orange_line=1)
    paragraph(d, (68, 362), "Compara el precio del anuncio con referencias de mercado por zona o municipio, sin vender un dato municipal como precio exacto de calle.", 510)
    shadow(img, (558, 508, 816, 680), 24, 24, 18)
    rounded(d, (558, 508, 816, 680), 24, SURFACE, LINE)
    d.text((586, 538), "Referencia", font=F["h3"], fill=INK)
    for i, (k, v) in enumerate([("VENTA", "3.782 €/m²"), ("LECTURA", "Oportunidad")]):
        yy = 588 + i * 44
        d.text((586, yy), k, font=F["mono_sm"], fill=RADAR)
        d.text((690, yy - 3), v, font=F["bold_sm"], fill=INK)
    body = extension_shell(img, 826, 96, "Resumen")
    price_card(d, body[0], body[1] + 18)
    for i, (a, b) in enumerate([("Precio total", "295.000 €"), ("Superficie", "78 m²"), ("Precisión", "Alta"), ("Fuente", "Municipal + zona")]):
        yy = body[1] + 240 + i * 54
        rounded(d, (body[0], yy, body[0] + 354, yy + 42), 13, "#F7F7F8", LINE)
        d.text((body[0] + 16, yy + 13), a, font=F["body_xs"], fill=MUTED)
        d.text((body[0] + 210, yy + 12), b, font=F["bold_sm"], fill=INK)
    footer_note(d, "Screenshot 02 · Precio y referencia de mercado")
    return img.convert("RGB")


def screenshot_03():
    img = base()
    d = ImageDraw.Draw(img)
    logo(img, 64, 42, 42)
    pill(d, (64, 126), "Coste inicial y mensual", dot=AMBER)
    headline(d, 64, 180, ["Lo que de verdad", "vas a pagar."])
    paragraph(d, (68, 362), "Entrada, impuestos, notario, cuota estimada y gastos recurrentes en una sola vista orientativa.", 500)
    for i, item in enumerate(["Entrada", "Impuestos", "Hipoteca", "Gastos"]):
        pill(d, (68 + i * 124, 470), item, fill=SURFACE, outline=LINE, color=INK)
    body = extension_shell(img, 824, 90, "Costes")
    insight(d, body[0], body[1], "Coste real", "El desembolso inicial estimado es de 88.400 € antes de mudarte.", "€")
    cost_rows(d, body[0], body[1] + 102)
    shadow(img, (560, 525, 1172, 670), 24, 24, 18)
    rounded(d, (560, 525, 1172, 670), 24, SURFACE, LINE)
    for i, (k, v) in enumerate([("INICIAL", "88.400 €"), ("MENSUAL", "1.258 €"), ("RIESGO", "Medio")]):
        bx = 588 + i * 188
        rounded(d, (bx, 553, bx + 162, 642), 18, "#FAFAFA", LINE)
        d.text((bx + 16, 573), k, font=F["mono_sm"], fill=RADAR)
        d.text((bx + 16, 598), v, font=F["bold"], fill=INK)
    footer_note(d, "Screenshot 03 · Costes reales")
    return img.convert("RGB")


def screenshot_04():
    img = base()
    d = ImageDraw.Draw(img)
    logo(img, 64, 42, 42)
    pill(d, (64, 126), "Entorno y vida diaria", dot=RADAR)
    headline(d, 64, 180, ["La zona también", "decide."])
    paragraph(d, (68, 362), "Transporte cercano, aparcamiento, ruido probable y señales urbanas para valorar la vivienda antes de agendar visita.", 500)
    for i, item in enumerate(["Parking", "Transporte", "Ruido", "Servicios"]):
        pill(d, (68 + i * 132, 470), item, fill=SURFACE, outline=LINE, color=INK)
    body = extension_shell(img, 826, 90, "Entorno")
    insight(d, body[0], body[1], "Aparcamiento", "Zona con dificultad alta para visitante. Revisa garaje o transporte.", "P")
    env_rows(d, body[0], body[1] + 102)
    shadow(img, (548, 510, 1160, 710), 24, 24, 18)
    rounded(d, (548, 510, 1160, 710), 24, SURFACE, LINE)
    rounded(d, (572, 535, 1136, 686), 18, "#F5F2EA", None)
    for x in range(590, 1130, 42):
        d.line((x, 535, x - 190, 686), fill=(9, 9, 11, 24), width=2)
    d.ellipse((818, 566, 930, 678), outline=RADAR, width=4, fill=(255, 69, 0, 22))
    d.ellipse((862, 610, 888, 636), fill=RADAR)
    d.text((590, 552), "Mapa orientativo de entorno", font=F["mono"], fill=MUTED)
    footer_note(d, "Screenshot 04 · Entorno y aparcamiento")
    return img.convert("RGB")


def screenshot_05():
    img = base(dark=True)
    d = ImageDraw.Draw(img)
    logo(img, 64, 42, 42, dark_word=True)
    pill(d, (64, 126), "Extensión + web", fill="#151515", outline="#2D2D2D", color=SURFACE, dot=RADAR)
    headline(d, 64, 180, ["Guarda, compara", "y decide mejor."], white=True)
    paragraph(d, (68, 362), "Crea una lista de inmuebles, ordénala por criterio y envíala por email si eres Premium.", 500, fill="#D4D4D8")
    for i, item in enumerate(["Lista guardada", "Email Premium", "Portal seguro"]):
        pill(d, (68 + i * 170, 470), item, fill="#151515", outline="#2D2D2D", color=SURFACE)
    body = extension_shell(img, 800, 88, "Resumen")
    d.text((body[0], body[1]), "Inmuebles guardados", font=F["h3"], fill=INK)
    rounded(d, (body[0], body[1] + 48, body[0] + 354, body[1] + 86), 14, "#F4F4F5", LINE)
    d.text((body[0] + 16, body[1] + 59), "Mejor puntuación", font=F["body_xs"], fill=MUTED)
    rows = [("Puente de Vallecas", "389.000 €", "7,8"), ("Portazgo", "305.000 €", "7,4"), ("Goya 142", "295.000 €", "8,4")]
    for i, (a, b, c) in enumerate(rows):
        yy = body[1] + 112 + i * 74
        rounded(d, (body[0], yy, body[0] + 354, yy + 60), 14, SURFACE, LINE)
        d.text((body[0] + 16, yy + 12), a, font=F["bold_sm"], fill=INK)
        d.text((body[0] + 16, yy + 34), "Madrid · IDEALISTA", font=F["mono_sm"], fill=MUTED)
        d.text((body[0] + 210, yy + 18), b, font=F["body_xs"], fill=INK)
        d.text((body[0] + 310, yy + 18), c, font=F["bold_sm"], fill=RADAR)
    site_panel(img, 510, 492, 640, 218)
    footer_note(d, "Screenshot 05 · Lista de inmuebles y web", dark=True)
    return img.convert("RGB")


def promo_tile():
    w, h = 440, 280
    img = Image.new("RGBA", (w, h), DARK)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 32):
        d.line((x, 0, x, h), fill=(255, 69, 0, 22), width=1)
    for y in range(0, h, 32):
        d.line((0, y, w, y), fill=(255, 69, 0, 22), width=1)
    if LOGO.exists():
        mark = Image.open(LOGO).convert("RGBA").resize((44, 44), Image.Resampling.LANCZOS)
        img.alpha_composite(mark, (28, 28))
    d.text((84, 38), "Inmo", font=font("black", 24), fill=SURFACE)
    d.text((148, 38), "Radar", font=font("black", 24), fill=RADAR)
    d.text((28, 106), "Analiza anuncios", font=font("black", 34), fill=SURFACE)
    d.text((28, 145), "antes de contactar.", font=font("black", 34), fill=RADAR)
    rounded(d, (28, 222, 156, 252), 15, RADAR, None)
    d.text((46, 231), "Gratis 2 días", font=font("bold", 14), fill=SURFACE)
    d.text((178, 229), "Precio · Costes · Zona", font=font("body", 15), fill="#D4D4D8")
    return img.convert("RGB")


def promo_marquee():
    w, h = 1400, 560
    img = Image.new("RGBA", (w, h), DARK)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 40):
        d.line((x, 0, x, h), fill="#262626", width=1)
    for y in range(0, h, 40):
        d.line((0, y, w, y), fill="#262626", width=1)

    # Warm glow blocks without transparency in the final exported RGB file.
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((850, -120, 1520, 620), fill=(255, 69, 0, 42))
    gd.ellipse((610, 280, 1060, 760), fill=(255, 255, 255, 18))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(42)))

    logo(img, 72, 54, 54, dark_word=True)
    pill(d, (74, 142), "Copiloto inmobiliario", fill="#151515", outline="#333333", color=SURFACE, dot=RADAR)

    title_font = font("black", 58)
    d.text((72, 196), "Analiza anuncios", font=title_font, fill=SURFACE)
    d.text((72, 276), "antes de contactar.", font=title_font, fill=RADAR)
    paragraph(
        d,
        (76, 372),
        "Precio real, costes, zona, transporte y aparcamiento encima de Idealista, Fotocasa, Pisos.com y Habitaclia.",
        650,
        font("body", 24),
        "#D4D4D8",
        7,
    )

    rounded(d, (76, 472, 288, 518), 23, RADAR, None)
    d.text((114, 486), "Empezar gratis", font=font("bold", 17), fill=SURFACE)
    d.text((316, 486), "2 días gratis · Sin pago inicial · Premium semanal", font=font("body", 18), fill="#D4D4D8")

    # Large browser/product card.
    shadow(img, (782, 54, 1308, 506), 32, 52, 24)
    rounded(d, (782, 54, 1308, 506), 32, SURFACE, LINE)
    rounded(d, (806, 82, 1284, 158), 26, INK, None)
    logo(img, 830, 103, 32, dark_word=True)
    rounded(d, (1150, 106, 1246, 134), 14, "#F4F4F5", None)
    d.text((1168, 114), "v1.0.10", font=F["mono_sm"], fill="#A1A1AA")
    for i, t in enumerate(["Resumen", "Costes", "Entorno"]):
        active = i == 0
        x = 820 + i * 150
        rounded(d, (x, 184, x + 128, 224), 16, INK if active else "#F4F4F5", LINE)
        d.text((x + 31, 196), t, font=F["tab"], fill=SURFACE if active else MUTED)

    rounded(d, (820, 252, 1270, 358), 22, GOOD_SOFT, "#A7F3D0")
    d.text((846, 276), "-22,0%", font=font("black", 52), fill=GOOD)
    rounded(d, (1010, 286, 1134, 316), 15, GOOD, None)
    d.text((1028, 294), "BUEN PRECIO", font=F["mono_sm"], fill=SURFACE)
    d.text((846, 392), "Precio anuncio", font=F["mono"], fill="#8A8F99")
    d.text((846, 420), "1.082 €/m²", font=font("black", 34), fill=INK)
    d.text((1074, 392), "Referencia", font=F["mono"], fill="#8A8F99")
    d.text((1074, 420), "1.387 €/m²", font=font("black", 34), fill=INK)

    # Floating proof cards.
    for i, (k, v) in enumerate([("Coste inicial", "88.400 €"), ("Zona", "6,8/10"), ("Parking", "8/10")]):
        x = 720 + i * 180
        y = 430 + (i % 2) * 18
        shadow(img, (x, y, x + 158, y + 88), 20, 24, 16)
        rounded(d, (x, y, x + 158, y + 88), 20, "#FAFAFA", LINE)
        d.text((x + 18, y + 18), k.upper(), font=F["mono_sm"], fill=RADAR)
        d.text((x + 18, y + 44), v, font=F["bold"], fill=INK)

    return img.convert("RGB")


def webstore_icon():
    size = 128
    img = Image.new("RGBA", (size, size), DARK)
    d = ImageDraw.Draw(img)
    for x in range(0, size, 16):
        d.line((x, 0, x, size), fill="#1F1F1F", width=1)
    for y in range(0, size, 16):
        d.line((0, y, size, y), fill="#1F1F1F", width=1)
    d.ellipse((16, 16, 112, 112), fill="#111111", outline=RADAR, width=4)
    if LOGO.exists():
        mark = Image.open(LOGO).convert("RGBA").resize((78, 78), Image.Resampling.LANCZOS)
        img.alpha_composite(mark, (25, 25))
    else:
        d.ellipse((32, 32, 96, 96), fill=SURFACE)
        d.ellipse((50, 50, 78, 78), fill=DARK)
    return img.convert("RGB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    shots = [
        ("01.png", screenshot_01()),
        ("02.png", screenshot_02()),
        ("03.png", screenshot_03()),
        ("04.png", screenshot_04()),
        ("05.png", screenshot_05()),
        ("promo-440x280.png", promo_tile()),
        ("promo-marquee-1400x560.png", promo_marquee()),
        ("icon-chrome-web-store-128.png", webstore_icon()),
    ]
    for name, img in shots:
        img.save(OUT / name, optimize=True, quality=95)
        print(f"{name}: {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
