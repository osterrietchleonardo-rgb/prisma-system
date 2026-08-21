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

> **¿Cuánto texto y de qué tipo?**
> **Un rótulo de 1 o 2 palabras, aislado → sale bien generado (Flow).**
> **Una interfaz con varios textos (mensajes, horas, nombres, encabezados) → se renderiza en
> casa (HyperFrames o Remotion), donde el texto es texto y sale como se escribió.**

Está medido en las dos direcciones, no es opinión.

**Sale bien:** un rótulo corto y solo. En los clips de Leonardo del 20-ago, "ACM Manual" y
"ACM Automático" salieron perfectos, con tilde. Un texto breve, dentro de un marco, sin nada
alrededor que competir.

**Sale mal:** la interfaz densa. En el mockup de chat el mismo modelo escribió bien las frases
principales y a la vez inventó *"Yuessages de 212021"*, *"Tur2 PM"*, *"Messager"*, *"algueien"*, y
horarios sin ningún orden (12:43 p.m., 8:12 p.m., 10:13 p.m. mezclados). En un b-roll de oficina,
la pantalla del celular decía *"Heal a Letain Fool Eatme foe tofan"*.

La diferencia no es el idioma ni la longitud de la frase: es **cuántos textos hay en el cuadro**.
Uno lo clava. Seis, y empieza a rellenar los huecos con lo que le parece.

El ejemplo más claro está en un solo cuadro, el clip "Flujos Dispersos" al segundo 6,5: el rótulo
grande dice **"Control Total"** perfecto, el título **"Dashboard"** perfecto, y al mismo tiempo el
menú lateral de ese dashboard dice *"Aemual"*, *"Apratar"*, *"Arcarutlización"*, *"Detrchos"*,
*"Compirutes"*. Mismo cuadro, mismo modelo, mismo segundo.

**Y está bien que sea así**, si se lo usa a conciencia: en un reel de 10 segundos nadie lee el menú
lateral, funciona como textura. La regla práctica es que **lo que el espectador tiene que leer sea
lo único legible del cuadro** — el resto puede ser garabato y nadie lo nota. Lo que no se puede es
pedirle que escriba seis cosas y esperar que las seis estén bien.

Corolario útil: **un clip generado sirve de fondo y el texto se pone encima renderizado.** El
celular sobre el escritorio queda mejor con una conversación de verdad superpuesta que cualquiera
de las dos cosas por separado. Para eso conviene el **WebM con alpha** de HyperFrames: se apoya
sobre el clip de Flow sin recortar nada a mano.

| La pieza | Con qué se hace | Por qué |
|---|---|---|
| Chat, notificación, mail, panel, listado, calendario, factura | **HyperFrames** si es nueva · **Remotion** si ya existe (`ChatMockup`) | lleva texto que se lee. Ver §6 |
| Stick figure, muñecos de línea | **Flow** | no lleva texto y sale muy bien |
| Animación 2D abstracta (formas, líneas, grillas) | **Flow** | ídem, y respeta la paleta de marca |
| B-roll de ambiente (oficina, escritorio, ciudad) | **Flow** | fotorrealismo creíble; el texto que aparezca queda fuera de foco |
| Placa o fondo fijo de marca | **Flow, modo imagen** | sale **gratis** |

---

## 3. El template de 10 segundos (el estándar para pedir clips a Flow)

**Este es el formato que se usa.** No se escribe un prompt de cero: se completa este. Lo trajo
Leonardo el 20-ago-2026 y produjo los dos mejores clips que se generaron hasta hoy.

Lo que lo hace funcionar son **los tres primeros bloques, que NUNCA se tocan**. Son los que
garantizan que dos clips pedidos con una semana de diferencia parezcan del mismo video: mismo
personaje, mismo fondo, misma estética. Si se les agrega ropa, pelo o se cambia el fondo, se
rompe el universo visual y cada clip parece de otra campaña.

```
[System/Style & Character Consistency]: Minimalist 2D animation, fluid (60fps) and modern. The
main character is ALWAYS a consistent stick figure with pure white, sharp, and slightly glowing
strokes. The character design must remain identical: no facial features, just clean, simple lines.

[Background/Environment Consistency]: Pitch black background. In the center, a very slight white
radial gradient to give depth. In the background, a subtle white wireframe grid with 10% opacity,
giving a clean, trendy, and technological aesthetic.

[Text & Typography Constraints]: Any text appearing on screen must be perfectly spelled in a
modern, clean, sans-serif font.

[Action Timeline & Camera Flow - 10 Seconds Total]:

[0:00 - 0:04] The Problem (Wide or Medium Shot): The stick figure character is experiencing
[EL PROBLEMA O CAOS]. A text overlay appears smoothly containing EXACTLY the Spanish text:
"[1 O 2 PALABRAS]".

[0:04 - 0:05] The Transition (Camera Move): A rapid [Whip Pan / Zoom In / Digital Wipe] instantly
changes the scene, clearing the chaos.

[0:05 - 0:08] The Solution (Medium Shot): The stick figure is now [LA SOLUCIÓN]. A new text overlay
appears smoothly containing EXACTLY the Spanish text: "[1 O 2 PALABRAS]".

[0:08 - 0:10] The Outcome (Macro Close-up): Fast zoom into [EL DETALLE FINAL], drawn in the same
minimalist white line style on pitch black, flat 2D, no photorealism, no real device, no operating
system interface. Below it, the Spanish text EXACTLY spells: "[1 O 2 PALABRAS]".

[Motion/Fluidity]: The first 4 seconds must show [erratic / slow / chaotic] movement. The last 5
seconds must have smooth, satisfying easing (acceleration and deceleration) and perfect alignment.

[Audio/SFX]: Synchronized soundscape. [SONIDOS DEL PROBLEMA]. A sharp transition sound [whoosh /
scanner sweep]. [SONIDOS DE SOLUCIÓN].

Clean video, no subtitles, no watermark, no floating text, no extra letters or symbols anywhere.
```

### Las tres reglas de uso

1. **Los bloques de consistencia no se tocan.** Son la identidad visual.
2. **Textos de 1 o 2 palabras, entre comillas y con `containing EXACTLY the Spanish text`.** Frases
   largas confunden al modelo (ver la regla del punto 2).
3. **El arco es problema → transición → solución → resultado.** Gancho en los primeros 3 segundos,
   giro en el medio, cierre satisfactorio. Es lo que sostiene la retención en redes.

### Los tres arreglos que le hicimos al template original, y por qué

- **En el macro final, nunca nombrar un aparato.** Es el arreglo importante, y el motivo es más
  fino de lo que parecía. Dos clips del mismo día, mismo estilo, mismo bloque de cabecera:

  | El prompt del tramo `[0:08-0:10]` dice | Qué devolvió |
  |---|---|
  | `Fast zoom into **the laptop**` | una laptop **fotorrealista**, con Windows y la barra de tareas |
  | `Fast zoom into **the clean dashboard interface**` | siguió en línea blanca, perfecto |

  No es que el close-up rompa el estilo: es que **nombrar un objeto físico** (laptop, cell phone,
  monitor) arrastra al modelo al fotorrealismo, porque de esos objetos vio millones de fotos. Una
  interfaz descrita en abstracto no tiene ese ancla. Entonces: se nombra **lo que se ve en la
  pantalla**, nunca el aparato que la contiene, y se repite la restricción de estilo dentro del
  tramo por las dudas.
- **Se agregó la cola de limpieza al final.** El template original confiaba en la frase
  "No misspelled words or AI gibberish", y aun así en el clip de ACM aparecieron caracteres
  inventados al lado del marco de "ACM Manual". La cola al cierre del prompt sí funcionó en todas
  las pruebas.
- **`fluid (60fps)` es una indicación estética, no un parámetro.** La salida real de Flow es
  **24 fps** siempre. Sirve para pedir movimiento suave; no cambia la cadencia del archivo.

## 4. Dirigir a Flow: los tramos de tiempo

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

## 5. Lo que cuesta y lo que entrega Flow (cuenta de Leonardo, PRO)

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

## 6. Cómo se construye una pieza

**La regla de desempate, para una pieza NUEVA: mirar primero el catálogo de HyperFrames.** Son
154 bloques y 219 componentes ya escritos (`chat-thread`, `notification-stack`, `number-wheel`,
`panel-reveal`, placas inferiores, transiciones). Salen a **WebM con alpha**, que se apoya
directo sobre el corte del Modo C. Escribir un `.tsx` de cero es el camino largo si la pieza ya
existe hecha. La receta y el catálogo, en **`hyperframes.md`**.

**El chat de WhatsApp ya está hecho y probado.** Vive en `piezas/chat-whatsapp/`: es
`chat-thread` re-tematizado a WhatsApp con la marca (burbujas verdes `#005C4B`, fondo `#0A0F1A`,
avatar cobre, ✓✓ de leído, "en línea", y la marca en el chip de sistema del cifrado). Se copia
la carpeta a un slot, se cambia la conversación en `data-variable-values` y se renderiza. Ver
`hyperframes.md` §4 — incluye por qué la firma **no puede ir abajo** (danger zone abajo, hilo
que crece desde abajo en el medio).

**Lo que ya está en Remotion no se reescribe.** `ChatMockup` funciona, está calibrado y se usa.
Lo de abajo sigue vigente tal cual.

### `ChatMockup` (Remotion) — la que ya existe

`ChatMockup.tsx` (composición **`ChatMockup`**) fue la **primera de la familia**. Sigue siendo la
opción cuando la pieza es un chat de marca y no se quiere tocar nada.

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

## 7. Ojo con las dos copias del motor

`engine/` (acá, versionado en git) y `Prisma - MK\_motor-video` (el que renderiza) **están
desincronizados desde antes**: `engine/` tiene `Thumbnail`, `format.ts` y los efectos
(`ColorGrade`, `PictureInPicture`, `SpeedSegment`, `TextFx`); el desplegado tiene `PropertyTour`,
que acá no está. `ChatMockup` se agregó a los dos. **Antes de recopiar `engine/` encima del motor
desplegado hay que resolver eso**, o se pierde `PropertyTour`.

Los prompts de Flow que funcionaron, con su resultado, están en la memoria del proyecto
(`video-generativo-modo-e`) y los archivos en `comparacion-3-clips\`.
