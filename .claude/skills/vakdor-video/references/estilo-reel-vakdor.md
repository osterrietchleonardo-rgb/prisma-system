# Estilo de reel Vakdor — la receta que funciona

Destilado de editar tres videos reales de Leonardo con el Modo D (Video Studio), con sus
referencias y sus correcciones. **No es un molde para copiar y pegar**: es el punto de partida
probado. Si un video pide algo que no está acá —una forma, una secuencia, un logo animado, otro
tipo de gráfico— se agrega, siempre que pase el filtro de la última sección.

---

## 1. La estructura

```
PORTADA (1,8 s)  →  CUERPO (el video)  →  CIERRE (2,2 s)
```

**Portada.** Logo chico arriba, kicker en cobre, el gancho en 2–3 líneas con la última en cobre,
y un pie que remata. El gancho **no adelanta el tema, abre una pregunta incómoda**:

- ✅ *"Facturaste bien este mes. **¿Sabés por qué?**"* — obliga a contestar mentalmente
- ❌ *"Hoy te hablo de trazabilidad"* — anuncia, no engancha

**Cierre.** Logo, una frase de cierre, subrayado de acento que se dibuja solo, y el contacto.
**Una sola cosa para hacer.** Dos llamados a la acción son ninguno.

---

## 2. El lenguaje visual

Cuatro piezas, cada una con su trabajo. Mezclarlas sin criterio es lo que hace que un video se
vea "editado" en vez de profesional.

| Pieza | Cuándo | Cuántas veces |
|---|---|---|
| **Subtítulo en tarjeta** | siempre, todo el video | continuo |
| **Panel dividido** | cuando hay que MOSTRAR algo: una lista, un dato que se arma | 1, máximo 2 |
| **Placa a pantalla completa** | en la línea más fuerte, la que resume todo | 1, máximo 2 |
| **Visualización de dato** | cuando el número es el argumento | según el contenido |

**La regla que ordena todo:** *información* se muestra en un panel; *afirmación* se pone en una
placa. Si se confunden, la placa pierde fuerza y el panel aburre.

**Cuándo NO usar el panel:** para una frase suelta. Si se usa para todo, el video se convierte en
una presentación con una cara chiquita abajo, y se pierde justo lo que hace que un reel funcione,
que es alguien hablándole a alguien.

### Los subtítulos

- Tarjeta oscura translúcida, barrita de acento a la izquierda, palabras clave en cobre.
- **Se revelan palabra por palabra**, al tiempo real de cada palabra (no repartiendo la frase en
  partes iguales: se nota enseguida cuando alguien habla rápido y después frena).
- La caja se dibuja del tamaño de la frase completa. Si creciera con cada palabra estaría saltando.
- Frases de ~30 caracteres. En vertical, una línea larga obliga a barrer con la vista y se pierde
  la cara.

---

## 3. Dónde va cada cosa (9:16, 1080×1920)

| | Altura | Por qué |
|---|---|---|
| Visualización / panel | hasta 740 px | sobre la pared, arriba de la cabeza |
| Subtítulo | **1585 px** | debajo de la cara, sin invadir el último 12% |
| Subtítulo con panel activo | **1790 px** | el video baja; la altura normal le cae en la cara |

El último 12% del cuadro es donde Instagram y TikTok ponen el texto del posteo y los botones.
Lo que quede ahí, no se lee.

---

## 4. La cámara: menos es más

Valores que quedaron después de dos rondas de "está muy movido":

```json
"camara": [
  { "t": 0,    "dur": 9.1, "fx": "zoomIn",  "pct": 2 },
  { "t": 11.6, "dur": 4.4, "fx": "drift",   "intensidad": 0.2 },
  { "t": 16.1, "dur": 1.2, "fx": "push",    "pct": 2 },
  { "t": 17.7, "dur": 7.5, "fx": "zoomIn",  "pct": 2 },
  { "t": 26.8, "dur": 6.3, "fx": "zoomOut", "pct": 2 }
]
```

- **5 movimientos en 33 segundos.** No más.
- **Zooms del 2%.** No se notan conscientemente, que es el punto: la cámara acompaña, no llama
  la atención.
- **Cambios de plano (`jumpCutClose`): con cuentagotas o ninguno.** Al 1,18× se leían como un
  golpe de edición. Si se usan, 1,05–1,08×.
- El `push` va solo en la frase que carga el mensaje.

---

## 5. Color y corte

**Color:** `golden`. Se eligió comparando seis presets renderizados sobre un frame real, no por
el nombre: `moody` apagaba la cara, `teal-orange` volvía rosa la pared, `cinematic` metía una
viñeta que no ayudaba en una habitación ya oscura.

**Corte de silencios: los valores NO son universales.** Con `-42 dB` un video perdía el 12% y otro
el 20%, según cómo hable ese día. Siempre correr la detección primero y elegir el umbral que saque
entre el 10% y el 15%:

```js
for (const [db,min] of [[-30,0.6],[-38,0.8],[-42,0.8],[-45,1.0]]) { ... }
```

---

## 6. El copy: humano, psicológico, con autoridad

Todo el texto que aparece —portada, placas, panel, cierre— **lo escribe una persona (o Claude
leyendo la transcripción), nunca una plantilla**. El sistema ancla el *cuándo*; el *qué dice* es
decisión de contenido.

**Cómo se escribe:**

1. **Sale de lo que él dice, no de lo que suena bien.** Se lee la transcripción y se buscan los
   golpes reales. Si en el video no dice "casino", la placa no dice "casino".
2. **Nombra el dolor antes que la solución.** *"Eso no es tener una empresa. Es jugar al casino."*
   pega porque describe una situación que el que mira ya vivió.
3. **Datos concretos, no adjetivos.** "5 traen el 80%" vale más que "unos pocos rinden mucho".
4. **Segunda persona, voseo, sin jerga.** El que mira es un director de inmobiliaria, no un técnico.
5. **Una idea por pieza.** Si una placa necesita tres líneas para explicarse, no es una placa.

**Filtro final, antes de renderizar.** Si alguna de estas da que no, se reescribe:

- ¿Suena a algo que Leonardo diría en voz alta, o a copy de agencia?
- ¿Agrega algo que el audio no dice ya, o es un subtítulo con otra tipografía?
- ¿Un director que mira esto siente que le hablan a él y que el que habla sabe de lo que habla?

Ver también [[eje-clave-prisma-mensaje]] en memoria: el norte es **recuperar el control**, no el
software.

---

## 7. El arsenal completo — no limitarse a lo ya usado

Lo de arriba es lo que se usó en tres videos. **La skill tiene mucho más.** Antes de decir "esto
no se puede", mirar acá. Todo esto ya está construido y probado.

### Cámara y encuadre (ffmpeg, `lib/camera.mjs` + `lib/reframe.mjs`)

| | Qué hace |
|---|---|
| `zoomIn` / `zoomOut` | acercamiento medido, sobre-muestreo 3× (0 frames congelados de 89) |
| `dolly` | el zoom con intención narrativa, respeta la duración real del tramo |
| `push` | empuje corto y firme para entrar a una idea |
| `drift` | flotación tipo cámara en mano, determinista (mismo render siempre) |
| `jumpCutClose` / `jumpCutWide` | cambio de plano sin mover la cámara |
| `whipPan` | barrido lateral con desenfoque direccional |
| 4 formatos | `16:9` · `9:16` · `1:1` · `4:5`, cada uno con su zona segura |
| `--estabilizar` | vidstab en 2 pasadas, para material con temblor |
| `--limpiar` | denoise + nitidez **medido con VMAF**: +6 puntos sobre video de WhatsApp |

### Color (`lib/grade.mjs`)

9 presets, **idénticos a los de Remotion** para que un look se vea igual venga del motor que venga:
`cinematic` · `warm` · `cool` · `vintage` · `bw` · `highContrast` · `moody` · `golden` ·
`teal-orange`. Todos con viñeta opcional forzable.

### Gráficos (`tools/tarjetas.py` + `lib/graficos.mjs`)

| Tipo | Para qué |
|---|---|
| `subtitulo` | tarjeta con revelado palabra por palabra |
| `titular` | tipografía grande SIN caja sobre el video, palabra clave más grande y en cobre |
| `placa` | pantalla completa: el video desaparece y queda la declaración |
| `comparacion` | pantalla completa, un número tachado y el que lo reemplaza (40 → 5) |
| `panel` | video abajo, zona de explicación arriba con lista que aparece de a uno |
| `barra` | dato con barra que crece y números que cuentan |
| `dato` | número grande + etiqueta |
| `chip` | píldora con punto de acento, para conceptos sueltos |
| `frase` | placa chica de autoridad sobre el video |
| `portada` / `cierre` | apertura y cierre de marca con logo |

**Todos animables**: `"anim": { frames, entrada }` dibuja un PNG por frame. Cualquier cosa que PIL
sepa dibujar se puede mover.

### Remotion (Modos A y B — `engine/src/`)

Cuando la pieza es **generada** y no filmada: fichas de propiedad, placas complejas, animación de
verdad.

`PropertyReel` (reel desde fotos + datos, Ken Burns) · `EditedReel` · `Thumbnail` (portadas) ·
`TextFx` (letra por letra, typewriter, palabra por palabra, contador animado, gradiente) ·
`ColorGrade` · `transitions` (slide, fade, wipe, flip, clockWipe) · `AudioLayer` (música con
ducking sobre la voz, SFX, fades) · `PictureInPicture` (cara del broker sobre la propiedad) ·
`SpeedSegment` (slow-mo, speed ramping) · `@remotion/shapes` y `@remotion/paths` (formas y SVG
animables) · `@remotion/motion-blur` · `batch.mjs` (varios videos en serie).

### Modo C — producción (helpers Python, `helpers/`)

`privacy` (tapar teléfonos, chats, precios y tokens en pantalla con blur) · `frame_map` (encuadre
y danger zones por plataforma) · `mix_audio` (música medida en LUFS con sidechain sobre la voz) ·
`export` (spec de redes: bitrate capeado, bt709, faststart, −14 LUFS) · `subtitles` (.ass con
karaoke y diccionario de jerga) · `tighten` · `grade` (presets luxury).

### IA externa, cuando hace falta (MCP Higgsfield)

`upscale_video` (Topaz/ByteDance hasta 4K, cuesta créditos) · `generate_image` / `generate_video`
(B-roll que no existe) · `remove_background` · `motion_control`. **Reservado para lo que no se
puede hacer local**, porque cuesta plata.

### Transcripción

Groq `whisper-large-v3` con tiempos **reales por palabra** (~3 s para 20 min, centavos), o
whisper.cpp local (gratis, offline). El anclaje de efectos a la palabra hablada sale de acá.

---

## 8. Agregar cosas nuevas

Bienvenido: formas, secuencias animadas, logos en movimiento, otros tipos de gráfico. La capa está
hecha para eso — cualquier cosa que PIL sepa dibujar se puede animar dibujando un PNG por frame
(`"anim": { frames, entrada }` en el spec).

Lo único que no se negocia es que la pieza nueva **pase el filtro de la sección 6** y que no rompa
la jerarquía de la sección 2. Un efecto que no agrega información ni fuerza al mensaje, por lindo
que sea, resta: hace que el video se vea "editado" en vez de sólido.

---

## 9. Tiempos reales (12 núcleos, Radeon con h264_amf)

| Paso | Tiempo | Nota |
|---|---|---|
| Master 4K → 1080×1920 | ~52 s | GPU |
| Corte + transcripción | ~40 s | se cachea, la segunda vez es gratis |
| Render base con cámara | ~2 m 50 | **el techo**: el sobre-muestreo 3× del zoom es CPU |
| Dibujar tarjetas y portadas | ~50 s | 10 núcleos en paralelo |
| Componer gráficos | ~2 m 40 | GPU |
| Unir portada + cuerpo + cierre | ~17 s | GPU |

No hay escalador por GPU disponible en este equipo (`scale_vulkan` no inicializa; `scale_cuda` y
`scale_qsv` piden NVIDIA o Intel), así que el render base es el límite actual.
