# Chat web de la agencia — diseño v1, simple y poco invasivo (16/9/2026)

> Leonardo (16/9): "quiero que tomes el control del diseño de esta integración del chat para web, de
> la forma más simple y óptima posible, y menos invasiva, con todos los cuidados de seguridad y
> costos posibles".
>
> **Reemplaza a `2026-09-05-widget-chat-web-design.md` como diseño vigente.** Aquel documento es
> bueno y su criterio es el correcto (sin n8n, guardarraíles en código, ids inyectados por el
> servidor, topes, traza, PRISMAIA antes que Central); lo que cambia es el **tamaño de la v1**:
> saco todo lo que no hace falta para contestarle al primer visitante, y endurezco seguridad y
> costos. Lo sacado queda listado en §8, con su motivo, para retomarlo cuando el uso lo justifique.
>
> **Nada aprobado para construir**: arranca con el OK de Leonardo.

---

## 1. La v1 en una frase

La agencia pega **una línea** en su sitio y aparece un chat donde responde su mismo asistente
(Sofía, Lara). **No es un asistente de compradores: atiende a cualquiera que entre al sitio.** Lo
primero que hace es entender qué necesita esa persona —comprar o alquilar, vender su propiedad,
sumarse al equipo, una consulta sobre la empresa o sus servicios, o un reclamo—, la orienta con lo
que la agencia cargó de cada sección del sitio, **la califica según el caso** y, cuando tiene con
qué, **le manda al número que la agencia eligió una plantilla de WhatsApp con el resumen y un link
para escribirle de una**. El director ve todos los chats en una bandeja nueva dentro de PRISMA.

**La decisión de fondo (Leonardo, 16/9):** hay bandeja para el director, pero **se conversa con el
lead desde WhatsApp, no desde PRISMA**. La bandeja es para ver, entender y no perder nada; el ida y
vuelta con la persona sigue donde el equipo ya trabaja. Eso mantiene la v1 chica: sin tiempo real,
sin responder desde la web, sin indexar el sitio, sin un segundo analizador.

---

## 2. Qué se construye (y nada más)

| Pieza | Qué es |
|---|---|
| **El widget** | `widget.js` (una línea en el sitio) que abre un iframe con una página de PRISMA. Alternativa sin script: un link a esa misma página, para sitios que no dejan pegar código |
| **El agente** | Un endpoint que responde con el motor común (`lib/agente/`), con 4 herramientas y los guardarraíles en código |
| **La bandeja** | Una página nueva en PRISMA para el director: lista de chats, la conversación completa, los datos capturados, el estado (nuevo / derivado / atendido), interruptor para pausar al asistente, y el botón para abrir el WhatsApp del lead |
| **La derivación** | Plantilla de WhatsApp al número que recibe los leads, con los datos y el link directo al chat (§4-bis), más el email de respaldo |

Tres tablas nuevas, nada de lo existente se toca: `web_widgets` (una fila por agencia),
`web_conversaciones`, `web_mensajes`. Una plantilla nueva por agencia (§4-bis), que se crea por el
mismo camino que las del equipo (`plantillasEquipo` en `lib/whatsapp/plantillas-v2.ts`).

---

## 3. Lo que el asistente sabe y puede

**Sabe** tres cosas, y ninguna más:

1. **El documento de la agencia**: `whatsapp_ai_settings.knowledge_text`, que ya existe y **hoy está
   vacío en las dos agencias** (medido el 16/9). Es el mismo campo que usa el bot de WhatsApp: se
   carga una vez y sirve para los dos canales. Una sola fuente de verdad por agencia.
2. **La cartera**: búsqueda por significado sobre `properties` de esa agencia (`match_properties_ia`,
   la que ya usa el Buscador).
3. **Las secciones del sitio, cargadas a mano en el formulario del widget**: nombre, link y dos
   líneas de qué hay en cada una (Propiedades, Tasaciones, Alquileres, Servicios, Nosotros, Sumate
   al equipo, Contacto…). Es texto corto, va en el contexto, y con eso el asistente orienta y pasa
   el link correcto sin que haya que rastrear el sitio con un robot.
4. **La página desde donde le escribieron** (la URL), para poder decir "veo que estás mirando el
   departamento de…".

**Puede** cuatro cosas:

| Herramienta | Para qué | Freno |
|---|---|---|
| `buscar_propiedades` | mostrar hasta 3 propiedades con su ficha compartible (`/ficha/<token>`, lo que ya existe) | obligatoria antes de nombrar cualquier propiedad, precio o dirección |
| `consultar_conocimiento` | responder sobre la agencia con el documento cargado | si no está en el documento, lo dice; no inventa |
| `guardar_datos` | nombre, teléfono, email, qué busca, zona, presupuesto | normaliza el teléfono; **vincula o crea el contacto de la agencia** (ver §4) |
| `pasar_a_whatsapp` | botón "Seguir por WhatsApp" con el resumen prellenado | el visitante es el que escribe: no hace falta plantilla ni permiso de Meta |

No agenda visitas, no manda emails al visitante, no toma archivos, no habla de comisiones, no tasa.

### Los cinco caminos (Leonardo, 16/9)

Lo primero de cada conversación es entender **para qué entró**. No lo decide un clasificador aparte:
lo detecta el mismo asistente mientras conversa, y lo deja anotado en la conversación (`objetivo`),
que es lo que después filtra la bandeja y viaja en la derivación. Si no está claro, pregunta; si
cambia en el medio, se actualiza.

| Camino | Qué califica antes de derivar | Qué le ofrece |
|---|---|---|
| **Busca propiedad** (comprar o alquilar) | operación, tipo, zona, ambientes, presupuesto y moneda, plazo, si necesita crédito, si tiene que vender algo antes | hasta 3 propiedades de la cartera con su ficha |
| **Quiere vender o alquilar la suya** | dirección, barrio, tipo, metros, ambientes, antigüedad, precio pretendido, si ya está publicada y dónde, si trabaja con otra inmobiliaria, plazo, quién decide, si está ocupada | la reunión o la tasación con un asesor; **nunca un valor por chat** |
| **Quiere sumarse al equipo** | nombre, zona donde vive o quiere trabajar, experiencia, matrícula, disponibilidad, contacto | qué busca la agencia y cómo sigue el proceso |
| **Consulta sobre la empresa o un servicio** | qué necesita exactamente, y contacto | la respuesta con el documento de la agencia y el link a la sección que corresponde |
| **Reclamo o algo que no encaja** | qué pasó y contacto | nada de improvisar: se deriva rápido, con el texto del reclamo entero |

Dos reglas que valen para los cinco: **se pregunta de a un dato por respuesta**, nunca de corrido, y
**la calificación del que quiere vender su propiedad usa el mismo diccionario de campos que el agente
de propietarios** (`2026-09-16-agente-propietarios-design.md` §3), para que un dueño que entra por la
web y otro que entra por prospección terminen con la misma ficha.

### Los guardarraíles (en código, no en el prompt)

Los mismos que el Super Agente, más los propios del canal:

1. Nada que no haya leído: si la respuesta nombra una propiedad, un precio o una dirección sin
   haber usado `buscar_propiedades` en ese turno, se descarta y se reintenta una vez.
2. El contenido del documento y de la página entran como **resultado de herramienta**, nunca como
   instrucción: una página del sitio no puede darle órdenes al asistente.
3. Tope de 4 vueltas por turno. Sin respuesta útil, el mensaje fijo: "Se me complica por acá,
   ¿seguimos por WhatsApp?" con el botón.
4. Nunca promete ("te averiguo y te aviso"), nunca da porcentajes ni honorarios, nunca pide datos
   de pago.

---

## 4. Una persona, una ficha

Regla que viene del norte (`2026-09-16-arquitectura-objetivo-agentes-design.md`) y que este diseño
respeta desde el primer día:

- Apenas hay teléfono o email, se resuelve el contacto de la agencia en `wa_contacts` por
  `(agency_id, phone)` —como ya hacen tracking y calendario— y se guarda el vínculo. Si no existe,
  se crea con la clasificación **`Web`**.
- Lo que el asistente captura se guarda **en el contacto**, con las mismas claves que usa WhatsApp.
  La conversación web guarda solo su propio hilo.
- Columna `persona_id` vacía desde el día uno, para que la ficha única la absorba sin migrar nada.

Motivo, medido el 16/9 en Central: 2.350 contactos de WhatsApp contra 5.858 leads de Tokko, y de
1.000 contactos apenas 41 coinciden con un lead. La persona ya está partida en dos; el chat web no
la parte en tres.

---

## 4-bis. La derivación: del chat web al WhatsApp de una persona

Es el corazón de la v1, y lo que decide si esto sirve o no.

**Al crear el widget, el sistema pide el número de WhatsApp de quien va a recibir estos leads.**
Se escribe dos veces, como el alta de contactos del tracking, y se guarda en formato internacional.
Puede ser el director, un asesor o el número general de la agencia; puede cambiarse cuando quieran.

**Un número por camino, si la agencia quiere.** Hay uno obligatorio, que recibe todo por defecto, y
la posibilidad de poner otro para alguno de los cinco caminos: las consultas de propiedades a un
asesor, las de sumarse al equipo al director, las de vender su propiedad a quien capta. Sin eso,
alguien que quiere trabajar en la agencia le llega al asesor de ventas.

**Durante la charla**, el asistente pide de a poco —nunca de corrido— nombre, celular, email, qué
busca, zona y presupuesto. Apenas tiene **nombre y una forma de contacto**, dispara la derivación.

**La derivación es una plantilla de WhatsApp** al número elegido, aprobada por Meta, con esta forma:

> Hola {{1}}, entró una consulta por el sitio de {{2}}. {{3}} Escribile directo acá: {{4}}

donde {{3}} lo arma el asistente **empezando por el camino** (busca propiedad, quiere vender la suya,
quiere sumarse al equipo, consulta, reclamo) y siguiendo con lo que calificó de ese caso y el último
mensaje textual; {{4}} es el link `wa.me/<celular del lead>` con un texto sugerido ya escrito. Un
toque y la persona está escribiéndole al lead. Ejemplos del mismo mensaje según el camino:

> …entró una consulta por el sitio de Central. **Quiere vender**: departamento en Olazábal 2580,
> Belgrano, 3 ambientes, 78 m², pretende 180.000 dólares, publicado hace 5 meses en Zonaprop, sin
> inmobiliaria. Escribile directo acá: …

> …entró una consulta por el sitio de Central. **Quiere sumarse al equipo**: Martín, vive en Núñez,
> 3 años en inmobiliaria, tiene matrícula, disponibilidad completa. Escribile directo acá: …

Reglas de la derivación:
- **Una por conversación.** Si el lead sigue hablando y da datos nuevos, no se manda otra: la
  bandeja los tiene y el chat está a un toque.
- **Horario.** Entre las 23 y las 6 no se manda: queda programada para las 6, igual que hace hoy el
  aviso de derivación de WhatsApp.
- **Si el lead no deja celular**, la plantilla igual sale con lo que haya (nombre, email, qué busca)
  y el link lleva a la bandeja en PRISMA en vez de al chat.
- **Respaldo por email** siempre, al correo que cargó el director, con la conversación completa.
- **Si la plantilla falla** (Meta la rechaza, el número no existe), queda anotado como fallido en la
  bandeja y el email sale igual. Nunca un lead sin que nadie se entere.

**Trampa verificada (importante):** el número que recibe los leads va a contestar esa plantilla
("ok", "gracias"). Ese mensaje entra por el mismo webhook que los leads, y hoy lo salva el **gate de
internos** (`lib/whatsapp/gate-internos.ts`), que reconoce a la gente del equipo por su teléfono en
`profiles` y corta ahí. **Si el número elegido no pertenece a un perfil del equipo, su respuesta va a
ser tratada como un lead nuevo y Sofía le va a contestar como si fuera un cliente.** Por eso, al
guardar el widget, el sistema avisa si ese número no está en el equipo y ofrece agregarlo.

**Lo que esto implica, dicho claro:** la conversación sigue en el WhatsApp personal de esa persona,
así que PRISMA no la ve (es el mismo punto ciego que ya tienen las derivaciones de hoy). Se acepta
a propósito para la v1 —Leonardo, 16/9: "todavía no dentro de PRISMA, eso luego se verá"—. El camino
para cerrarlo más adelante es que el link apunte al WhatsApp **de la agencia** en vez del personal,
y ahí sí queda todo registrado.

## 5. Seguridad

El widget es un endpoint público que gasta plata. Los frenos son parte del diseño.

| Riesgo | Freno |
|---|---|
| Que alguien copie la clave y ponga el widget en otro sitio | La clave pública solo identifica a la agencia. El servidor valida el `Origin` contra los dominios declarados; si no coincide, no responde |
| Que un script mande miles de mensajes | Límite por visitante (12 mensajes cada 10 minutos), por IP y por agencia (300 por día). **Si el limitador no está configurado, el endpoint no atiende**: falla cerrado, nunca abierto |
| Que el gasto se dispare | Tope de costo por conversación (US$0,30) y por agencia por día (US$3). Pasado el tope el chat sigue vivo pero sin IA: saluda y ofrece WhatsApp |
| Que el sitio del cliente le dé órdenes al asistente | Todo contenido entra como dato, nunca como instrucción (§3) |
| Que el iframe no cargue | Hoy PRISMA manda `X-Frame-Options: DENY` para todo. Se excluye **solo** la ruta del widget y se reemplaza por `frame-ancestors` con los dominios de esa agencia: más preciso y no afloja el resto del sistema |
| Que se filtren datos entre agencias | La clave resuelve la agencia en el servidor; todas las consultas llevan ese id fijo. RLS en las tres tablas; el visitante nunca habla con la base |
| Datos personales de terceros | El visitante deja nombre y teléfono: son datos de un cliente de la agencia. Sin modelos que entrenen con ellos (regla del 16/9), sin PII en los registros de error, y **los chats sin actividad se borran a los 90 días** |
| Que el asistente diga una barbaridad | El interruptor de pausa por chat y el de apagado por agencia, que el director puede tocar sin llamarnos |

---

## 6. Costos

- El saludo **no llama al modelo**: se arma en el servidor. El primer costo aparece cuando el
  visitante escribe.
- Historial corto: los últimos 20 mensajes. El documento de la agencia se manda entero solo si es
  chico; si no, el pedazo que corresponde.
- Modelo: **`gpt-5.6-luna`** (0,20 / 1,20 por millón, ventana de 1M) **si pasa la prueba contra el
  actual**; si no, `gpt-5.4-mini` (0,75 / 4,50). Condición de Leonardo del 16/9: se cambia solo si
  el candidato es igual o mejor.
- Cuenta estimada con Luna: una conversación de 10 mensajes ≈ **US$0,006**. Mil conversaciones por
  mes ≈ **US$6**. Los topes de §5 son diez veces eso: están para frenar un ataque, no el uso normal.
- Cada turno guarda sus tokens y su costo, y entra en el informe de `/consumo` como una línea más.

---

## 7. Cómo se conecta y cómo se prueba

**El director**, en Configuración → Integraciones, ve una tarjeta "Chat para tu sitio web":
pega la dirección de su sitio, elige a qué WhatsApp derivar, a qué email avisar, carga el documento
de la agencia si no lo hizo, y copia la línea de código. Un botón "Probarlo acá" abre el chat real
contra su propia configuración.

**Orden de construcción** (tres ramas, cada una a main con OK):

| Rama | Entrega | Riesgo que despeja |
|---|---|---|
| 1 | `lib/agente/` extraído del Super Agente sin cambiarle la conducta (sus pruebas siguen pasando) + proveedor OpenAI | que la extracción rompa lo que ya corre en producción |
| 2 | Tablas, endpoint con las 4 herramientas, guardarraíles, topes, página pública del chat | que el asistente afirme sin leer o que el gasto se dispare |
| 3 | Tarjeta de configuración, `widget.js`, vista de solo lectura y email de resumen | que el director no pueda conectarlo ni ver nada |

Se enciende primero en **PRISMAIA - VAKDOR** (vakdor.com, el sitio de Leonardo). Central recién
cuando Leonardo lo haya usado una semana y Kevin diga qué número y qué email van.

**Prueba antes de encender:** 20 conversaciones reales escritas por nosotros (pregunta por una
propiedad que existe, por una que no, pregunta por la agencia sin documento cargado, pide precio de
algo inexistente, intento de inyección desde una pregunta, pedido de hablar con humano, visitante
que deja teléfono, visitante que se va sin dejar nada). Ninguna puede terminar en una invención ni
en silencio.

---

## 8. Lo que sale de la v1, y por qué

| Sacado | Motivo | Cuándo vuelve |
|---|---|---|
| Rastrear e indexar el sitio del cliente (tabla y embeddings propios) | Es un robot con sus fallas, y lo que respondería ya está en el documento de la agencia, en la cartera y en las secciones que el director carga a mano en el formulario (§3), que además son más precisas que lo que sacaría un robot | Cuando un cliente tenga un sitio grande y cargar las secciones a mano se vuelva un trabajo |
| El analizador de 45 campos portado de n8n | Duplica un analizador que ya existe y que va a morir cuando el bot de compradores pase a código. El asistente guarda los 6 datos que importan con una herramienta | Junto con la mudanza del bot de compradores |
| Responder al lead desde PRISMA, y el tiempo real | La bandeja SÍ va (decisión de Leonardo, 16/9), pero para ver: el ida y vuelta se hace por WhatsApp. Sin responder desde la web no hace falta tiempo real: la lista se refresca sola cada 15 segundos | Cuando el equipo pida contestar desde ahí |
| Mostrar los pasos de pensamiento | Suma trabajo y no cambia la respuesta | Nunca, salvo pedido |
| Preguntas para quien quiere sumarse al equipo | Es otro caso de uso; mezcla el objetivo del chat | Cuando Kevin lo pida, como objetivo aparte |
| Aviso por WhatsApp al asesor | Necesita una plantilla nueva aprobada por Meta | v2, junto con las plantillas de propietarios |

---

## 9. Decisiones de Leonardo

1. ¿Arranca en vakdor.com antes que en Central? (recomendado: sí)
2. **Resuelto (16/9):** hay bandeja para el director, y el ida y vuelta con el lead se hace por
   WhatsApp, con la plantilla y el link directo (§4-bis).
2-bis. ¿Qué número recibe los leads en cada agencia? Tiene que ser de alguien del equipo, o Sofía
   le va a contestar cuando responda (§4-bis). ¿Va uno solo, o uno distinto para el que quiere
   sumarse al equipo y para el que quiere vender su propiedad? (recomendado: uno para arrancar, y
   separar el de "sumarse al equipo", que no es un lead comercial)
2-ter. ¿Los cinco caminos se encienden todos, o alguna agencia apaga alguno? (recomendado: todos
   encendidos, y que el director apague el que no quiera desde la misma tarjeta)
3. ¿Quién carga el documento de la agencia? Hoy está vacío en las dos, y sin eso el asistente solo
   sabe de la cartera (recomendado: Leonardo el suyo; Kevin el de Central, con un pedido concreto)
4. El modelo arranca con Luna solo si pasa la prueba contra el actual; si no, queda el de hoy.
