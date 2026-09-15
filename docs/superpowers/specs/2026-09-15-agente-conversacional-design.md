# Agente conversacional de WhatsApp en código — plan (15/9/2026)

> Pedido de Leonardo (15/9): "¿sería viable y más control, más óptimo, igualando y superando el
> agente de IA de WhatsApp que está hoy en n8n (el principal, sus sub herramientas de
> handoff/aviso asesor, cartera, etc.), hacerlo todo desde código en PRISMA, pasando a ser un
> super agente conversacional con estructura loop+graph con herramientas, trazabilidad?" y
> después: "todo se iría construyendo paralelamente, y luego de las pruebas en sombra, se
> desconecta n8n y se conecta lo nuevo". Este documento es el plan. **Nada está aprobado para
> construir**: cada fase arranca con su OK.
>
> Fuentes (relevadas el 15/9, solo lectura): los 6 flujos activos del bot exportados de n8n, el
> código de PRISMA en `main` y la base de producción. Los inventarios completos, con nombres
> exactos de nodos y `archivo:línea`, están en `docs/interno/agente-conversacional/`:
> `inventario-n8n-flujo-principal-2026-09-15.md`, `inventario-n8n-subflujos-2026-09-15.md`,
> `inventario-codigo-y-volumen-2026-09-15.md`, y el prompt vigente textual en
> `prompt-agente-n8n-vigente-2026-08-25.md`.

---

## 1. Qué hay hoy (lo que el plan tiene que igualar)

### 1.1 El recorrido de un mensaje

1. **PRISMA recibe** por el webhook de Meta (`app/api/webhooks/meta/route.ts`), descarta
   repetidos por `wamid`, separa al equipo interno, guarda en `wa_messages`, baja el adjunto, y si
   `bot_active` dispara n8n (`lib/whatsapp/n8nTrigger.ts`: 3 intentos de 15 s, si fallan
   `wa_n8n_dead_letter`).
2. **n8n (flujo `PRISMA`, 89 nodos)**: lista de Redis por conversación y `Wait` de 45 s para
   agrupar mensajes, transcripción de audio (OpenAI), descripción de imagen (gpt-4.1-mini),
   clasificador de 14 etiquetas (gpt-4.1) y switch `REGLAS`, bloque MEMORIA DEL LEAD armado desde
   `wa_conversations.metricas`, **agente "Agente IA CEO"** (gpt-5.4-mini, fallback
   claude-sonnet-4-6, hasta 25 iteraciones, prompt de 59.275 caracteres, memoria
   `n8n_chat_histories` de 15 mensajes), formateador LLM que parte la respuesta en 13 partes,
   diez envíos a `/api/n8n/reply` con 2 s entre cada uno, y después el analizador de métricas
   (gpt-5.4-nano, 42 campos) que escribe `metricas`, `score`, `etiquetas`.
3. **Herramientas del agente** (subflujos, cada una recibe UN texto libre escrito por el modelo
   con `agency_id:` y `conversation_id:` adentro):
   - `Cartera_Propiedades`: extractor de links (EasyPanel), embedding Gemini 768, SQL con
     `match_pct` (zona 35 / ambientes 30 / semántica 25 / palabras 10), zona dura con fallback,
     `es_del_link`, top 10, y un sub-agente gpt-5.4-mini que formatea.
   - `Conocimiento_Contexto`: sub-agente gpt-5.4-nano sobre `whatsapp_ai_settings.knowledge_text`.
   - `Gestion_Handoff` (sin IA): email al asesor o al director, marcador interno
     `⚠️ Handoff activado`, `bot_active=false`, `lead_eventos`, regla 23-6 h.
   - `Aviso_Asesor` (sin IA): email por link o por visita, candado de 24 h en
     `metricas.ultimo_aviso`.
   - `Gestion_Visita`: **desconectado**, no se usa.
4. **PRISMA envía** (`/api/n8n/reply`): descarta si el bot se apagó mientras pensaba, manda por
   Evolution (las dos instancias son `integration_type='evolution'`), guarda `role='bot'`.

### 1.2 Volumen real (Central, 16/8 al 15/9)

| Dato | Valor |
|---|---|
| Mensajes de leads por día | 122 de promedio, 245 de máximo |
| Mensajes del bot por día | 172 de promedio |
| Conversaciones nuevas por día | 16 de promedio, 29 de máximo |
| Pico | 48 mensajes de leads en una hora, 6 en un minuto |
| Mensajes de lead a menos de 45 s del anterior | 28,4 % (la ventana importa) |
| Turnos del mes | 2.503, de los cuales 112 sin respuesta del bot (4,5 %) |
| Tiempo de respuesta del bot | mediana 74,5 s, p90 128,6 s |
| Tipos entrantes | texto 3.564, audio 87, imagen 8 |
| Gasto OpenAI de la organización (bot + Buscador + Tutor) | US$77,40 en 30 días; gpt-5.4-mini 7.968 llamadas, 56 % de caché |

El volumen es chico: la escala no es un problema de este plan. El problema es la calidad y el
control.

### 1.3 Lo que falla hoy por diseño (y el plan resuelve por construcción)

Todo verificado en los inventarios y en la memoria del proyecto:

1. **Silencio sin rastro.** 7 de las 14 salidas del clasificador no van a ningún nodo; si el
   clasificador falla, tampoco hay respuesta; la ejecución figura `success`. Casos reales: links
   de portal tomados como spam (5 de 26 ignorados, 31/7), cuota de OpenAI agotada con 17 clientes
   sin respuesta en un fin de semana (15-17/8). No hay `errorWorkflow`.
2. **Sin candado por conversación.** Dos ejecuciones pueden contestar a la vez; la segunda lee la
   memoria sin la respuesta de la primera y repregunta (≈2 % de los turnos, casos Mónica y María).
3. **Memoria ciega tras un error.** `n8n_chat_histories` solo guarda lo que el agente procesó OK:
   un mensaje que cae en un crash no existe más para el bot, aunque esté en `wa_messages`.
4. **El formateador inventa.** Segundo LLM sin memoria entre el agente y el cliente; ya mandó 5
   propiedades inexistentes a una clienta real (31/7) y agregaba preguntas que nadie escribió. Las
   fichas multilínea llegan aplastadas en una línea.
5. **Los ids los escribe el modelo.** Las herramientas no tienen parámetros: agencia y
   conversación viajan en texto libre y se sacan con regex (el bug de `grab()` ya ensució emails).
6. **Escrituras sin agencia.** `metricas`, `score`, `etiquetas`, `opt_out` se actualizan filtrando
   solo por teléfono.
7. **Efectos duplicables.** Reintentar el agente puede duplicar un handoff o un aviso; `/api/n8n/reply`
   no tiene idempotencia; `Aviso_Asesor` pone el candado antes de mandar y un error de base se
   contesta como éxito; su nodo `DERIVAR_CONVERSACION` vuelve a prender el bot.
8. **El prompt no está en git.** Vive solo en n8n, n8n fusiona lo que se edita, no hay historial
   ni prueba antes de producción.
9. **Sin trazabilidad por turno.** No se guarda por qué contestó lo que contestó, qué herramienta
   usó, cuánto tardó ni cuánto costó.
10. **Seguridad del borde** (vale hoy, con o sin este plan): el webhook de Meta no valida la
    firma, y `/api/n8n/reply` exige su clave solo si la variable está cargada.

---

## 2. La arquitectura: un grafo determinista con un nodo agéntico

Es el mismo patrón del Super Agente de seguimiento (en producción desde el 31/8): el código manda
el camino, la IA decide dentro de un solo nodo, y cada paso queda registrado. La conversación es
más exigente que el seguimiento (tiene que contestar en segundos, a un cliente en vivo), así que
el grafo tiene más nodos y la IA más herramientas.

```
Webhook Meta (existe)
   │ guarda el mensaje, responde 200 a Meta
   ▼
[1] VENTANA ─ espera 45 s de silencio del cliente (after() de Next, sin Redis)
   │ si llegó otro mensaje más nuevo, esta espera termina: la atiende la del mensaje nuevo
   ▼
[2] CANDADO ─ un solo turno por conversación (fila en agente_turnos, índice único)
   ▼
[3] CONTEXTO ─ determinista: agencia, lead (metricas), asesor, historial desde wa_messages,
   │           propiedades ya mostradas, adjuntos (audio → texto, imagen → descripción)
   ▼
[4] GUARDIA DE ENTRADA ─ señales (colega, inyección, spam, enojo) que se le pasan al agente.
   │                     NUNCA silencia: el peor caso es "responder con cuidado" o derivar.
   ▼
[5] AGENTE (loop con herramientas, ids inyectados por el código, nunca escritos por el modelo)
   │   buscar_propiedades · leer_propiedad_del_link · consultar_conocimiento
   │   derivar_a_humano · avisar_al_asesor · ver_mensajes_anteriores
   │   └─ termina SIEMPRE con la herramienta responder(mensajes, propiedades)
   ▼
[6] GUARDIA DE SALIDA ─ determinista: propiedades solo de resultados de herramientas, frases
   │                    prohibidas, largo, datos internos. Si falla, vuelve al agente a corregir.
   ▼
[7] ARMADO ─ determinista: la ficha de cada propiedad la arma el CÓDIGO desde la base
   │         (foto, precio, dirección, link). Nada de segundo LLM formateador.
   ▼
[8] ENVÍO ─ módulo único (Evolution / Meta), idempotente por turno, re-chequea bot_active y si
   │        llegó un mensaje nuevo mientras pensaba (en ese caso rehace el turno una vez)
   ▼
[9] DESPUÉS DEL TURNO ─ memoria del lead (modelo chico, mismo esquema de 42 campos), score,
                        etiquetas, visita confirmada, traza del turno, suelta el candado y
                        mira si quedó algún mensaje sin atender.
```

Red de seguridad: un reloj cada 2-3 minutos busca turnos de clientes sin respuesta pasado un
tope (conversación con bot activo, último mensaje del lead hace más de 3 minutos, sin turno en
curso) y candados vencidos, y los relanza. Candidato: `pg_cron` + `pg_net` de Supabase, gratis y
sin depender de n8n ni de GitHub Actions (que se atrasan). Decisión 2 en §8.

### 2.1 Por qué 45 s y un `after()` alcanzan

- Vercel (Fluid Compute) permite hasta 300 s por función y cobra CPU activa, no tiempo de espera:
  esperar 45 s dentro de `after()` no cuesta. Turno típico: 45 s de ventana + 10-30 s de agente +
  envío con pausas ≈ 60-90 s, lejos del límite.
- El candado va en la base (`agente_turnos` con índice único parcial sobre
  `conversation_id where estado='procesando'`): tomar el turno es un `insert`; si choca, ya hay
  otro atendiendo y ese, al terminar, mira si quedó algo nuevo. Así se cierra el ≈2 % de
  repreguntas que hoy no tiene arreglo en n8n.
- Si una función muere a mitad de camino, el reloj de §2 lo levanta. Nada queda en silencio.

### 2.2 El modelo y el prompt

- **Modelo principal: lo decide el set de evaluación** (Fase 0), no la preferencia. Candidatos:
  Claude Sonnet 5 (mismo stack y caché controlado que el Super Agente), Claude Haiku 4.5 y
  gpt-5.4-mini (el de hoy). Fallback a otro proveedor si el principal falla o está sin cuota: el
  15-17/8 una cuota agotada dejó 17 clientes sin respuesta.
- **El prompt pasa a git**, partido por secciones como hoy (precedencia, objetivo, comunicación,
  anti-invención, calificación, ficha, zona, recomendación, link, expensas, crédito, visita,
  handoff, colega, conocimiento) y con los nombres dinámicos de la regla del 10/9 (agencia, bot,
  asesor, cliente). Lo fijo arriba y cacheado; lo variable (memoria del lead, contexto) abajo.
- **Se achica**: las secciones que hoy existen para compensar al formateador, al parseo de texto
  libre de las herramientas o a la salida `{Mensaje, Fecha}` desaparecen, porque ahora eso lo hace
  el código (ficha armada por el código, herramientas con parámetros, respuesta estructurada). Se
  audita con la skill `vakdor-prompt`.
- Pensamiento adaptativo en el agente (lo usa el Super Agente).

### 2.3 Las herramientas (portadas de los subflujos, con parámetros tipados)

| Herramienta | Qué hace | Viene de | Cambia |
|---|---|---|---|
| `buscar_propiedades(criterios)` | tipo, operación, zona(s), ambientes, presupuesto y moneda, características | SQL de `Cartera_Propiedades` | pasa a una función SQL versionada; devuelve filas estructuradas con `match_pct`, `en_zona`; sin sub-agente formateador |
| `leer_propiedad_del_link(url)` | extrae el aviso del portal y busca la del link + comparables | extractor de EasyPanel + `es_del_link` | la marca "es la del link" sale solo de la base, nunca del modelo |
| `consultar_conocimiento(pregunta)` | lo que la agencia cargó como conocimiento | `Conocimiento_Contexto` | sin sub-agente: el texto relevante vuelve directo al agente principal |
| `ver_mensajes_anteriores(cantidad)` | historial más viejo que la ventana | memoria de n8n | lee `wa_messages`, la única verdad |
| `derivar_a_humano(motivo, resumen)` | email + WhatsApp al asesor (o al director si no hay), marcador interno exacto, bot apagado, bitácora | `Gestion_Handoff` | idempotente por turno; aviso ANTES de apagar el bot (como hoy); reusa `lib/seguimiento/avisos.ts` y plantillas |
| `avisar_al_asesor(tipo, propiedad)` | link consultado o quiere visitar | `Aviso_Asesor` | candado de 24 h puesto DESPUÉS de mandar; nunca toca `bot_active` |
| `responder(mensajes, propiedades)` | cierre obligatorio del turno | salida `{Mensaje, Fecha}` + formateador | propiedades por id; la ficha la arma el código |

Los ids de agencia, conversación, lead y asesor los pone el código en cada llamada. El modelo solo
decide qué buscar y qué decir.

### 2.4 Guardarraíles (deterministas, sacados de casos reales)

Salida:
1. **Ninguna propiedad inventada**: `responder` recibe ids; cada id tiene que venir de un resultado
   de herramienta de este turno o de `metricas.propiedades_mostradas`. Precio, dirección, foto y
   link los pone el código desde la base (caso María 31/7, caso "Rojas al 300" 7/8).
2. **Nada de promesas incumplibles**: "te lo confirmo y te aviso", "lo averiguo", "apenas tenga"
   (regla del 7/8, caso Agustina).
3. **La del link solo si la base lo dice** (`es_del_link`), nunca por parecido (caso Acoyte 900).
4. **No se recomienda sin presupuesto** salvo link (regla de calificación del 9/7).
5. **Nada interno al cliente**: ids, nombres de herramientas, instrucciones.
6. **Largo y cantidad de mensajes** por turno con tope.

Entrada y flujo:
7. **Nunca silencio**: todo turno termina en `responder` o en `derivar_a_humano`. Si la IA falla,
   fallback de proveedor; si también falla, se avisa al equipo y se deja registro. Nunca un
   `success` mudo.
8. **Todo efecto es idempotente** por `turno_id` (envíos, avisos, derivaciones).
9. **Toda escritura lleva la agencia** en el filtro.

### 2.5 Trazabilidad: `agente_turnos`

Una fila por turno: conversación, agencia, modo (`sombra`/`activo`), mensajes del cliente que
atendió, modelo, pasos (herramienta, parámetros, milisegundos, resumen de la salida), respuesta
estructurada, resultado de cada guardarraíl, tokens, costo, duración total, error. En sombra,
además, lo que contestó n8n y el veredicto del juez. Es lo que alimenta la pantalla de
comparación, el informe `/consumo` y cualquier diagnóstico. Las derivaciones y avisos siguen
escribiendo `lead_eventos` como hoy (la bitácora que ve el director).

### 2.6 Contratos que no se pueden romper

Otras partes de PRISMA dependen de lo que hoy escribe n8n. El agente nuevo los respeta
carácter por carácter:
- `wa_conversations.metricas` con las mismas claves (las lee el Super Agente: `nombre`,
  `fue_derivado_a_humano`, `solicito_hablar_con_humano`, `etapa`, `propiedad_interes`…; los paneles
  y la auditoría). Merge con `jsonb_strip_nulls`, como hoy.
- El marcador `⚠️ Handoff activado: El bot se ha desactivado.` (lo lee el panel de derivaciones).
- `score` (BANT 1-12), `etiquetas`, `opt_out`, `requires_follow_up`, `scheduled_visits.estado_visita`.
- `wa_messages.role='bot'` para cada mensaje enviado.

---

## 3. Sombra y cambio: cómo se pasa sin perder leads

Un interruptor por agencia en `whatsapp_ai_settings`: `agente_modo` = `n8n` | `sombra` | `activo`.

- **`n8n`** (hoy): nada cambia.
- **`sombra`**: el webhook dispara n8n como siempre **y además** corre el agente nuevo, que arma su
  respuesta pero **no envía nada ni ejecuta efectos** (derivar y avisar quedan simulados en la
  traza). Como su historial es `wa_messages`, en cada turno parte de la conversación real, con lo
  que n8n efectivamente contestó. Se guarda al lado de lo que mandó n8n.
- **`activo`**: el webhook ya no llama a n8n; contesta el agente nuevo.

Volver atrás es cambiar el interruptor: el siguiente mensaje ya va por el otro camino. n8n queda
prendido y sin tocar 30 días después del cambio.

**Criterios para pasar de sombra a activo** (se miden sobre al menos 2 semanas de sombra en
Central):
1. Cero propiedades inventadas (chequeo automático contra la base).
2. Cero turnos sin respuesta ni derivación.
3. El juez prefiere la respuesta nueva o empata en al menos el 80 % de los turnos, y Leonardo
   revisa a mano una muestra de 50 y está de acuerdo.
4. Derivaciones dentro de ±20 % de las de n8n, y cada diferencia revisada.
5. Tiempo de respuesta p90 igual o mejor que hoy (128,6 s).
6. Costo por turno medido y aceptado.

Orden del encendido: PRISMAIA - VAKDOR primero (Leonardo le escribe como cliente), después
Central, un día hábil a las 9, nunca en la franja 13-15.

---

## 4. Fases

Cada fase termina con algo que se puede probar y con el OK de Leonardo para la siguiente. Los
tamaños son gruesos y se ajustan al terminar la Fase 0.

### Fase 0 — Medir y preparar el terreno (no toca a ningún cliente)
- **Set de evaluación**: 100 turnos reales de Central con lo que se espera de cada uno, verificable
  (debe derivar / debe pedir presupuesto antes de mostrar / la del link / zona dura / no prometer /
  colega externo / audio / enojo). Incluye cada incidente conocido: María, Agustina, Felipe,
  Mónica, Núñez→Escobar, links tomados como spam, "no sirve lo que me decís". **Se corre también
  contra las respuestas reales que dio n8n**: esa es la vara a igualar.
- Tabla `agente_turnos`, columna `agente_modo`, módulo único de envío (hoy hay nueve copias con
  Graph v19/v20/v21) que devuelva el `wamid`.
- Seguridad del borde: validar la firma del webhook de Meta; exigir siempre la clave de
  `/api/n8n/reply`.
- **Alarma de silencio** que sirve desde ya, con n8n: cliente con bot activo sin respuesta en 5
  minutos → aviso. Hoy nadie se entera.
- Tamaño: una semana.

### Fase 1 — Las herramientas, probadas solas
- `buscar_propiedades` como función SQL versionada: **las mismas búsquedas reales que hizo n8n
  (parámetros sacados de sus ejecuciones) tienen que devolver las mismas propiedades**, prueba de
  paridad.
- `leer_propiedad_del_link`, `consultar_conocimiento`, `derivar_a_humano`, `avisar_al_asesor`,
  cada una con sus pruebas y sus efectos simulables.
- Tamaño: una semana.

### Fase 2 — El agente
- Prompt migrado a git y achicado; loop, guardarraíles, armado de fichas, adjuntos, memoria del
  lead, traza.
- **Tiene que igualar o superar a n8n en el set de evaluación** antes de ir a sombra. Ahí se elige
  el modelo, con costo por turno medido.
- Pantalla de prueba en el admin de Vakdor para chatear con el agente sin WhatsApp.
- Tamaño: dos semanas.

### Fase 3 — Sombra en Central
- Interruptor en `sombra`. Pantalla de comparación en el admin: por turno, lo que dijo n8n, lo que
  habría dicho el agente nuevo, el veredicto del juez, las herramientas y el costo.
- Ajustes de prompt con el set de evaluación como red.
- Duración: mínimo 2 semanas de calendario, hasta cumplir los criterios de §3.

### Fase 4 — Encendido
- PRISMAIA en activo; después Central. Primer día con la traza abierta.
- n8n apagado recién 30 días después, con backup de los flujos en `docs/interno/n8n-backups/`.
- Tamaño: una semana.

### Fase 5 — Lo que n8n no podía (después, cada una con su OK)
- Agendar visitas en el calendario (hoy `Gestion_Visita` está desconectado).
- Resumen de conversaciones largas en vez de mandar el historial entero.
- "¿Por qué respondió esto?" al lado de cada mensaje del bot, para el director.
- El Super Agente de seguimiento y el conversacional compartiendo `lib/agente/` (guardarraíles,
  traza, costo), como pide la evaluación del 8/9 §3.2.
- Personalización del prompt por agencia desde PRISMA.

---

## 5. Costo

Estimación, a confirmar en sombra con tokens reales. Base: 2.503 turnos por mes, prompt fijo de
10-12 mil tokens cacheado, 5-10 mil variables, 2-3 vueltas por turno.

| Modelo | Por turno | Por mes |
|---|---|---|
| Claude Sonnet 5 (tarifa efectiva medida: 2 / 10 por millón, caché 0,2) | ≈ US$0,05-0,08 | ≈ US$125-200 |
| Claude Haiku 4.5 o gpt-5.4-mini | ≈ US$0,02-0,03 | ≈ US$50-75 |

Hoy la organización gasta US$77,40 por mes en OpenAI (bot, Buscador y Tutor juntos). Durante la
sombra se paga doble (n8n + nuevo) unas 2 semanas. El modelo se elige mirando calidad en el set
y costo por turno, juntos.

---

## 6. Riesgos

| Riesgo | Cómo se cubre |
|---|---|
| El agente nuevo contesta peor que Sofía de hoy | set de evaluación con la vara de n8n; sombra con criterios; interruptor para volver |
| Dos caminos contestan al mismo cliente | el webhook elige uno por agencia; en sombra el nuevo no envía nada |
| Se rompe algo que dependía de n8n (panel de derivaciones, Super Agente, métricas) | §2.6: contratos respetados y probados |
| Una función de Vercel se corta a mitad de turno | candado con vencimiento + reloj que relanza |
| Límites del plan de Vercel | volumen chico; verificar el plan actual antes de la Fase 3 |
| Cambios de prompt que rompen otra cosa | ningún cambio sin correr el set |

---

## 7. Lo que no hace este plan

- No toca el Super Agente de seguimiento.
- No agrega capacidades nuevas antes del encendido: primero igualar, después superar (Fase 5).
- No migra datos: la verdad sigue siendo `wa_messages` y `metricas`.
- No cambia Evolution ni Meta como vía de envío.

---

## 8. Decisiones de Leonardo

1. **Arrancar la Fase 0.** Recomendación: sí; el set de evaluación y la alarma de silencio sirven
   aunque el resto no se haga.
2. **Reloj de la red de seguridad**: `pg_cron` de Supabase (recomendado) o GitHub Actions.
3. **Duración mínima de la sombra**: 2 semanas (recomendado).
4. **Orden del encendido**: PRISMAIA y después Central (recomendado).
5. **Visitas agendadas por el bot**: fuera de la paridad, Fase 5 (hoy no existe).
