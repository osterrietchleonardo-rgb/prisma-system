# Criterio de producción

Las reglas de **qué** poner y **dónde**, separadas de las reglas de **cómo** ejecutarlo
(esas viven en `video-use.md`). Esto aplica a los tres modos: un overlay mal puesto arruina
igual un reel de propiedad que un VSL.

La parte cara de editar no es renderizar. Es el criterio. Acá está escrito una sola vez,
con números concretos, para no volver a decidirlo cada semana.

---

## 1 · La regla de oro de los gráficos

**Ningún gráfico repite lo que se está oyendo.**

Es el error que más se comete y el que más rápido se nota: el espectador ya lo está leyendo
en el subtítulo, así que la tarjeta solo compite por su atención. Cada gráfico tiene que
aportar una de estas tres cosas:

| aporte | qué es | ejemplo |
|---|---|---|
| **contraste** | dos columnas, esto frente a lo otro | *un bot / un sistema* |
| **consecuencia** | el "por lo tanto" que dejaste implícito | *mismo servicio → competís por precio → el precio baja* |
| **dato derivado** | algo contado a partir de tu propia lista | *3 de cada 4 se cobran todos los meses* |

Antes de renderizar, auditá **cada** gráfico contra el transcript de ese segundo. Si al leerlo
en voz alta suena igual que lo que decís ahí, va fuera.

**No inventes cifras** para rellenar un gráfico: tarifas, plazos, porcentajes, comisiones. Se
publican como si fueran tuyas. Si no la dijiste, preguntá; si no hay respuesta, el gráfico se
queda cualitativo.

---

## 2 · Estructura que retiene

- **Hook en los primeros 3 segundos**: adelantá el resultado, o mostrá la pregunta que el video
  responde.
- Después, gráficos **sincronizados al discurso**.
- **Capítulos** en las fronteras temáticas, no cada dos minutos.
- **Remate.**

Dos cosas que no van:

- **Barra de progreso.** Es genérica y no aporta. Los capítulos hacen ese trabajo mejor.
- **Destellos blancos entre secciones.** Es ruido.

Y si grabaste tu propio CTA hablando, **no pongas tarjeta de cierre**: sobra y se siente como
anuncio.

---

## 3 · Medir el encuadre antes de diseñar nada

    python helpers/frame_map.py <video>

Da los cortes de plano, una tira de contactos y una **regla** con la rejilla y las danger zones
dibujadas encima, en resolución nativa. Con eso clasificás cada tramo:

| tipo de plano | dónde pueden ir los gráficos |
|---|---|
| **a cámara** | por debajo de la barbilla. La cara es el producto: nada la cruza. |
| **plano de pantalla** | en la franja sin contenido. El footage YA es la infografía; no tapes la interfaz que estás señalando. |
| **pantalla partida** | todo vive en la costura. El pie de la captura suele ser barra de estado y ese sí se puede tapar. |

Anotá **barbilla**, **costura** y **zonas muertas** en píxeles. Si no medís, el video le va a
tapar la cara a alguien.

### Danger zones (lo que tapa la app)

La UI de la plataforma se come parte del cuadro. Nada informativo va ahí adentro. Los números
salen de `frame_map.DANGER_ZONES` y se escalan solos a la resolución real:

| formato | arriba | abajo | izq | der | de dónde salen |
|---|---|---|---|---|---|
| vertical 1080×1920 | 250 | 500 | 70 | 140 | unión del peor caso de TikTok y Reels (medido) |
| horizontal 1920×1080 | 60 | 120 | 60 | 60 | controles de YouTube/LinkedIn (conservador) |
| cuadrado 1080×1080 | 60 | 100 | 60 | 60 | menú del feed de IG (conservador) |

TikTok sube mucho por abajo; Reels muerde arriba y a la derecha. Por eso el vertical es el
formato donde más fácil se pierde un subtítulo: `caption_margin_v()` ya lo resuelve solo.

---

## 4 · Privacidad

Si en el video se ve una pantalla, casi seguro se ve algo que no debía publicarse. En nuestro
caso, casi siempre: **un chat de WhatsApp con el teléfono de un cliente**, nombres, precios de
operaciones, un correo, una ruta de archivo, un token del `.env`.

Se tapa con **desenfoque, no con caja opaca**. El blur mata el texto pero deja ver el
movimiento, y el movimiento muchas veces ES la demo. Una caja negra mata las dos cosas y encima
grita "acá había algo".

    python helpers/privacy.py <video> --masks edl.json --print-filter   # ver qué va a hacer
    python helpers/privacy.py <video> --masks edl.json -o masked.mp4
    python helpers/privacy.py <final.mp4> --masks edl.json --verify qa/  # revisar

**Los cuatro errores que cuestan una ronda de render:**

1. **Medir sobre miniaturas.** Sobre un thumb de 200 px te desviás 400 píxeles reales. Se mide
   en nativo: `frame_map.py --at <seg> --crop x,y,w,h`.
2. **Ajustar la caja exacta al texto.** El borde se come ~26 px, así que el texto se lee en el
   filo. `privacy.py` expande sola cada caja `FEATHER` px por lado — no lo calcules a mano.
3. **Perseguir el texto frame a frame.** Si la cámara va a mano e interpolás la posición, la
   caja se adelanta y deja renglones al aire, con temblor de regalo. La regla es **anclar y
   crecer**: pasás `rects_end` y se usa la unión durante toda la ventana.
4. **Barridos con caja fija.** En un paneo el contenido cruza en diagonal y ninguna caja lo
   sigue. Esos tramos van a `"rects": "full"`. Recortado al giro real (0.5–0.7 s) no se nota:
   ya viene con motion blur.

Los tiempos de las máscaras se escriben en **tiempo de la fuente** (que es donde podés leer el
dato); el corte las lleva solo a la timeline de salida, partiendo las que cruzan un corte y
descartando las que caen en un tramo que no quedó.

**Verificá siempre sobre el archivo final**, con recortes nativos de los bordes. Nunca sobre el
still escalado.

---

## 5 · Transcripción: las marcas

Whisper no conoce nombres de producto y los reemplaza por palabras que sí existen, **sin bajar
la confianza**. Casos reales ajenos: `CloudHot` por Claude Code, `químico` por Kimi Code. En un
video llegó a cambiar una marca por la de la competencia, lo que invirtió el argumento entero.
Los nuestros ya están en `subtitles.DEFAULT_CORRECTIONS` (`valdor`→Vakdor, `prisma ea`→PRISMA,
`monitores`→inmobiliarias…).

- Modelo **`medium` o `large-v3`**, nunca `small`: el small no se equivoca en una palabra, se
  inventa frases enteras con toda la confianza.
- **Siempre** el idioma explícito, o te puede devolver una traducción al inglés sin avisar.
- Si dudás de un segundo, extraelo y transcribilo aislado:
  `ffmpeg -ss 65 -t 6 -i audio.mp3 -y trozo.mp3`
- Si sigue sin salir, **preguntá**. Nunca adivines una marca en un subtítulo quemado: se publica
  como si lo hubieras dicho vos.
- Las correcciones van al diccionario (`DEFAULT_CORRECTIONS` o `--corrections`), **nunca** a mano
  sobre el JSON: se pierden en cuanto se regenera.

---

## 6 · Audio: medido, no a ojo

    ganancia_cama_dB = (LUFS_voz − DUCK_LU) − LUFS_cama        # DUCK_LU = 12 por defecto

Ponerle `volume=0.14` a la música es una lotería sobre el mastering de esa pista: las camas de
catálogo salen entre −10 y −20 LUFS, así que el mismo número suena 10 LU más alto en una que en
otra.

**`loudnorm` sobre la suma no lo arregla: lo esconde.** Sube la voz para compensar, el archivo
mide −14 LUFS y parece perfecto en el medidor, mientras la música se le sigue comiendo la voz.
Se normaliza al final, sobre una mezcla que ya está bien.

Y emparejar LUFS tampoco alcanza solo: los −12 LU son un promedio, y una cama con rango dinámico
alto se te sube encima en los crescendos aunque la integrada cuadre. Por eso además va
**sidechain con la voz de llave**: recorta solo esos picos y devuelve la cama entera en las pausas.

Los **efectos se calibran por pico**, no por integrada: en un golpe corto lo que se percibe es
el pico. Referencia de `rel_db`:

| rel_db | cuándo |
|---|---|
| −9 | cambio de capítulo o de montaje (el golpe fuerte) |
| −13 | hook, remate, tarjeta de cierre |
| −18 | entra un panel y el cuadro no cambia |
| −21 | apuntes, bandas chicas |

**Al reportar, decilo en LU** ("la música va 12 LU por debajo de la voz"), nunca como
multiplicador: el multiplicador no significa nada sin saber el mastering de la pista.

Guía de `duck_lu`: **8** música presente · **12** normal · **15-16** piezas largas o camas densas.

---

## 7 · Export

Lo maneja `helpers/export.py`; esto es el porqué.

- **H.264, ~6 Mbps a 1080×1920 — no el máximo.** Instagram recomprime a ~3.5 Mbps y cuanto más
  alto le entregás, más agresiva es esa pasada: un máster de 30 Mbps se ve **peor publicado**
  que uno de 6.
- **AAC 256k / 48 kHz, −14 LUFS, `+faststart`.**
- **Nunca H.265.** Pesa menos y da errores de subida.
- **bt709 explícito.** Sin las etiquetas salís con `color_range=pc` y los reproductores que las
  ignoran te aplastan los negros.
  ⚠️ **Gotcha verificado en ffmpeg 8.1.1:** `-colorspace bt709 -color_primaries bt709
  -color_trc bt709` **no alcanza** — al VUI del H.264 solo llegan `colorspace` y `color_range`;
  primaries y transfer quedan en `unknown`. Hay que pasarlos además por
  `-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709`. Se comprueba con ffprobe:
  los cuatro campos tienen que decir bt709/tv.
- **El cap se aplica una sola vez**, en el archivo que se sube. Los pasos intermedios van en
  calidad alta: capear en cada paso suma una generación de compresión por paso.

---

## 8 · Lo que NO se hace

- **No se corrige el color por default.** La cámara manda. Un grano y una viñeta sutiles son
  acabado; una corrección de gamma que nadie pidió es un filtro, y se nota. (El `grade` del EDL
  existe para cuando SÍ se pide.)
- **No se acelera el clip** salvo pedido explícito. Se nota y se rechaza. Si te lo piden, va
  `setpts=PTS/1.2` + `atempo=1.2` en el mismo pase que los cortes — y después hay que
  **re-transcribir**, porque los tiempos viejos no valen.
- **No se tapa la cara.** Nunca.
- **No se inventan datos.**
- **No se le pasa un cortador de silencios a material ya editado.** No saca nada y suma una
  generación de compresión. `prep.py` lo detecta y te dice *overlay-only*.

---

## 9 · Errores ya cometidos (propios y ajenos)

| el error | lo que pasa |
|---|---|
| Transcribir con el modelo `small` | Frases inventadas con toda la confianza, quemadas en el subtítulo |
| Poner el gráfico con lo mismo que estás diciendo | El espectador lee dos veces lo mismo y se va |
| Diseñar antes de medir el encuadre | La banda inferior te corta la barbilla en todo el tramo a cámara |
| Subtítulo al 19.5% en vertical | Queda debajo de la botonera de TikTok y no se lee |
| Tapar con caja negra en vez de blur | Se pierde el movimiento, que muchas veces es la demo |
| Ajustar la caja de blur exacta al texto | El texto se lee en el filo por el degradado del borde |
| Música a volumen fijo | Con una pista funciona, con la siguiente te tapa la voz |
| `loudnorm` sobre la suma para "arreglar" la mezcla | El medidor da bien y la voz sigue tapada |
| Exportar al máximo bitrate | Instagram recomprime más agresivo y se ve peor |
| Confiar en `-color_primaries` solo | El archivo sale con primaries `unknown` igual |
| Renderizar entero antes del QA | 15 minutos por cada cosa que se descubre tarde |
| Pasar un cortador de silencios a un take ya editado | No quita nada y suma una generación de compresión |
| Verificar máscaras con tiempos de la fuente sobre el archivo cortado | Mirás el momento equivocado y das por buena una fuga |
