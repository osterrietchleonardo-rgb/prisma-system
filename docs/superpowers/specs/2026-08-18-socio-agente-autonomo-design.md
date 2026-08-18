# El Socio — agente autónomo de dirección — DISEÑO

> Rama: `feat/socio-agente-autonomo` (desde `main` @ `eb62aaa`).
> Vive en: `.claude/` de este repo (comando + skills) y en el vault de Obsidian
> `C:\Users\LENOVO\OneDrive\Escritorio\Vakdor\MEMORIA\VAKDOR`.
> No toca la app PRISMA ni su `package.json`.

## 1. Problema

Leonardo dirige Vakdor solo. Tiene cuatro frentes abiertos al mismo tiempo —marketing,
producto/operativo, decisiones de CEO y finanzas— y ninguna forma de decidir cuál atender hoy.
El síntoma que él describe es "tantas cosas tengo en la cabeza"; el síntoma medible es otro:

1. **Las herramientas de orden se abandonan.** ClickUp: 4 tareas madre, todas en `to do`, sin
   fecha, sin prioridad, sin asignar. Obsidian: 1 nota (`Bienvenido.md`, 15/06/2026), nunca
   escribió nada. Slack: cuenta creada, sin uso. Notion: +100 páginas pero desactualizadas —
   lo único reciente son los backups de n8n.
2. **No hay norte escrito.** El objetivo declarado ("que PRISMA sea el SaaS número 1 de Latam")
   no tiene números ni plazos, así que ninguna tarea se puede priorizar contra nada.
3. **No hay memoria entre días.** Cada sesión de trabajo arranca de cero. Nada registra qué se
   decidió ayer ni qué se viene pateando hace tres semanas.
4. **Las 18 skills y los ~10 CLIs conectados dependen de que él se acuerde de pedirlos.** No hay
   ni un agente ni un comando definido en `.claude/`.
5. **Lo que se le cruza por la cabeza se pierde.** No hay lugar de captura.

El diagnóstico: no falta cableado, falta **criterio y ritmo**. Conectar una herramienta más no
resuelve nada — ya se probó cuatro veces.

## 2. Qué NO se toca

Lista dura, para que "sin romper nada" sea verificable.

- **La app PRISMA.** El Socio no agrega dependencias a `package.json`, no toca `app/`, `lib/`
  ni las migraciones. Vive entero en `.claude/` y en el vault.
- **El bot de WhatsApp (n8n).** Lectura libre; ninguna escritura sin OK explícito, según la
  regla ya vigente.
- **Los datos de clientes en Supabase.** El Socio lee; no escribe.
- **La agencia Central (cliente real).** Fuera del alcance del Socio, como siempre.
- **Las 18 skills existentes.** El Socio las invoca; no las reescribe.
- **Las conexiones ya verificadas** (ClickUp, Zoho, Notion, MailerLite, Meta Ads, EasyPanel,
  Buffer, Supabase): se usan tal cual están.

## 3. Decisiones tomadas

Cerradas durante el brainstorming del 18/08/2026. Cambiarlas invalida partes del diseño.

| # | Decisión | Alternativas descartadas |
|---|---|---|
| 1 | Corre **local, en la terminal, cuando Leonardo lo llama** (`/socio`). | Briefing automático desde la nube: pierde acceso a las herramientas locales. |
| 2 | Las **tareas viven en ClickUp**. | Archivos en el repo; una sección nueva dentro de PRISMA. |
| 3 | Arranca con una **sesión de fundación** que produce el norte escrito. | Asumir objetivos; pedirlos sueltos. |
| 4 | **Autonomía acotada**: actúa solo en lo barato y reversible; pide OK para lo que gasta plata, sale a la calle o toca clientes. | Solo mirar y proponer; autonomía amplia. |
| 5 | Investigación de mercado **semanal** (junta y entrega el mismo día). | Diaria (cara y no se lee); solo bajo demanda. |
| 6 | **Bandeja de entrada** en Obsidian: Leonardo tira, el Socio clasifica. | Que escriba solo el Socio; dictado por voz. |
| 7 | Franqueza **directa pero siempre con el dato al lado**. | Dura sin anestesia; suave. |
| 8 | Primer asesor a construir: **Marketing**. | Producto, CEO, Finanzas. |

## 4. Dónde vive cada cosa

Cinco fuentes, un rol cada una. La regla existe para que nada tenga dos casas posibles.

| Fuente | Rol | Quién escribe | Estado verificado |
|---|---|---|---|
| **`docs/` de PRISMA** | **La verdad del producto.** 51 documentos, actualizados 17-18/08/2026. | Leonardo y Claude | ✅ Vivo |
| **Obsidian** | **El cuaderno diario**: norte, bitácora, Inbox, frentes. Archivos locales: lectura y escritura instantáneas, sin costo de API. | El Socio (+ Inbox de Leonardo) | Vacío, por crear |
| **ClickUp** | **Las tareas.** Lo que Leonardo mira desde el celular. | El Socio | ✅ Conectado |
| **Notion** | **Archivo histórico a limpiar.** Desactualizado salvo los backups de n8n. | Nadie, por ahora | ✅ Conectado, sin rol activo |
| **MailerLite** | **Leads y campañas.** Entra por el asesor de Marketing. | El Socio (borradores) | ✅ Conectado |

**Por qué Obsidian y no Notion para el día a día:** son archivos en disco. Escribir la bitácora
todos los días vía la API de Notion sería lento y pago; en Obsidian es instantáneo y gratis. Y
OneDrive ya lo sincroniza a todos los dispositivos.

**Criterio de revisión (no es fe, es una prueba):** si a las 3 semanas de uso la bitácora está
llena y Leonardo nunca la abrió, se muda todo a Notion y Obsidian queda solo como almacenamiento
interno del Socio. Se evalúa en la retro del viernes de la semana 3.

### Estructura del vault

```
VAKDOR/
├── Inbox.md            ← una línea por cosa. Se vacía en cada sesión.
├── 00 Norte/           ← objetivos, números, plazos. La vara.
├── 10 Bitácora/        ← una nota por día: qué se decidió, hizo y esquivó.
├── 20 Frentes/         ← marketing.md, producto.md, ceo.md, finanzas.md
├── 30 Mercado/         ← informes semanales de investigación
├── 40 Gente/           ← socios, inversores, clientes, contactos
└── 50 Aprendizajes/    ← lo que el consejero enseña + preferencias del Socio
```

Todo enlazado con `[[ ]]` para que el grafo de Obsidian muestre las conexiones reales entre
decisiones, personas y frentes.

## 5. Arquitectura: seis piezas

Cada pieza tiene un trabajo y uno solo.

1. **El norte** — `00 Norte/Norte.md`. Producto de la sesión de fundación. Todo se prioriza
   contra esto.
2. **El recolector** — `.claude/skills/vakdor-socio/scripts/recolectar.mjs`. Script determinista,
   sin IA. Consulta todas las fuentes en paralelo y escribe un parte compacto. No opina.
3. **El Socio** — `.claude/commands/socio.md` + `.claude/skills/vakdor-socio/SKILL.md`. El
   criterio: lee el parte, el norte y la bitácora, y conversa.
4. **La bitácora** — `10 Bitácora/YYYY-MM-DD.md`. La memoria entre días.
5. **Los asesores** — `.claude/skills/socio-marketing/`, `socio-producto/`, `socio-ceo/`,
   `socio-finanzas/`. Se invocan cuando el tema aparece.
6. **El explorador** — `.claude/commands/socio-mercado.md`. Semanal.

**Por qué el recolector va separado del Socio:** si ClickUp se cae, vence un token o se cambia
de herramienta, se toca el recolector y el Socio no se entera. Además hace que cada sesión
arranque en segundos y no queme contexto releyendo APIs.

### El recolector

Corre todas las consultas en paralelo, con timeout individual, y escribe
`.claude/skills/vakdor-socio/estado/YYYY-MM-DD.json` más un resumen legible.

| Fuente | Qué trae |
|---|---|
| ClickUp | Tareas abiertas, vencidas, movidas desde ayer |
| Zoho Mail | Mails no leídos (remitente, asunto, fecha) |
| Gmail | Mails no leídos de la cuenta personal. Se confirma en la fase 1 si aporta o duplica a Zoho; si duplica, se saca. |
| Google Calendar | Eventos de hoy y mañana |
| GitHub | CI fallido, PRs abiertos |
| EasyPanel | Servicios caídos |
| n8n | Ejecuciones fallidas del bot |
| Supabase | Métricas de PRISMA del día |
| Meta Ads | Gasto, CPC, CTR de campañas activas |
| Buffer | Rendimiento de los últimos posts |
| MailerLite | Altas nuevas, estado de la lista |

**Regla de fallo:** si una fuente falla o expira, el recolector escribe el error en el parte y
sigue. Nunca corta la sesión. El Socio menciona qué no pudo ver, en vez de asumir que está vacío.

## 6. La sesión `/socio`

Seis fases, en orden fijo.

**① Recolección** (~30 s, en silencio). Corre el recolector.

**② Vaciar el Inbox.** Lee `Inbox.md` y clasifica cada línea: tarea → ClickUp; idea → el frente
que corresponde; persona → `40 Gente/`; pregunta → la responde o la agenda. Pregunta solo ante
ambigüedad real. **El Inbox queda vacío.**

**③ El parte.** Filtra, no vuelca: de 40 mails, los 3 que importan; lo vencido; lo roto; los
números contra el norte.

**④ El plan — tres cosas.** No quince. Cada una con el porqué atado al norte. Y explícitamente,
**qué no se hace hoy**.

**⑤ La franqueza.** Contra la bitácora de los últimos días: qué se viene pateando, dónde se está
escondiendo, qué se prometió y no se cumplió. **Siempre con el dato al lado** — sin dato, no se
dice.

**⑥ Cierre.** Escribe las tareas en ClickUp y la bitácora del día en Obsidian.

### Rituales semanales

- **Lunes — `/socio-mercado`.** Investiga real estate y proptech en el mundo (prensa, blogs,
  Reddit, redes, competencia), guarda en `30 Mercado/` y entrega el informe con el formato
  "esto pasó → así te afecta → esto haría yo". Con el tiempo aprende qué temas sirven.
- **Viernes — retro.** Muestra la semana contra el norte y **le hace preguntas a Leonardo para
  mejorarse a sí mismo**: qué sirvió, qué fue ruido, dónde se equivocó. Actualiza
  `50 Aprendizajes/preferencias.md`, que el Socio lee al inicio de cada sesión. Es el mecanismo
  concreto detrás del pedido "que me haga preguntas para mejorarse cada día" — semanal, porque un
  día suelto no da señal.

## 6b. Reglas incorporadas el 18/08/2026

Salieron de la primera pasada real sobre las fuentes de Leonardo.

1. **Verificar antes de crear.** Ninguna tarea se carga en ClickUp sin comprobar
   primero, contra el código y contra la base de producción, que no esté ya
   implementada. Un grep positivo no es prueba: hace falta el archivo, la columna o
   las filas reales. Crear una tarea ya hecha destruye la confianza en el sistema.
   Ver `docs/interno/verificacion-compromisos-2026-08-18.md`.
2. **Las notas de reunión son una fuente de primera.** `gemini-notes@google.com` deja
   en Zoho los compromisos de cada Meet. El recolector las lee, extrae las líneas
   asignadas a Leonardo y las pasa por la regla 1.
3. **Aviso el día ANTES de cada reunión.** El Socio mira el calendario y, la víspera,
   ofrece preparar lo que haya que llevar. El mismo día ya no sirve.
4. **La bandeja de enviados cuenta.** Antes de decir que algo no tuvo seguimiento hay
   que mirar enviados, no solo recibidos. Y antes de escribir a alguien, verificar la
   dirección exacta en el hilo: el dominio se parece pero no siempre es el mismo.
5. **El cierre del día (fase ⑦).** A las 17, `/socio cerrar` repasa lo hecho, mueve lo
   que no se hizo sumando el contador de postergaciones, confirma que todo quedó
   anotado y cierra el día explícitamente. El objetivo del Socio no es que Leonardo
   trabaje más: es que pueda dejar de trabajar sin culpa.
6. **"Suficiente" se define antes de empezar.** El plan del día son 3 tareas. Si están
   hechas, el día fue un éxito, aunque queden decenas pendientes.
7. **La franja 8-17 es un contenedor, no una meta.** Se cargan 5 a 6 horas reales de
   trabajo dentro de esa ventana. Fuera de ella no se agenda nada del negocio.

### Estructura de ClickUp (creada el 18/08/2026)

Carpetas `🎯 METAS` (lista Metas, vista Gantt) y `📅 TAREAS` (lista Tareas, vistas
Semana, Por prioridad y Tablero). Nueve campos personalizados: Área, Tipo, A quién
afecta, **Origen**, Meta, Bloque, Energía, Veces postergada y Postergada desde.

**Origen es el campo que da el control**: cada tarea declara de dónde salió (reunión,
sugerencia de un asesor, mail, métrica o idea propia). Lo que aparece en varios lugares
es una tarea con varios orígenes, no varias tareas huérfanas.

## 7. Autonomía

**Regla universal, para toda conexión presente y futura:**

1. **Leer es libre y total.** En cualquier fuente conectada, el Socio lee todo lo que necesite sin
   pedir permiso: correos, tareas, páginas, contactos, métricas, logs, código, campañas.
2. **Escribir, actualizar y borrar requiere OK explícito de Leonardo**, y el Socio debe llegar con
   una sugerencia concreta: qué cambia, en qué registros, por qué, y qué pasa si sale mal.
3. **La sugerencia es obligación, no cortesía.** Si el Socio ve algo que hay que corregir,
   actualizar o borrar, lo dice — no espera que Leonardo lo descubra.
4. **Un OK vale para lo acordado, no para lo parecido.** Aprobar una limpieza no habilita la
   siguiente.

La tabla siguiente es la aplicación de esa regla a los casos frecuentes. El Socio la tiene en su
skill y la respeta sin excepción.

| Hace solo | Pide OK explícito |
|---|---|
| Crear, mover y cerrar tareas en ClickUp | Enviar un mail |
| Escribir en Obsidian (todo) | Publicar o programar un post |
| Dejar **borradores** de mails y de posts | Tocar n8n (el bot de WhatsApp) |
| Investigar, leer, consultar cualquier fuente | Crear, pausar o modificar publicidad |
| Preparar entregables listos para un clic | Escribir en datos de clientes, DNS, migraciones |
| | Borrar contactos en MailerLite |

## 8. Los asesores

Se construyen de a uno. Marketing primero.

### Marketing (fase 2)

No es un consejero: es una **cadena de producción** de punta a punta.

1. **Decide qué comunicar** — leyendo `docs/interno/marketing-handoff.md`, el rendimiento real de
   Buffer, GA4, Clarity y el embudo de vakdor.com.
2. **Lo produce** — invocando las skills que ya existen: `vakdor-copywriter`, `vakdor-carousel`,
   `vakdor-video`, `Vakdor-PDF`, `vakdor-metricas`, `marketing-psychology`, `content-humanizer`.
3. **Lo publica o lo pauta** — vía Buffer (LinkedIn, Instagram) o Meta Ads (anuncios),
   **siempre con OK previo**.
4. **Leads** — MailerLite: altas nuevas, salud de la lista, borradores de campaña.

También arma la lista de a quién responderle en LinkedIn para engagement, que hoy es trabajo
manual y olvidable.

### Producto/operativo, CEO y Finanzas (fase 4)

- **Producto:** GitHub, Supabase, EasyPanel, n8n, Vercel. "Qué se rompió mientras dormías y qué
  vale la pena arreglar hoy."
- **CEO:** sin API. Se alimenta del norte, la bitácora, el informe de mercado y `40 Gente/`.
  Socios, inversores, plan comercial, precios.
- **Finanzas:** tablas `finance_*`, consumo real de OpenAI y Google Cloud, gasto de Meta Ads.

## 9. Fases de construcción

| Fase | Qué incluye | Condición de salida |
|---|---|---|
| **0 — Cimientos** | Login de GitHub; estructura del vault; **sesión de fundación** → `Norte.md` | Existe `Norte.md` con números y plazos |
| **1 — El ritual** | Recolector + `/socio` + Inbox + bitácora + escritura en ClickUp | Leonardo usa `/socio` 5 días seguidos |
| **2 — Marketing** | La cadena completa: decidir → producir → publicar con OK | Una pieza sale al aire desde el Socio |
| **3 — Semanales** | `/socio-mercado` (lunes) + retro (viernes) | Un informe y una retro entregados |
| **4 — Resto** | Producto, Finanzas, CEO | — |
| **Después** | Slack (cuando haya equipo); limpiar Notion; empaquetar como plugin | — |

**La fase 1 es la que importa.** Todo lo demás son mejoras sobre algo que ya se usa a diario. Si
la fase 1 tarda, el proyecto muere como murieron ClickUp, Obsidian y Slack.

## 10. Manejo de errores

- **Fuente caída o token vencido:** se registra en el parte y la sesión sigue. El Socio dice qué
  no pudo ver.
- **Inbox ambiguo:** pregunta una vez; si no hay respuesta clara, lo deja en el Inbox y lo marca.
  Nunca inventa la clasificación.
- **ClickUp rechaza una escritura:** lo dice en el momento; no da la tarea por creada.
- **Sin `Norte.md`:** el Socio se niega a planificar y ofrece hacer la sesión de fundación. No
  prioriza al voleo.
- **Franqueza sin dato:** si no puede citar la fuente (bitácora, métrica, fecha), no lo dice.

## 11. Pruebas y verificación

Cada fase se verifica con datos reales, nunca en teoría.

- **Recolector:** corre completo y devuelve las 11 fuentes; se prueba además con una fuente
  deliberadamente rota (token inválido) para confirmar que no corta la sesión.
- **Inbox:** se cargan 5 líneas de tipos distintos y se verifica en ClickUp y en el vault que
  cada una terminó donde corresponde, y que `Inbox.md` quedó vacío.
- **ClickUp:** se verifica por API que la tarea creada existe, con su nombre, fecha y lista.
- **Bitácora:** existe el archivo del día y la sesión siguiente lo lee (se comprueba pidiéndole
  al Socio que cite algo de ayer).
- **Franqueza:** se comprueba que toda afirmación crítica viene con fecha o número.

## 12. Deuda conocida (fuera de este diseño, anotada para no perderla)

1. **Lista de MailerLite contaminada.** 257 contactos: 102 rebotados (40%), 238 (93%) dados de
   alta el mismo día (28/12/2025), con patrón de correos generados por combinación
   (`nombre.apellido@` repetido en marcas competidoras). Enviar campañas a esa lista arriesga
   quemar el dominio `vakdor.com` y la suspensión de la cuenta. Leads reales captados: 5.
   **Requiere limpieza con OK de Leonardo antes de cualquier campaña.**
2. **Notion desactualizado.** +100 páginas viejas. Candidato a limpieza asistida, comparando
   contra `docs/`.
3. **Conexión duplicada de Zoho** bajo el usuario `pg-test-*` del Playground de Composio. No
   molesta; se borra cuando Leonardo lo autorice.
4. **GitHub CLI sin sesión.** Bloquea el asesor de Producto. Se resuelve en la fase 0.
5. **`.mcp.json` declara un servidor `mailerlite` sin autenticar.** MailerLite se usa por API
   REST con `MAILERLITE_API_KEY`; el servidor MCP quedó sin uso.

## 13. Fuera de alcance

- Cualquier cambio a la app PRISMA o a sus dependencias.
- Slack (hasta que haya equipo).
- Empaquetar el Socio como plugin distribuible.
- Ejecución automática por cron o en la nube: por decisión #1, el Socio corre cuando se lo llama.
- Dictado por voz para el Inbox.
- Migrar el contenido viejo de Notion.
