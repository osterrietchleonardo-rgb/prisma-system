# El norte: PRISMA como sistema de agentes (16/9/2026)

> Leonardo (16/9), textual: "un super agente orquestador, que controla todo, que tiene sub super
> agentes, que a su vez estos tienen todo. Por ejemplo, se conecta el número de
> WhatsApp/Instagram/web/llamada, y el orquestador con inteligencia identifica si tiene que
> derivarlo al sub super agente compradores o propietarios o seguimiento, y ahí cada uno actúa, con
> la posibilidad de trasladarse o intervenir si necesitan hablar con el usuario sin pisarse,
> teniendo una única e irrepetible ficha de usuario con cada interacción/decisiones/mensajes/
> herramientas/activos/agentes/compromisos. Y si después se agrega otro sub super agente, es fácil
> y el orquestador puede controlarlo… ese es como mi objetivo de PRISMA: que sea todo autónomo. Que
> si el cliente dice quiero que me mandes por email, lo haga; si dice avisame en 2 días, en dos días
> le avise".
>
> Este documento no es un plan de construcción: es **el norte**, para que cada cosa que se
> construya empuje hacia ahí y ninguna lo haga más difícil. Los planes concretos son
> `2026-09-15-agente-conversacional-design.md` (el motor) y
> `2026-09-16-agente-propietarios-design.md` (el primer agente propio).

---

## 1. La idea, ordenada

Lo valioso de la imagen no es "muchos agentes". Es que **el sistema tenga una sola memoria de la
persona, un solo lugar donde se decide quién habla, y una forma barata de sumar un agente nuevo**.
Los agentes son la parte fácil; lo difícil es lo de abajo.

Cuatro piezas sostienen todo lo demás:

1. **La ficha única de la persona.** Una fila por ser humano, con todas sus identidades (teléfono,
   usuario de Instagram, email, número que llamó), y su línea de tiempo completa: mensajes,
   decisiones, herramientas usadas, propiedades vistas, compromisos, agentes que intervinieron.
2. **Un solo que habla.** En cada momento, una conversación tiene un conductor: un agente o una
   persona. Todo lo que sale pasa por una única puerta de salida.
3. **Los compromisos como motor de autonomía.** "Avisame en dos días" no es memoria del modelo: es
   una fila con vencimiento que alguien tiene que cumplir.
4. **Un registro de agentes.** Cada agente declara qué es y qué puede; el motor es el mismo para
   todos. Sumar uno es agregar una ficha, no un sistema.

El orquestador viene **después** de esas cuatro, y es más chico de lo que parece.

---

## 2. Qué hay hoy (medido el 16/9)

| Pieza del norte | Estado real |
|---|---|
| Motor con herramientas, guardarraíles, tope de costo y traza | **Existe y corre en producción** desde el 31/8 (`lib/seguimiento/`) |
| Línea de tiempo por conversación | **Existe**: `lead_eventos`, visible en Equipo → Trazabilidad |
| Compromisos | **Existe la tabla**, con los tipos ya previstos: `visita_agendada`, `respuesta_pendiente`, `documentacion_pendiente`, **`envio_prometido`**, **`llamada_prometida`**. 152 filas, todas de visitas y respuestas pendientes: los dos tipos que harían falta para "mandame por email" y "llamame" **están declarados y nadie los usa todavía** |
| Un solo que habla | **Diseñado, no construido**: el candado por conversación del plan del 15/9 |
| Ficha única de la persona | **No existe.** Ver abajo |
| Canales | **Solo WhatsApp** (Meta entra, Evolution sale). No hay Instagram, web ni llamadas en el código |
| Registro de agentes | **No existe.** Hoy hay un agente (seguimiento) y un bot en n8n |
| Orquestador | **No existe** |

**El agujero más grande es la ficha única, y es un problema de datos, no de IA.** En Central hay
2.350 contactos de WhatsApp y 5.858 leads de Tokko. Solo 891 leads tienen teléfono cargado, y de
1.000 contactos de WhatsApp que probé, **apenas 41 coinciden con un lead**. La misma persona puede
estar dos veces, sin que nada las una. Cualquier agente que "sepa todo del cliente" es mentira
mientras eso siga así.

---

## 3. Las cuatro piezas, en concreto

### 3.1 La persona (una fila por ser humano)

- Una tabla `personas` por agencia, y una tabla de **identidades**: `(canal, valor)` → persona.
  Canales: `whatsapp`, `email`, `instagram`, `telefono`, `web`. Unir por los últimos 8 dígitos del
  teléfono y por email normalizado resuelve la mayoría; el resto se une a mano o se deja separado
  (mejor dos fichas que una fusión equivocada).
- Todo lo que hoy cuelga de la conversación (`metricas`, etiquetas, score) pasa a colgar de la
  persona; la conversación queda como lo que es: **un hilo en un canal**.
- La línea de tiempo se unifica: `lead_eventos` deja de ser por conversación y pasa a ser por
  persona, con el canal como columna.
- Regla dura: **una persona, un asesor responsable**. Si dos agentes la tocan, el dueño sigue
  siendo uno.

### 3.2 Un solo que habla

- Cada conversación tiene un `conductor`: `agente:propietarios`, `agente:compradores`,
  `humano:<asesor>` o `nadie`. Cambiar de conductor es un acto explícito, con motivo y registro.
- **Nadie escribe sin el turno.** El candado del plan del 15/9 es esto, un escalón más abajo.
- Cuando un agente detecta que el tema no es suyo, no improvisa: **entrega el turno** con un resumen
  (la nota de traspaso), y el que recibe arranca leyendo eso, no toda la historia.
- Una sola puerta de salida: todo mensaje sale por el mismo módulo, con su registro y su freno
  (horario, ventana de 24 h, topes, baja del cliente).

### 3.3 Los compromisos

Es la pieza que convierte "autónomo" en algo verificable:

- El agente que promete algo **crea el compromiso** (`envio_prometido` con su vencimiento,
  `llamada_prometida`, `documentacion_pendiente`).
- El reloj mira los que vencen y se los da al agente que corresponda.
- El compromiso se cierra **con evidencia**: el email que salió, el mensaje que se mandó, la visita
  cargada. Sin evidencia, queda vencido y escala. Esa es exactamente la regla que ya usa la escalera
  hoy con los asesores.
- Vale para los dos lados: lo que promete el cliente ("el martes te confirmo"), lo que promete el
  asesor y lo que promete el agente.

### 3.4 El registro de agentes

Cada agente es una ficha que declara: nombre, a quién atiende (criterio de entrada), su guion, sus
herramientas permitidas, sus plantillas, sus guardarraíles, sus topes de costo y de mensajes, y
cuándo entrega el turno. El motor (ventana, candado, traza, costo, sombra) es el mismo para todos y
vive una sola vez (`lib/agente/`). **Sumar un agente nuevo es escribir esa ficha y sus pruebas**, no
un sistema nuevo.

---

## 4. El orquestador: menos IA de la que parece

El 90 % del ruteo es determinista y sale de datos que ya tenemos: de qué campaña vino, qué
clasificación tiene la persona, si hay una ficha de propietario, si hay una visita agendada, si el
asesor tomó el chat. **Eso se resuelve con reglas, no con un modelo.**

La IA entra en dos lugares chicos y valiosos:
1. **El caso ambiguo**: un mensaje que no encaja en ninguna regla ("hola, vi un cartel"). Ahí un
   modelo chico clasifica y el resultado queda registrado para mejorar las reglas.
2. **El traspaso**: el propio agente dice "esto no es mío" y entrega, porque él es el que está
   leyendo la conversación.

Un orquestador que pase cada mensaje por un modelo grande suma costo, latencia y una forma nueva de
equivocarse. El orquestador es un guardia de tránsito, no un cerebro.

---

## 5. Orden de construcción

Cada paso deja algo que sirve solo, y ninguno necesita que el siguiente exista.

1. **El primer agente propio** (propietarios) sobre el motor del plan del 15/9. Es lo que está
   diseñado y listo para arrancar.
2. **Extraer el motor común** (`lib/agente/`) cuando exista el segundo agente. Antes es adivinar.
3. **La ficha única de la persona.** Se puede empezar hoy y sin IA: unir WhatsApp y Tokko por
   teléfono y email, y medir cuántas personas quedan duplicadas.
4. **Los compromisos que se cumplen solos**: que el agente cree `envio_prometido` y
   `llamada_prometida`, y que el reloj los haga cumplir con evidencia. Es el primer "autónomo" de
   verdad y usa una tabla que ya existe.
5. **El conductor explícito** y la puerta única de salida, cuando haya dos agentes que puedan
   pisarse.
6. **El orquestador determinista**, recién ahí.
7. **Canales nuevos, de a uno**, y por donde entre negocio: Instagram antes que llamadas (las
   llamadas necesitan transcripción en vivo y son otro proyecto).

---

## 6. Lo que puede salir mal

| Riesgo | Cómo se evita |
|---|---|
| Dos agentes contestándole a la misma persona | El conductor y el candado. Ningún agente escribe sin turno |
| Una ficha única mal fusionada (dos personas mezcladas) | Unir solo con coincidencia fuerte; ante la duda, dos fichas |
| "Autónomo" chocando con Meta | Las reglas del canal mandan sobre cualquier agente: opt-in, ventana de 24 h, baja, horarios |
| Costo que se dispara con muchos agentes | Tope por agente y por persona, medido por turno, como ya se mide hoy |
| Construir el orquestador primero | No hay nada que orquestar con un solo agente. Se construye en el paso 6 |
| Que el asesor pierda el control | La persona tiene un asesor responsable, y el humano siempre puede tomar el turno |

---

## 7. La prueba de que el norte se cumple

No es una demo. Es que estas cuatro frases sean ciertas y verificables:

1. Un cliente escribe por WhatsApp y después por Instagram, y **es la misma ficha**.
2. Dice "mandame eso por email" y **le llega**, y el compromiso queda cerrado con el email como
   evidencia.
3. Dice "avisame en dos días" y **a los dos días le escriben**, sin que nadie se acuerde.
4. Se agrega un agente nuevo y **ninguno de los anteriores se entera** (ni se rompe).
