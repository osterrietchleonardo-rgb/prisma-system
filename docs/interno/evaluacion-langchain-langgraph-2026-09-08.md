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

## 4. Cuándo volver a mirar LangGraph

- Si un agente necesita **conversaciones largas que se pausan y retoman** por horas o días, con
  el estado intermedio de una investigación (no solo el resultado) y varias ramas en paralelo.
- Si se abandona el modelo "reloj + funciones cortas" por un proceso vivo (por ejemplo, un
  servidor propio en EasyPanel) y hace falta ejecución durable dentro del proceso.
- Si el equipo crece y varios desarrolladores necesitan un vocabulario común de grafo.

Mientras no pase ninguna de las tres, la librería sería cambiar la caja de herramientas sin
cambiar la casa.
