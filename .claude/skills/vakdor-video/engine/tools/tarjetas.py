"""
tarjetas.py — dibuja las capas graficas del Video Studio como PNG con transparencia.

Por que PIL y no Remotion: Remotion renderiza con Chromium frame a frame. Para una
tarjeta que aparece 3 segundos, levantar un navegador cuesta mas que el efecto. PIL
dibuja el PNG una vez y ffmpeg lo estampa con `overlay ... enable='between(t,a,b)'`,
que es la misma arquitectura hibrida del spec: ffmpeg mueve pixeles, otra cosa dibuja.

Uso:  python tarjetas.py spec.json carpeta_salida
El spec es una lista de tarjetas; cada una escribe <id>.png y devuelve su tamaño real
por stdout en JSON, para que quien componga sepa donde ubicarla.

Tipos:
  subtitulo  texto con resaltado en cobre de las palabras clave
  dato       numero grande + etiqueta (ej: "40" / "vendedores")
  barra      comparacion 80/20 con barra partida
  frase      declaracion corta, tipo placa de autoridad
  chip       pildora chica con punto de acento
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FUENTE = r"C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\_motor-video\fonts\Inter-SemiBold-600.ttf"

MARCA = {
    "fondo": (10, 15, 26),
    "titulo": (255, 255, 255),
    "texto": (180, 186, 197),
    "acento": (192, 124, 65),
    # El cobre de marca (#C07C41) es perfecto sobre fondo oscuro, pero sobre una
    # pared clara pierde contraste y la palabra que MAS tiene que resaltar es la
    # que menos se lee. Para texto sin caja se usa esta version aclarada: es el
    # mismo tono, con mas luz.
    "acento_claro": (232, 160, 92),
}

# Todo se dibuja al triple y se reduce al final: PIL no tiene antialias en los
# rectangulos redondeados, y sin esto los bordes salen escalonados y baratos.
SS = 3


def fuente(px):
    return ImageFont.truetype(FUENTE, px * SS)


def ancho_de(texto, f):
    return f.getbbox(texto)[2] - f.getbbox(texto)[0]


def lienzo(w, h):
    return Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))


def caja(d, xy, radio, relleno, borde=None, grosor=2):
    d.rounded_rectangle(
        [xy[0] * SS, xy[1] * SS, xy[2] * SS, xy[3] * SS],
        radius=radio * SS, fill=relleno,
        outline=borde, width=grosor * SS if borde else 0,
    )


def reducir(img):
    return img.resize((img.width // SS, img.height // SS), Image.LANCZOS)


def barra_acento(d, x, y, alto, ancho=6):
    """La barrita de acento a la izquierda. Es la firma visual de la marca."""
    d.rounded_rectangle(
        [x * SS, y * SS, (x + ancho) * SS, (y + alto) * SS],
        radius=(ancho // 2) * SS, fill=MARCA["acento"] + (255,),
    )


def subtitulo(t, p=1.0):
    """
    Tarjeta de subtitulo: caja oscura translucida, con las palabras clave en cobre.

    Con `p` (0 a 1) las palabras VAN APARECIENDO al ritmo del habla, no todas
    juntas: cada parte trae `aparece` (0 a 1) con el momento en que se dice.

    La caja se dibuja SIEMPRE del tamaño de la frase completa. Si creciera con
    cada palabra estaria saltando todo el tiempo y seria imposible de leer.
    """
    partes = t["partes"]  # [{"txt": "...", "clave": bool, "aparece": 0..1}, ...]
    f = fuente(t.get("px", 46))
    pad_x, pad_y, gap = 34, 24, 0
    ancho_txt = sum(ancho_de(p["txt"], f) for p in partes) // SS
    alto_txt = (f.getbbox("Ag")[3] - f.getbbox("Ag")[1]) // SS

    w = ancho_txt + pad_x * 2 + 14
    h = alto_txt + pad_y * 2
    img = lienzo(w, h)
    d = ImageDraw.Draw(img)
    caja(d, (0, 0, w, h), 18, MARCA["fondo"] + (216,))
    barra_acento(d, 14, pad_y - 2, alto_txt + 4)

    x = (pad_x + 14) * SS
    y = (pad_y - 6) * SS
    for parte in partes:
        ap = parte.get("aparece", 0.0)
        # transicion corta por palabra: entra en un 8% del largo de la frase
        vis = min(1.0, max(0.0, (p - ap) / 0.08)) if p is not None else 1.0
        if vis > 0.02:
            color = MARCA["acento"] if parte["clave"] else MARCA["titulo"]
            capa = Image.new("RGBA", img.size, (0, 0, 0, 0))
            dc = ImageDraw.Draw(capa)
            dc.text((x, y), parte["txt"], font=f, fill=color + (int(255 * vis),))
            img = Image.alpha_composite(img, capa)
        x += ancho_de(parte["txt"], f) + gap
    return reducir(img)


def dato(t):
    """Numero grande + etiqueta. Para 'Tengo 40 vendedores'."""
    fn = fuente(t.get("px_num", 132))
    fl = fuente(t.get("px_lab", 34))
    num = t["numero"]
    # Se mide la etiqueta YA en mayusculas: medirla en minusculas y dibujarla en
    # mayusculas hacia que el texto se saliera de la caja (mayusculas ocupan mas).
    lab = t["etiqueta"].upper()
    w_num, w_lab = ancho_de(num, fn) // SS, ancho_de(lab, fl) // SS
    pad = 40
    w = max(w_num, w_lab) + pad * 2 + 18
    h = 210
    img = lienzo(w, h)
    d = ImageDraw.Draw(img)
    caja(d, (0, 0, w, h), 24, MARCA["fondo"] + (224,))
    barra_acento(d, 18, 34, h - 68)
    d.text(((pad + 18) * SS, 26 * SS), num, font=fn, fill=MARCA["titulo"] + (255,))
    d.text(((pad + 18) * SS, 158 * SS), lab, font=fl, fill=MARCA["texto"] + (255,))
    return reducir(img)


def suavizar(p):
    """Curva de entrada: arranca rapido y frena al final (easeOutCubic).
    Una animacion lineal se lee mecanica; esta se lee intencional."""
    return 1 - (1 - p) ** 3


def barra(t, p=1.0):
    """
    Comparacion tipo 80/20: barra partida + las dos etiquetas.

    Con `p` (0 a 1) la barra CRECE y los numeros CUENTAN. Que el 80% se llene
    delante de los ojos hace que el dato se entienda solo; puesto de golpe es
    un numero mas.
    """
    q = suavizar(min(1.0, max(0.0, p)))
    pct_obj = t.get("pct", 80)
    pct = pct_obj * q
    fi = fuente(40)
    fp = fuente(30)
    w, h = t.get("ancho", 760), 200
    img = lienzo(w, h)
    d = ImageDraw.Draw(img)
    caja(d, (0, 0, w, h), 24, MARCA["fondo"] + (224,))
    d.text((36 * SS, 26 * SS), t["titulo"], font=fi, fill=MARCA["titulo"] + (255,))

    bx0, bx1, by = 36, w - 36, 106
    alto_b = 26
    caja(d, (bx0, by, bx1, by + alto_b), alto_b // 2, (255, 255, 255, 38))
    corte = bx0 + int((bx1 - bx0) * pct / 100)
    if corte <= bx0 + 2:
        corte = bx0 + 2  # que no desaparezca del todo al arrancar
    caja(d, (bx0, by, corte, by + alto_b), alto_b // 2, MARCA["acento"] + (255,))

    izq = t["izq"].replace("{pct}", f"{round(pct)}")
    der = t["der"].replace("{resto}", f"{round(100 - pct)}")
    d.text((36 * SS, 148 * SS), izq, font=fp, fill=MARCA["acento"] + (255,))
    w_der = ancho_de(der, fp) // SS
    d.text(((w - 36 - w_der) * SS, 148 * SS), der, font=fp, fill=MARCA["texto"] + (255,))
    return reducir(img)


def frase(t):
    """Placa de autoridad: una linea corta, con mucho aire."""
    f = fuente(t.get("px", 58))
    lineas = t["lineas"]
    anchos = [ancho_de(l, f) // SS for l in lineas]
    alto_l = int((f.getbbox("Ag")[3] - f.getbbox("Ag")[1]) / SS * 1.45)
    pad = 44
    w = max(anchos) + pad * 2 + 18
    h = alto_l * len(lineas) + pad * 2
    img = lienzo(w, h)
    d = ImageDraw.Draw(img)
    caja(d, (0, 0, w, h), 24, MARCA["fondo"] + (230,))
    barra_acento(d, 18, pad - 4, h - (pad - 4) * 2)
    for i, l in enumerate(lineas):
        d.text(((pad + 18) * SS, (pad - 10 + i * alto_l) * SS), l, font=f,
               fill=MARCA["titulo"] + (255,))
    return reducir(img)


def chip(t):
    """Pildora chica con punto de acento. Para conceptos sueltos."""
    f = fuente(t.get("px", 36))
    txt = t["texto"]
    pad_x, h = 30, 74
    w = ancho_de(txt, f) // SS + pad_x * 2 + 34
    img = lienzo(w, h)
    d = ImageDraw.Draw(img)
    caja(d, (0, 0, w, h), h // 2, MARCA["fondo"] + (224,))
    r = 7
    cx, cy = pad_x - 2, h // 2
    d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS],
              fill=MARCA["acento"] + (255,))
    d.text(((pad_x + 22) * SS, (h // 2 - 26) * SS), txt, font=f, fill=MARCA["titulo"] + (255,))
    return reducir(img)


def titular(t):
    """
    Tipografia de enfasis SOBRE el video, sin caja: es lo que separa un video con
    autoridad de uno con subtitulos de YouTube. La palabra que carga la frase va
    mas grande y en cobre; el resto en blanco y mas chico.

    No lleva caja, asi que la legibilidad depende de la sombra: se dibuja el texto
    en negro sobre una capa aparte, se desenfoca y se compone debajo. Sin eso, el
    texto blanco sobre una pared clara desaparece.

    `lineas` es una lista de listas de trozos: [[{"txt":..., "fuerte":bool}, ...], ...]
    """
    lineas = t["lineas"]
    px = t.get("px", 66)
    px_fuerte = t.get("px_fuerte", int(px * 1.58))
    f_n, f_f = fuente(px), fuente(px_fuerte)
    alto_l = int(px_fuerte * 1.28)

    medidos = []
    for ln in lineas:
        trozos = [(p, f_f if p.get("fuerte") else f_n) for p in ln]
        ancho = sum(ancho_de(p["txt"], f) for p, f in trozos) // SS
        medidos.append((trozos, ancho))

    margen = 90
    w = max(a for _, a in medidos) + margen * 2
    h = alto_l * len(lineas) + 70

    capa = lienzo(w, h)
    d = ImageDraw.Draw(capa)
    sombra = lienzo(w, h)
    ds = ImageDraw.Draw(sombra)

    for i, (trozos, ancho) in enumerate(medidos):
        x = ((w - ancho) // 2) * SS
        for p, f in trozos:
            # la linea base se alinea abajo para que los dos tamaños no bailen
            dy = (alto_l - (px_fuerte if f is f_f else px)) * 0.62
            y = (35 + i * alto_l + dy) * SS
            ds.text((x, y), p["txt"], font=f, fill=(0, 0, 0, 235))
            d.text((x, y), p["txt"], font=f,
                   fill=(MARCA["acento_claro"] if p.get("fuerte") else MARCA["titulo"]) + (255,))
            x += ancho_de(p["txt"], f)

    sombra = sombra.filter(ImageFilter.GaussianBlur(11 * SS))
    return reducir(Image.alpha_composite(sombra, capa))


def panel(t, p=1.0):
    """
    PANEL DIVIDIDO: el video se achica a la mitad de abajo y arriba queda una
    zona oscura para explicar. Esto dibuja SOLO la parte de arriba (mas el fondo
    completo); el video reducido lo pone el compositor encima.

    Cuando conviene: cuando hay que MOSTRAR algo mientras el habla -- un dato que
    se arma, una lista que crece, una comparacion. La cara sigue estando (que es
    lo que sostiene la atencion) pero deja de ser el centro por unos segundos.

    Cuando NO conviene: para una frase suelta. Si se usa para todo, el video
    termina siendo una presentacion con una cara chiquita abajo, y se pierde
    justo lo que hace que un reel funcione.
    """
    w, h = t.get("w", 1080), t.get("h", 1920)
    alto_zona = t.get("alto_zona", 740)
    img = _fondo_placa(w, h)
    d = ImageDraw.Draw(img)
    q = suavizar(min(1.0, max(0.0, p)))

    y = 150
    if t.get("kicker"):
        fk = fuente(32)
        d.text((90 * SS, y * SS), t["kicker"].upper(), font=fk, fill=MARCA["acento"] + (255,))
        y += 62

    ft = fuente(t.get("px", 62))
    for linea in t.get("lineas", []):
        d.text((90 * SS, y * SS), linea, font=ft, fill=MARCA["titulo"] + (255,))
        y += int(t.get("px", 62) * 1.28)

    # lista que va apareciendo item por item, de a uno
    items = t.get("items", [])
    if items:
        fi = fuente(38)
        y += 24
        for i, it in enumerate(items):
            pi = min(1.0, max(0.0, q * len(items) - i))
            if pi <= 0.02:
                continue
            cap = Image.new("RGBA", img.size, (0, 0, 0, 0))
            dc = ImageDraw.Draw(cap)
            a = int(255 * pi)
            dx = int(18 * (1 - pi))
            r = 8
            dc.ellipse([(96 - r + dx) * SS, (y + 22 - r) * SS, (96 + r + dx) * SS, (y + 22 + r) * SS],
                       fill=MARCA["acento"] + (a,))
            dc.text(((126 + dx) * SS, y * SS), it, font=fi, fill=MARCA["titulo"] + (a,))
            img = Image.alpha_composite(img, cap)
            y += 66

    # linea que separa la zona de explicacion del video
    d.rectangle([0, (alto_zona - 2) * SS, w * SS, alto_zona * SS],
                fill=MARCA["acento"] + (70,))
    return reducir(img)


def _pegar_logo(img, ruta, ancho, cx, y, alfa=255):
    """Pega un logo centrado en `cx`, escalado a `ancho` px de ancho real."""
    lg = Image.open(ruta).convert("RGBA")
    esc = (ancho * SS) / lg.width
    lg = lg.resize((int(lg.width * esc), int(lg.height * esc)), Image.LANCZOS)
    if alfa < 255:
        a = lg.getchannel("A").point(lambda v: int(v * alfa / 255))
        lg.putalpha(a)
    capa = Image.new("RGBA", img.size, (0, 0, 0, 0))
    capa.paste(lg, (int(cx * SS - lg.width / 2), int(y * SS)), lg)
    return Image.alpha_composite(img, capa)


def portada(t, p=1.0):
    """
    Portada de inicio: el gancho. Tiene que decir en 2 segundos por que alguien
    se queda. Marca chica arriba, gancho grande al medio.
    """
    w, h = t.get("w", 1080), t.get("h", 1920)
    img = _fondo_placa(w, h)
    q = suavizar(min(1.0, max(0.0, p)))

    if t.get("logo"):
        img = _pegar_logo(img, t["logo"], 150, w // 2, 250, alfa=int(255 * min(1, q * 2)))

    d = ImageDraw.Draw(img)
    f = fuente(t.get("px", 104))
    fk = fuente(34)
    lineas = t["lineas"]
    alto_l = int(t.get("px", 104) * 1.22)
    y0 = (h - alto_l * len(lineas)) // 2 + 60

    if t.get("kicker"):
        wk = ancho_de(t["kicker"].upper(), fk) // SS
        d.text((((w - wk) // 2) * SS, (y0 - 110) * SS), t["kicker"].upper(), font=fk,
               fill=MARCA["acento"] + (255,))

    for i, ln in enumerate(lineas):
        # cada linea entra un toque despues que la anterior
        pi = min(1.0, max(0.0, q * len(lineas) * 1.4 - i))
        if pi <= 0.02:
            continue
        cap = Image.new("RGBA", img.size, (0, 0, 0, 0))
        dc = ImageDraw.Draw(cap)
        wl = ancho_de(ln["txt"], f) // SS
        sube = int(22 * (1 - pi))
        col = MARCA["acento"] if ln.get("fuerte") else MARCA["titulo"]
        dc.text((((w - wl) // 2) * SS, (y0 + i * alto_l + sube) * SS), ln["txt"], font=f,
                fill=col + (int(255 * pi),))
        img = Image.alpha_composite(img, cap)

    if t.get("pie"):
        d = ImageDraw.Draw(img)
        fp = fuente(34)
        wp = ancho_de(t["pie"], fp) // SS
        d.text((((w - wp) // 2) * SS, (y0 + alto_l * len(lineas) + 80) * SS), t["pie"],
               font=fp, fill=MARCA["texto"] + (255,))
    return reducir(img)


def cierre(t, p=1.0):
    """
    Cierre: marca + una sola cosa para hacer. Dos llamados a la accion es
    ninguno, asi que va una linea y el contacto, nada mas.
    """
    w, h = t.get("w", 1080), t.get("h", 1920)
    img = _fondo_placa(w, h)
    q = suavizar(min(1.0, max(0.0, p)))
    cy = h // 2

    if t.get("logo"):
        img = _pegar_logo(img, t["logo"], 260, w // 2, cy - 430, alfa=int(255 * min(1, q * 1.6)))

    d = ImageDraw.Draw(img)
    f = fuente(t.get("px", 68))
    for i, ln in enumerate(t["lineas"]):
        wl = ancho_de(ln, f) // SS
        d.text((((w - wl) // 2) * SS, (cy - 60 + i * int(t.get("px", 68) * 1.3)) * SS), ln,
               font=f, fill=MARCA["titulo"] + (255,))

    # subrayado de acento que se dibuja solo
    largo = int(w * 0.32 * q)
    if largo > 6:
        d.rounded_rectangle([((w - largo) // 2) * SS, (cy + 150) * SS,
                             ((w + largo) // 2) * SS, (cy + 156) * SS],
                            radius=3 * SS, fill=MARCA["acento"] + (255,))

    if t.get("contacto"):
        fc = fuente(40)
        wc = ancho_de(t["contacto"], fc) // SS
        d.text((((w - wc) // 2) * SS, (cy + 210) * SS), t["contacto"], font=fc,
               fill=MARCA["acento"] + (255,))
    return reducir(img)


def _fondo_placa(w, h):
    """
    Fondo de placa: base oscura OPACA + un halo de acento muy tenue arriba a la
    derecha. Un plano liso se lee barato; el halo da profundidad sin robar atencion.

    OJO: `ImageDraw` REEMPLAZA el pixel, no lo mezcla. Dibujar los circulos del halo
    directo sobre la base con alfa baja no aclaraba: agujereaba la placa (dejaba
    alfa 12 donde tenia que haber 255) y al componerla sobre el video se veia el
    video a traves. Por eso el halo se arma en su propia capa y se une con
    `alpha_composite`, que si mezcla.
    """
    base = Image.new("RGBA", (w * SS, h * SS), MARCA["fondo"] + (255,))
    halo = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    dh = ImageDraw.Draw(halo)
    cx, cy, r = int(w * 0.88), int(h * 0.16), int(w * 0.55)
    for i in range(30, 0, -1):
        rr = int(r * i / 30)
        dh.ellipse([(cx - rr) * SS, (cy - rr) * SS, (cx + rr) * SS, (cy + rr) * SS],
                   fill=MARCA["acento"] + (3,))
    return Image.alpha_composite(base, halo)


def placa(t):
    """Placa a PANTALLA COMPLETA: el video desaparece y queda la declaracion.
    Se usa poco y en el golpe: si aparece cada 5 segundos deja de golpear."""
    w, h = t.get("w", 1080), t.get("h", 1920)
    img = _fondo_placa(w, h)
    d = ImageDraw.Draw(img)

    f = fuente(t.get("px", 96))
    lineas = t["lineas"]
    alto_l = int((f.getbbox("Ag")[3] - f.getbbox("Ag")[1]) / SS * 1.34)
    bloque = alto_l * len(lineas)
    y0 = (h - bloque) // 2

    if t.get("kicker"):
        fk = fuente(34)
        d.text((110 * SS, (y0 - 96) * SS), t["kicker"].upper(), font=fk,
               fill=MARCA["acento"] + (255,))

    barra_acento(d, 110, y0 + 6, bloque - 18, ancho=8)
    for i, l in enumerate(lineas):
        d.text((150 * SS, (y0 - 12 + i * alto_l) * SS), l, font=f,
               fill=MARCA["titulo"] + (255,))

    if t.get("pie"):
        fp = fuente(32)
        d.text((110 * SS, (y0 + bloque + 70) * SS), t["pie"], font=fp,
               fill=MARCA["texto"] + (255,))
    return reducir(img)


def comparacion(t, p=1.0):
    """Placa completa de contraste: un numero tachado y el que lo reemplaza.
    Para 'no necesitas 40, necesitas 5'."""
    w, h = t.get("w", 1080), t.get("h", 1920)
    img = _fondo_placa(w, h)
    d = ImageDraw.Draw(img)

    fn = fuente(190)
    fl = fuente(36)
    cy = h // 2
    # La animacion cuenta una historia en 3 tiempos: primero esta el 40, despues
    # se TACHA, y recien entonces aparece el 5. Que se superpongan lo arruina.
    q = min(1.0, max(0.0, p))
    p_tachado = suavizar(min(1.0, q / 0.45))              # 0 -> 45%
    p_flecha = suavizar(min(1.0, max(0.0, (q - 0.40) / 0.25)))
    p_cinco = suavizar(min(1.0, max(0.0, (q - 0.55) / 0.45)))

    # el que se descarta: gris y tachado
    a_txt = t["antes"]
    wa = ancho_de(a_txt, fn) // SS
    xa = (w - wa) // 2
    d.text((xa * SS, (cy - 330) * SS), a_txt, font=fn, fill=(120, 126, 138, 255))
    ym = cy - 330 + 118
    largo = int((wa + 32) * p_tachado)
    if largo > 4:
        d.rounded_rectangle([(xa - 16) * SS, (ym - 5) * SS, (xa - 16 + largo) * SS, (ym + 5) * SS],
                            radius=5 * SS, fill=(150, 156, 168, 255))
    la = t["antes_label"]
    d.text((((w - ancho_de(la, fl) // SS) // 2) * SS, (cy - 130) * SS), la.upper(),
           font=fl, fill=(150, 156, 168, 255))

    # la flecha hacia abajo
    if p_flecha > 0.02:
        dy = int(28 * (1 - p_flecha))   # la flecha BAJA hasta su lugar
        a = int(255 * p_flecha)
        d.polygon([((w // 2 - 22) * SS, (cy - 60 - dy) * SS), ((w // 2 + 22) * SS, (cy - 60 - dy) * SS),
                   ((w // 2) * SS, (cy - 8 - dy) * SS)], fill=MARCA["acento"] + (a,))

    # el que queda: cobre, grande
    if p_cinco > 0.02:
        b_txt = t["despues"]
        cap = Image.new("RGBA", img.size, (0, 0, 0, 0))
        dc = ImageDraw.Draw(cap)
        wb = ancho_de(b_txt, fn) // SS
        sube = int(26 * (1 - p_cinco))   # entra subiendo unos pixeles
        a = int(255 * p_cinco)
        dc.text((((w - wb) // 2) * SS, (cy + 40 + sube) * SS), b_txt, font=fn,
                fill=MARCA["acento"] + (a,))
        lb = t["despues_label"].upper()
        dc.text((((w - ancho_de(lb, fl) // SS) // 2) * SS, (cy + 300 + sube) * SS), lb,
                font=fl, fill=MARCA["titulo"] + (a,))
        img = Image.alpha_composite(img, cap)
    return reducir(img)


TIPOS = {"subtitulo": subtitulo, "dato": dato, "barra": barra, "frase": frase,
         "chip": chip, "placa": placa, "comparacion": comparacion, "titular": titular, "panel": panel,
         "portada": portada, "cierre": cierre}


def _un_frame(args):
    """Dibuja UN frame de una secuencia. Vive afuera para que se pueda repartir
    entre procesos: dibujar 120 frames de una portada en un solo nucleo tardaba
    mas que todo el render de video junto, con 11 nucleos al pedo."""
    t, i, entrada, carpeta = args
    img = TIPOS[t["tipo"]](t, p=min(1.0, i / max(1, entrada - 1)))
    img.save(Path(carpeta) / f"f{i:04d}.png")
    return img.width, img.height


def main():
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    salida = Path(sys.argv[2])
    salida.mkdir(parents=True, exist_ok=True)

    hechos = []
    for t in spec:
        fn = TIPOS[t["tipo"]]
        anim = t.get("anim")
        if anim:
            # Secuencia: un PNG por frame. Es la forma mas simple de animar
            # cualquier cosa que PIL sepa dibujar, sin levantar un navegador.
            # `frames` es la duracion COMPLETA en pantalla; `entrada` cuantos de
            # esos frames dura el movimiento (el resto se queda quieto).
            n = int(anim["frames"])
            entrada = max(1, int(anim.get("entrada", n)))
            carpeta = salida / t["id"]
            carpeta.mkdir(parents=True, exist_ok=True)
            tareas = [(t, i, entrada, str(carpeta)) for i in range(n)]
            nucleos = max(1, min(os.cpu_count() or 4, 10))
            with ProcessPoolExecutor(max_workers=nucleos) as pool:
                medidas = list(pool.map(_un_frame, tareas, chunksize=4))
            w, h = medidas[0]
            hechos.append({"id": t["id"], "archivo": str(carpeta / "f%04d.png"),
                           "w": w, "h": h, "secuencia": True, "frames": n})
        else:
            img = fn(t)
            ruta = salida / f"{t['id']}.png"
            img.save(ruta)
            hechos.append({"id": t["id"], "archivo": str(ruta), "w": img.width,
                           "h": img.height, "secuencia": False})
    print(json.dumps(hechos, ensure_ascii=False))


if __name__ == "__main__":
    main()
