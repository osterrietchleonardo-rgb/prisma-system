# Piezas de apoyo: mockups, clips y animaciones

Todo lo que aparece en pantalla **además** de la persona hablando: un chat, una notificación, un
panel, un muñequito, una animación abstracta, un b-roll de ambiente.

Verificado el 20-ago-2026 generando 6 clips en Google Flow y renderizando 2 en Remotion. Los
archivos de esa prueba están en `Prisma - MK\Activos de Marketing\comparacion-3-clips\`.

---

## 1. La pieza sale del guion, nunca al revés

**No existe "el mockup". Existe lo que esta frase necesita mostrar.**

El orden es siempre el mismo:

1. Se lee el diálogo del reel (la transcripción real, no una idea de lo que va a decir).
2. Se busca **qué frase pide ver algo**. La mayoría no pide nada: una cara hablando alcanza y
   sobra. Meter una pieza donde no hace falta distrae y abarata el video.
3. Recién ahí se decide **qué pieza** es y **cuánto dura** — normalmente lo que dura la frase.

Ejemplos del mismo reel, tres frases distintas, tres piezas distintas:

| Lo que dice | Lo que hay que ver |
|---|---|
| "te escriben a las once de la noche y contestás al otro día" | un chat sin respuesta, con el paso del tiempo marcado |
| "el asesor hace ocho cosas a la vez" | un stick figure desbordado, sin una sola letra |
| "cuando el proceso se ordena, el equipo respira" | una animación abstracta de caos a orden |

Si no se puede nombrar la frase que la pieza acompaña, la pieza no va.

---

## 2. La regla que decide con qué se hace

> **¿El espectador tiene que LEER algo en la pieza?**
> **Sí → Remotion. No → puede ir generativo.**

Está medida, no es opinión. Un modelo de video puede escribir bien una frase corta y a la vez
inventar basura alrededor: en la prueba salió *"Yuessages de 212021"*, *"Tur2 PM"*, *"Messager"*,
*"algueien"*, y horarios sin ningún orden (12:43 p.m., 8:12 p.m., 10:13 p.m. mezclados). En un
b-roll de una oficina, la pantalla del celular decía *"Heal a Letain Fool Eatme foe tofan"*.

Corolario útil: **un clip generado sirve de fondo y Remotion pone el texto encima.** El celular
sobre el escritorio queda mejor con una conversación de verdad superpuesta que cualquiera de las
dos cosas por separado.

| La pieza | Con qué se hace | Por qué |
|---|---|---|
| Chat, notificación, mail, panel, listado, calendario, factura | **Remotion** | lleva texto que se lee |
| Stick figure, muñecos de línea | **Flow** | no lleva texto y sale muy bien |
| Animación 2D abstracta (formas, líneas, grillas) | **Flow** | ídem, y respeta la paleta de marca |
| B-roll de ambiente (oficina, escritorio, ciudad) | **Flow** | fotorrealismo creíble; el texto que aparezca queda fuera de foco |
| Placa o fondo fijo de marca | **Flow, modo imagen** | sale **gratis** |

---

## 3. Dirigir a Flow: los tramos de tiempo

Lo que hace que una pieza **explique** algo es que las cosas pasen en orden. Eso se consigue
partiendo los 8 segundos en tramos:

```
[00:00-00:02] The stick figure stands still with its arms relaxed down at its sides.
[00:02-00:05] Small white message-bubble shapes fall from the top, piling up around its feet.
[00:05-00:08] The heap reaches its chest and the figure raises both arms above its head.
```

Probado dos veces, obedeció las dos. **Sin tramos no obedece**: se le pidieron cinco pelotas y una
que se cayera, e hizo seis y no se cayó ninguna.

**Las prohibiciones no funcionan.** Pedir "que NO aparezca una respuesta del otro lado" produjo
exactamente esa respuesta. En un modelo de difusión, nombrar algo para prohibirlo lo mete en la
escena. Se describe el vacío en positivo: *"conversación de un solo lado, todas las burbujas
pegadas al borde izquierdo, la mitad derecha vacía de arriba a abajo"*.

**Cola de limpieza**, siempre al final del prompt:
`no text, no letters, no numbers, clean video, no subtitles, no watermark.`
Donde se usó, no apareció una sola letra parásita. Donde se omitió, aparecieron cuatro.

**Fondo negro:** pedir `pure black`. Con `deep black` sale gris carbón con grano.

---

## 4. Lo que cuesta y lo que entrega Flow (cuenta de Leonardo, PRO)

| | |
|---|---|
| Video Omni Flash | **12 créditos** · 8 s · 720×1280 · 24 fps · con audio AAC |
| Video Veo 3.1 Quality | **100 créditos** (Lite y Fast en el medio) |
| Imagen Nano Banana 2 | **0 créditos** |
| Formatos de **video** | solo 16:9 y 9:16 |
| Formatos de **imagen** | 16:9, 4:3, **1:1**, **3:4**, 9:16 |
| Duraciones | 4 s · 6 s · 8 s · 10 s · hasta x4 por tirada |
| Bono | 50 créditos por día (hasta el 31-ago-2026), aparte del saldo |

**Los clips vienen a 720p y 24 fps y el reel es 1080×1920 a 30**: hay que agrandarlos un 50% y
resolver el cambio de cuadros. Conviene usarlos en un compuesto (dentro de un panel, con marco,
enmascarados) antes que a pantalla completa, donde la falta de resolución se nota.

**Trampas de la interfaz**, todas verificadas: el cartel **"No se pudo generar" aparece siempre y
es mentira** — los clips salen igual; la galería filtrada por "Ver imágenes" puede verse vacía
aunque las imágenes existan; y el "modo agente" esconde un pedido de aprobación que parece que
está generando cuando en realidad está esperando. Detalle del MCP en la memoria del proyecto.

---

## 5. Cómo se construye una pieza en Remotion

`ChatMockup.tsx` (composición **`ChatMockup`**) es la **primera de la familia**, no la única que
va a haber. Cuando el guion pida un panel, un mail o una notificación, se escribe otra al lado
siguiendo el mismo patrón — no se fuerza el chat a ser lo que no es.

```bash
# parado en Prisma - MK\_motor-video
npx remotion render ChatMockup "../Activos de Marketing/<activo>/chat.mp4" --props="<props>.json"
```

Props: `contactName`, `contactStatus`, `showLogo`, y `messages[]` con `from` (`them` / `me`),
`text` (acepta `\n`), `time`, `typing`, `delay`, `read` y **`divider`**.

**El `divider` es la pieza narrativa.** Sin ese chip de "2 horas después", tres mensajes seguidos
parecen un minuto y el clip no cuenta nada.

**El patrón técnico, que sirve para las que vengan:** los elementos se apilan en un contenedor
anclado abajo (`bottom: 0`) que crece hacia arriba solo — sin scroll ni medición del DOM. El
desplazamiento suave sale de animar la **altura** del envoltorio de cada elemento de 0 a su alto,
con `spring`. Ese alto se estima por cantidad de caracteres (`CHARS_PER_LINE`, calibrado al ancho
de burbuja y al cuerpo de 38 px): **si se cambia el tamaño de fuente o el ancho, hay que recalibrar
esa constante** o el texto se recorta. El indicador de "escribiendo…" ocupa lugar en la pila y se
colapsa justo cuando entra el mensaje, así el empuje se ve continuo.

**Zona segura:** el teléfono va de y=245 a y=1425 y la firma debajo, todo por encima de y=1690 —
el último 12% lo tapan Instagram y TikTok.

**Marca:** los dos logos del motor son íconos cuadrados de 500×500. **No hay wordmark**: la palabra
VAKDOR va como texto en Inter con `letterSpacing: 6`.

---

## 6. Ojo con las dos copias del motor

`engine/` (acá, versionado en git) y `Prisma - MK\_motor-video` (el que renderiza) **están
desincronizados desde antes**: `engine/` tiene `Thumbnail`, `format.ts` y los efectos
(`ColorGrade`, `PictureInPicture`, `SpeedSegment`, `TextFx`); el desplegado tiene `PropertyTour`,
que acá no está. `ChatMockup` se agregó a los dos. **Antes de recopiar `engine/` encima del motor
desplegado hay que resolver eso**, o se pierde `PropertyTour`.

Los prompts de Flow que funcionaron, con su resultado, están en la memoria del proyecto
(`video-generativo-modo-e`) y los archivos en `comparacion-3-clips\`.
