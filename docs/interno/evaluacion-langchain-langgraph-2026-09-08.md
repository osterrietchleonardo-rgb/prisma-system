# LangChain / LangGraph / Deep Agents frente a PRISMA (8/9/2026)

> Pedido de Leonardo (7/9): "¿el Super Agente usa loop o graph engineering? ¿Conviene mirar
> LangGraph?" y después: "leé esto detalladamente y anotalo". Fuentes leídas completas el 8/9:
> `docs.langchain.com/build-overview`, `oss/python/deepagents/overview`,
> `langsmith/python/managed-deep-agents-overview`, `oss/python/langchain/overview`,
> `oss/python/langgraph/overview`, `oss/openwiki/overview`,
> `oss/python/integrations/providers/overview`, `oss/python/learn`, `oss/python/reference/overview`.
> Este documento es la evaluación, no un plan. Nada de acá está aprobado para construir.

## 1. Cómo está armado hoy el Super Agente (verificado en el código el 7/9)

- **Un grafo determinista con un nodo agéntico.** El seguimiento al cliente es un recorrido
  fijo: elegibilidad en SQL (`seguimiento_candidatos`) → puntaje (`prioridad.ts`) → decisión
  (`agente.ts`) → guardarraíles (`guardrails.ts`) → ejecución (`ejecutor.ts`). La escalera al
  asesor (`escalamiento.ts`) es otro recorrido fijo con dos llamadas de IA de un solo paso
  (nota interna, despedida), sin herramientas y sin bucle.
- **El único "loop" está en la decisión** (`decidirConAgente`): hasta 6 vueltas, cuatro
  herramientas de lectura, decisión final obligatoria por herramienta (`emitir_decision`),
  validación con Zod y rechazo si no investigó lo que tenía que investigar
  (`requisitosInvestigacion`). Es el patrón "agentic loop" clásico, con techo y con auditoría.
- **El estado vive en Supabase, no en memoria:** `lead_eventos` (bitácora por lead),
  `seguimiento_decisiones`, `compromisos`, marcadores idempotentes por caso (`t0`). Una corrida
  puede morir y la siguiente (reloj n8n cada 30 min) retoma sin repetir. La pausa humana existe
  (Aprobaciones, botones "Lo tomo" / "No lo puedo tomar").
- **Corre en funciones de Vercel** disparadas por un reloj externo: procesos cortos, sin
  proceso vivo entre corridas.

En la taxonomía de LangChain (página `langchain/overview`, "Agent = Model + Harness") esto es:
un **runtime de orquestación propio** (el rol de LangGraph) + un **harness mínimo propio** (el
rol de `create_agent`), sin librería. La arquitectura es la que ellos mismos recomiendan:
"mix deterministic and agentic steps in a single graph" (página `langgraph/overview`).

## 2. Qué es cada producto y qué le aportaría a PRISMA

| Producto | Qué es (según sus docs) | Aporte a PRISMA hoy | Veredicto |
|---|---|---|---|
| **LangGraph** | Runtime de bajo nivel: grafo de nodos, ejecución durable con checkpoints, interrupts para humano en el loop, memoria corta/larga, streaming. Python primero; existe en TS. | Todo lo que promete ya está resuelto con Supabase + reloj + bitácora, y de forma que el director puede leer. Adoptarlo = reescribir módulos con 200+ tests y llevar su checkpointer a Postgres igual. | **No migrar.** Revisar solo si aparece un agente con conversaciones largas que se pausan y retoman por horas con varias ramas en paralelo. |
| **LangChain (`create_agent` + middleware)** | Harness mínimo: modelo + tools + prompt + *middleware* (guardarraíles, reintentos, políticas por herramienta) alrededor del bucle. Interfaz estándar para cambiar de proveedor. | La idea de **middleware** es exactamente lo que hacen `guardrails.ts` y `requisitosInvestigacion`, hoy pegado a cada módulo. | **Robar la idea, no la librería.** Cuando se extraiga `lib/agente/` (pendiente), modelar guardarraíles y reintentos como capas reutilizables alrededor del bucle. |
| **Deep Agents** | "Agent harness" con baterías: sistema de archivos virtual, subagentes con contexto aislado, resumen automático del historial, *skills* con carga progresiva, memoria (`AGENTS.md`), prompt caching automático con Anthropic, `interrupt_on` por herramienta. | Tres ideas sirven: (1) **prompt caching** de la parte fija del system prompt (ya se mide `cacheLeido` en el loop; confirmar que esté activo en todos los agentes, incluidos Buscador y Tutor); (2) **skills con carga progresiva** para el Buscador IA / Tutor: conocimiento por tema que se carga solo cuando la consulta lo pide, en vez de un prompt gigante; (3) **subagentes con contexto aislado** para el punto pendiente del Buscador con herramientas (búsqueda pesada + PDF) sin ensuciar la conversación principal. | **Ideas sí, librería no** (Python, pensado para procesos largos y agentes de código). |
| **Managed Deep Agents (LangSmith)** | Hosting administrado del harness: carpeta con `agent.py`, `instructions.md`, `skills/`, `tools/`, conectores MCP, memoria, identidad por usuario, canales (Slack), cron, evals. Sin servidores. | No para el producto PRISMA (Python, hosting de terceros, costo por plataforma). Podría servir para agentes internos de Vakdor, por ejemplo una versión del Socio con cron y canal, si algún día se quiere sacar de Claude Code. | **Anotado, sin acción.** |
| **OpenWiki** | CLI que genera y mantiene un wiki Markdown del repo para que los agentes de código lo lean antes de tocar el código; se integra con Claude Code. | Es la versión automática de `TECNICO-PRISMA.md` + bitácora. Podría complementarlas para que las sesiones arranquen más baratas. Consume tokens en cada actualización. | **Experimento opcional**, baja prioridad: `openwiki --init` en una rama y comparar con la doc a mano. |
| **Integraciones** | 1000+ proveedores tras una interfaz común; para TS existen Anthropic, OpenAI, Google, etc. Lista de *checkpointers* (incluye Postgres). | PRISMA ya habla con Claude, OpenAI y Gemini por sus SDK directos, y el stack es Next.js/Vercel: si se quisiera una interfaz común en TS, el AI SDK de Vercel queda más cerca que LangChain. | **Nada que hacer.** |
| **Learn (tutoriales)** | Patrones multiagente: *handoffs* (un agente cambia de estado), *router* (deriva a agentes especializados), *skills* (carga progresiva), *subagents*. Guías de memoria y context engineering. | Lectura útil antes de diseñar los **agentes por campaña** de WhatsApp: el patrón *router* (un clasificador determinista que manda a un agente por campaña) es el que ya está insinuado en la idea del 3/9. | **Leer cuando toque ese diseño.** |
| **LangSmith (observabilidad y evals)** | Trazas de cada corrida, evaluación de salidas, "Engine" que detecta problemas y propone arreglos. | La traza ya existe a mano (`lead_eventos`, `seguimiento_decisiones`, trazabilidad del director). Lo que **no** existe es un **set de evaluación**: casos reales con el veredicto esperado, para correr cada vez que se toca un prompt. Hoy eso se hizo a mano dos veces (81 casos de despedida, 156 derivaciones) y se tira. | **Es el hueco real.** Ver §3. |
| **Reference** | Índice de referencias de API. | — | Nada. |

## 3. Lo que sí conviene tomar, por orden de valor

1. **Un set de evaluación por agente, guardado en el repo.** Los JSON de hoy
   (`despedida-semana-v2.json`, `handoffs-sin-atender.json`, en el scratchpad de la sesión) son
   exactamente eso: entrada real + veredicto. Falta congelarlos con el veredicto *esperado*
   (revisado por una persona) y un test manual que los corra y cuente aciertos. Sin esto, cada
   cambio de prompt se verifica a ojo. Es lo más barato y lo que más protege.
2. **Guardarraíles como capa reutilizable** (la idea del middleware) al extraer `lib/agente/`:
   techo de vueltas, validación de la decisión, requisitos de investigación, reintento por
   nodo, registro de tokens. Hoy están escritos dentro del bucle del seguimiento.
3. **Un objeto de estado explícito por corrida** que pase de nodo en nodo, con nombre, en vez
   de que cada módulo lea y escriba la base por su cuenta. No cambia el comportamiento; hace
   legible el grafo cuando haya cuatro agentes.
4. **El dibujo del grafo en la documentación** (nodos, qué entra, qué sale). Para explicarlo a
   un cliente o a un desarrollador nuevo en cinco minutos.
5. **Skills con carga progresiva y subagentes aislados** para el Buscador IA cuando se haga el
   punto 2 (bucle con herramientas y PDF).
6. **Confirmar el prompt caching** en todos los agentes con Claude (el loop del seguimiento ya
   lo mide; Buscador y Tutor corren sobre OpenAI/Gemini, revisar qué ofrece cada uno).

## 4. Si algún día se construye un "deep agent" para PRISMA: la lógica a tomar

Leonardo (8/9): "dejalo anotado para futuras mejoras y para tomar lógica para posibles
creaciones de super deep agents para PRISMA". Deep Agents define un harness en cuatro
componentes; esto es cómo se traduce cada uno a PRISMA, sin la librería.

| Componente (Deep Agents) | Qué es | Traducción a PRISMA | Ya existe |
|---|---|---|---|
| **Entorno de ejecución** | Herramientas, sistema de archivos virtual, sandbox para código, streaming de eventos. | Herramientas = lo que hoy son `leer_mensajes`, `leer_propiedad`, etc.; "archivos" = tablas de Supabase (propiedades, chats, ACM) detrás de herramientas de lectura/escritura con permisos por rol; streaming = el NDJSON del Buscador. Sandbox de código: no hace falta en el producto. | Parcial: herramientas de lectura sí; escritura con permisos, no. |
| **Gestión de contexto** | Skills con carga progresiva, memoria persistente (`AGENTS.md`), resumen automático del historial, descarga de resultados grandes, prompt caching. | Skills = conocimiento por tema (crédito hipotecario, alquiler, expensas, zona) que el agente lee solo cuando la consulta lo pide; memoria = `metricas` del lead + `notas_ia` de la propiedad + perfil de la agencia; resumen = necesario para chats de WhatsApp largos (hoy n8n manda todo); caching = parte fija del system prompt marcada como cacheable. | Memoria sí; skills, resumen y caching general, no. |
| **Delegación** | Subagentes efímeros con contexto propio que devuelven un solo informe; planificación con lista de tareas opcional. | Un agente principal que delega: "buscá comparables", "leé este PDF", "revisá el calendario" a subagentes que devuelven un resumen corto. Es el patrón para el Buscador con herramientas y para el resumen semanal por asesor. Lista de tareas: solo para corridas largas (por ejemplo, un informe semanal por agencia). | No. Hoy cada agente es plano. |
| **Dirección (steering)** | Pausa para aprobación humana en herramientas sensibles (`interrupt_on`), permisos por ruta. | Ya existe la versión PRISMA: Aprobaciones del director, "Lo tomo / No lo puedo tomar", guardarraíles que rechazan una decisión. Falta generalizarlo: cualquier herramienta de **escritura** (mandar un mensaje, cambiar un estado, agendar) pasa por una capa de permiso por rol y, si es sensible, por aprobación. | Parcial. |

Reglas que valen para cualquier deep agent de PRISMA, aprendidas del Super Agente:
1. **Ninguna afirmación sin el dato leído** (regla de oro del prompt actual): las herramientas de
   lectura son la única fuente; lo que no se leyó no existe.
2. **Decisión final por herramienta obligatoria**, validada con esquema, y rechazada si no se
   investigó lo que había que investigar.
3. **Techo de vueltas y de costo por corrida**, medido en tokens y guardado.
4. **Todo lo que hace queda en la bitácora del lead** con la razón en castellano, legible por el
   director. Un deep agent que no deja rastro no entra a producción.
5. **Sombra antes que activo**: toda capacidad nueva corre primero registrando qué habría hecho.
6. **Set de evaluación** con casos reales antes de tocar un prompt (§3.1).

## 5. Cuándo volver a mirar LangGraph

- Si un agente necesita **conversaciones largas que se pausan y retoman** por horas o días, con
  el estado intermedio de una investigación (no solo el resultado) y varias ramas en paralelo.
- Si se abandona el modelo "reloj + funciones cortas" por un proceso vivo (por ejemplo, un
  servidor propio en EasyPanel) y hace falta ejecución durable dentro del proceso.
- Si el equipo crece y varios desarrolladores necesitan un vocabulario común de grafo.

Mientras no pase ninguna de las tres, la librería sería cambiar la caja de herramientas sin
cambiar la casa.

## 6. Segunda lectura: "Arquitectura de un Agente CLI para tu SaaS" (15/9/2026)

> Pedido de Leonardo (15/9): "analizá el documento de mi carpeta de descargas, a ver si podés
> sacar algo de valor para sumar a lo que ya tenemos". Fuente: `arquitectura_agente_cli_saas.pdf`
> (guía técnica genérica, 14 páginas, sin autor, "edición de referencia septiembre 2026").
> Contrastado contra `lib/seguimiento/agente.ts`, `herramientas.ts`, `nota-interna.ts`,
> `app/api/seguimiento/run/route.ts` y las secciones 1-5 de este documento.

**Qué es:** una guía para construir un asistente tipo "Claude Code dentro de un SaaS": bucle
ReAct con tool-calling nativo, sub-agentes, sandbox de código, registro de skills con carga
perezosa, ventana deslizante de contexto, streaming SSE, y una lista de anti-patrones y un
checklist de producción. Su tesis coincide con la decisión del 8/9: bucle propio para producción,
frameworks solo para prototipos, LangGraph solo si hacen falta ramas explícitas.

### 6.1 Lo que ya tenemos (verificado en el código el 15/9)

| Recomendación del documento | En PRISMA |
|---|---|
| Tool-calling nativo, nada de regex sobre texto | `decidirConAgente`: herramientas de la API de Anthropic, decisión por tool `emitir_decision` |
| Presupuesto de turnos | `MAX_ITERACIONES = 6` por decisión; `MAX_LLAMADAS_IA = 20` por barrida de la escalera |
| Validar el esquema de cada tool_call y devolver el error al modelo | `DecisionAgenteSchema.safeParse` + `tool_result` con `is_error` y el motivo; `requisitosInvestigacion` |
| Prompt de sistema corto y cacheado | `cache_control: ephemeral` sobre `PROMPT_AGENTE` + tools; `cacheLeido` medido |
| Herramientas que devuelven resúmenes, no volcados | `leer_mensajes` recorta a 400 caracteres por mensaje y 50 mensajes; `leer_propiedad` a 3 filas |
| Telemetría por turno | `pasos` (herramienta, input, 200 caracteres de salida) y tokens guardados en `seguimiento_decisiones` |
| Fallos nunca silenciosos | regla del 4/9: `nota_error`, `despedida_error`, `escalera_casos` que tira en vez de "0 esperando" |
| Worklog compartido append-only | `lead_eventos`, la bitácora por lead |
| Multi-tenancy con aislamiento | RLS por agencia; nombres dinámicos por agencia (§22.11 del TECNICO) |
| Streaming al usuario | NDJSON del Buscador y el Tutor (TECNICO §23) |
| Set de evaluación antes de tocar un prompt | §3.1 de este documento; hecho a mano el 10/9 con 8 notas reales |

### 6.2 Lo que suma, por orden de valor

1. **Alertas automáticas cuando una corrida falla.** El documento fija "error rate > 5 %" como
   alarma mínima. Dato propio: `SuperAgente_Reloj` falló 78 veces entre el 7 y el 14/9 (14-17
   por día del 8 al 10/9) y nadie se enteró hasta que Leonardo abrió n8n (TECNICO §22.13).
   Traducción: el ajuste `errorWorkflow` de n8n apuntando a un flujo mínimo que mande un
   correo por cada ejecución en rojo (los 3 flujos del Super Agente y `Gestion_Handoff`).
   Escritura en n8n: con OK. Es lo más barato del documento y lo que más faltó.
2. **Tiempo máximo por llamada a la IA en el agente de decisiones.** `nota-interna.ts` y
   `despedida.ts` crean el cliente con `timeout: 20_000, maxRetries: 1`; `agente.ts` lo crea con
   los valores por defecto del SDK (10 minutos, 2 reintentos). Una llamada colgada se come sola
   los 300 s de la ruta. Traducción: mismo patrón, con un techo acorde a las 6 vueltas (por
   ejemplo 60 s por llamada, 1 reintento) y un evento `error` si se agota.
3. **Duración por paso.** Se guarda qué herramienta llamó el agente y cuántos tokens usó, pero no
   cuánto tardó cada llamada ni cada herramienta. El diagnóstico del 14/9 tuvo que salir de la
   API de n8n. Traducción: `ms` en cada `PasoAgente` y `duracion_ms` en la decisión; alimenta el
   informe `/consumo` y cualquier diagnóstico futuro sin salir de la base. Se junta con el
   evento `corrida` por barrida que ya pide el brief de la skill
   (`brief-skill-consumo-ia-super-agente-2026-09-10.md`).
4. **Frenar las llamadas repetidas.** El documento propone hashear los parámetros de cada
   tool_call y, a la tercera repetición idéntica, cortar con explicación. Hoy `decidirConAgente`
   deja que el agente pida la misma propiedad seis veces hasta agotar las vueltas. Traducción:
   un mapa `herramienta+input → salida` dentro del loop; a la repetición se devuelve "ya lo leíste,
   está arriba" sin ir a la base. Chico y gratis.
5. **Ejecutar en paralelo las herramientas de un mismo turno.** El loop las corre una atrás de
   otra (`for (const tu of llamadas)`); Claude puede pedir varias en un turno. `Promise.all`
   sobre las de lectura. Ganancia pequeña por decisión; la lección del 14/9 (25,7 s → 82 ms) fue
   exactamente "no encadenar viajes a la base".

Refuerzan lo ya anotado en §3: resumir el historial largo de WhatsApp en vez de mandarlo entero
(§4, componente "gestión de contexto"), y correr el set de evaluación en cada cambio de prompt,
nunca a ojo (§3.1). El documento agrega "A/B de prompts: nunca cambiar sin medir", que es la
misma regla.

### 6.3 Lo que no es para PRISMA

Sandbox de código (Docker, E2B, Firecracker), cobro por tokens con Stripe, SSO, RBAC de tres
roles, SDK de Vercel para el bucle, fallback entre proveedores por sesión. Los agentes de PRISMA
no ejecutan código generado por el modelo, al cliente no se le cobran tokens (se le factura el
costo de IA aparte, ver `costos-variables-super-agente-2026-09-10.md`), los roles ya existen
(asesor / director / admin), y el bucle ya está hecho y medido.

### 6.4 Dónde entra cada punto

Ninguno de los cinco está aprobado para construir. El 1 es una escritura en n8n con OK. El 2, 3
y 4 son cambios chicos en `lib/seguimiento/agente.ts` y se prueban con el set de evaluación
manual antes de tocar producción. El 5 puede esperar. Se retoman cuando se extraiga `lib/agente/`
(§3.2), o antes si vuelve a pasar algo como lo del reloj.
