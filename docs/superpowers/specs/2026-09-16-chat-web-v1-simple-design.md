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
(Sofía, Lara), que **solo sabe lo que la agencia cargó y lo que hay en su cartera**, junta los datos
del visitante, y cuando la cosa se pone seria lo pasa a WhatsApp, que es donde el equipo ya trabaja.
El director ve la conversación entera en PRISMA y recibe un email con el resumen.

**La decisión de fondo:** el chat web **no es una bandeja nueva**. Es un embudo hacia el canal que ya
existe. Eso saca de la v1 media aplicación (bandeja, tiempo real, responder desde ahí, indexar el
sitio, segundo analizador) y deja el trabajo en tres piezas chicas.

---

## 2. Qué se construye (y nada más)

| Pieza | Qué es |
|---|---|
| **El widget** | `widget.js` (una línea en el sitio) que abre un iframe con una página de PRISMA. Alternativa sin script: un link a esa misma página, para sitios que no dejan pegar código |
| **El agente** | Un endpoint que responde con el motor común (`lib/agente/`), con 4 herramientas y los guardarraíles en código |
| **La vista** | Una página en PRISMA, **solo lectura**, con la lista de chats y la conversación; un interruptor para pausar al asistente; y un email con el resumen cuando hay un dato que vale |

Tres tablas nuevas, nada de lo existente se toca: `web_widgets` (una fila por agencia),
`web_conversaciones`, `web_mensajes`.

---

## 3. Lo que el asistente sabe y puede

**Sabe** tres cosas, y ninguna más:

1. **El documento de la agencia**: `whatsapp_ai_settings.knowledge_text`, que ya existe y **hoy está
   vacío en las dos agencias** (medido el 16/9). Es el mismo campo que usa el bot de WhatsApp: se
   carga una vez y sirve para los dos canales. Una sola fuente de verdad por agencia.
2. **La cartera**: búsqueda por significado sobre `properties` de esa agencia (`match_properties_ia`,
   la que ya usa el Buscador).
3. **La página desde donde le escribieron** (la URL), para poder decir "veo que estás mirando el
   departamento de…".

**Puede** cuatro cosas:

| Herramienta | Para qué | Freno |
|---|---|---|
| `buscar_propiedades` | mostrar hasta 3 propiedades con su ficha compartible (`/ficha/<token>`, lo que ya existe) | obligatoria antes de nombrar cualquier propiedad, precio o dirección |
| `consultar_conocimiento` | responder sobre la agencia con el documento cargado | si no está en el documento, lo dice; no inventa |
| `guardar_datos` | nombre, teléfono, email, qué busca, zona, presupuesto | normaliza el teléfono; **vincula o crea el contacto de la agencia** (ver §4) |
| `pasar_a_whatsapp` | botón "Seguir por WhatsApp" con el resumen prellenado | el visitante es el que escribe: no hace falta plantilla ni permiso de Meta |

No agenda visitas, no manda emails al visitante, no toma archivos, no habla de comisiones, no tasa.

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
| Rastrear e indexar el sitio del cliente (tabla y embeddings propios) | Es un robot con sus fallas, y el 90 % de lo que respondería ya está en el documento de la agencia y en la cartera | Cuando un cliente pida que el chat conozca páginas que no están en el documento |
| El analizador de 45 campos portado de n8n | Duplica un analizador que ya existe y que va a morir cuando el bot de compradores pase a código. El asistente guarda los 6 datos que importan con una herramienta | Junto con la mudanza del bot de compradores |
| Bandeja completa con tiempo real y responder desde la web | Es una segunda bandeja para un equipo que ya vive en otra. En v1 el humano contesta por WhatsApp | Cuando el volumen de chats web lo justifique |
| Mostrar los pasos de pensamiento | Suma trabajo y no cambia la respuesta | Nunca, salvo pedido |
| Preguntas para quien quiere sumarse al equipo | Es otro caso de uso; mezcla el objetivo del chat | Cuando Kevin lo pida, como objetivo aparte |
| Aviso por WhatsApp al asesor | Necesita una plantilla nueva aprobada por Meta | v2, junto con las plantillas de propietarios |

---

## 9. Decisiones de Leonardo

1. ¿Arranca en vakdor.com antes que en Central? (recomendado: sí)
2. ¿La v1 sin bandeja, con el humano contestando por WhatsApp? (recomendado: sí; es lo que la hace
   chica y lo que evita una segunda bandeja abandonada)
3. ¿Quién carga el documento de la agencia? Hoy está vacío en las dos, y sin eso el asistente solo
   sabe de la cartera (recomendado: Leonardo el suyo; Kevin el de Central, con un pedido concreto)
4. El modelo arranca con Luna solo si pasa la prueba contra el actual; si no, queda el de hoy.
