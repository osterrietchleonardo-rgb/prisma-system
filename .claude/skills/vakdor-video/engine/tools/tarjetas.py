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
import sys
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


def subtitulo(t):
    """Tarjeta de subtitulo: caja oscura translucida, con las palabras clave en cobre."""
    partes = t["partes"]  # [{"txt": "...", "clave": bool}, ...]
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
    for p in partes:
        color = MARCA["acento"] if p["clave"] else MARCA["titulo"]
        d.text((x, y), p["txt"], font=f, fill=color + (255,))
        x += ancho_de(p["txt"], f) + gap
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


def barra(t):
    """Comparacion tipo 80/20: barra partida + las dos etiquetas."""
    pct = t.get("pct", 80)
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
    caja(d, (bx0, by, corte, by + alto_b), alto_b // 2, MARCA["acento"] + (255,))

    d.text((36 * SS, 148 * SS), t["izq"], font=fp, fill=MARCA["acento"] + (255,))
    w_der = ancho_de(t["der"], fp) // SS
    d.text(((w - 36 - w_der) * SS, 148 * SS), t["der"], font=fp, fill=MARCA["texto"] + (255,))
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


def comparacion(t):
    """Placa completa de contraste: un numero tachado y el que lo reemplaza.
    Para 'no necesitas 40, necesitas 5'."""
    w, h = t.get("w", 1080), t.get("h", 1920)
    img = _fondo_placa(w, h)
    d = ImageDraw.Draw(img)

    fn = fuente(190)
    fl = fuente(36)
    cy = h // 2

    # el que se descarta: gris y tachado
    a_txt = t["antes"]
    wa = ancho_de(a_txt, fn) // SS
    xa = (w - wa) // 2
    d.text((xa * SS, (cy - 330) * SS), a_txt, font=fn, fill=(120, 126, 138, 255))
    ym = cy - 330 + 118
    d.rounded_rectangle([(xa - 16) * SS, (ym - 5) * SS, (xa + wa + 16) * SS, (ym + 5) * SS],
                        radius=5 * SS, fill=(150, 156, 168, 255))
    la = t["antes_label"]
    d.text((((w - ancho_de(la, fl) // SS) // 2) * SS, (cy - 130) * SS), la.upper(),
           font=fl, fill=(150, 156, 168, 255))

    # la flecha hacia abajo
    d.polygon([((w // 2 - 22) * SS, (cy - 60) * SS), ((w // 2 + 22) * SS, (cy - 60) * SS),
               ((w // 2) * SS, (cy - 8) * SS)], fill=MARCA["acento"] + (255,))

    # el que queda: cobre, grande
    b_txt = t["despues"]
    wb = ancho_de(b_txt, fn) // SS
    d.text((((w - wb) // 2) * SS, (cy + 40) * SS), b_txt, font=fn, fill=MARCA["acento"] + (255,))
    lb = t["despues_label"]
    d.text((((w - ancho_de(lb, fl) // SS) // 2) * SS, (cy + 300) * SS), lb.upper(),
           font=fl, fill=MARCA["titulo"] + (255,))
    return reducir(img)


TIPOS = {"subtitulo": subtitulo, "dato": dato, "barra": barra, "frase": frase,
         "chip": chip, "placa": placa, "comparacion": comparacion, "titular": titular}


def main():
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    salida = Path(sys.argv[2])
    salida.mkdir(parents=True, exist_ok=True)

    hechos = []
    for t in spec:
        img = TIPOS[t["tipo"]](t)
        ruta = salida / f"{t['id']}.png"
        img.save(ruta)
        hechos.append({"id": t["id"], "archivo": str(ruta), "w": img.width, "h": img.height})
    print(json.dumps(hechos, ensure_ascii=False))


if __name__ == "__main__":
    main()
