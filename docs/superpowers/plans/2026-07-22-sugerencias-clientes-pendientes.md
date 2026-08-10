# Plan — Sugerencias pendientes de clientes (bandeja admin-vakdor)

**Fecha:** 22 de julio de 2026
**Origen:** tabla `system_feedback` · 14 registros totales → **11 pendientes**, 2 resueltas, 1 descartada.
**Quién las dejó:** los 6 asesores de MAXRE (Central Real Estate), entre el 21 y el 22 de julio de 2026.
**Estado de este documento:** análisis y plan. **No se ejecutó ningún cambio.**

> Cada ítem tiene: lo que dijo el cliente (textual), la causa real verificada contra código y base,
> la solución mínima que resuelve el problema sin tocar de más, los archivos, el riesgo y cómo se prueba.

---

## Índice por prioridad

| # | Pendiente | Quién | Dónde vive | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| [1](#1) | El bot agenda visitas solo (reincidente) | Carlos G. | n8n | Bajo | Bajo |
| [2](#2) | No llegó el aviso del lead nuevo | Eric Z. | n8n | Bajo | Bajo |
| [3](#3) | El mail de aviso no lleva al chat del lead | Carlos G. | n8n + app | Muy bajo | Muy bajo |
| [4](#4) | Nombre del PDF del ACM | Mónica R. | app | Muy bajo | Nulo |
| [5](#5) | Filtro de período en Dashboard / Tracking | Ailén | app | Bajo | Bajo |
| [6](#6) | PH apareciendo como comparable de casa | Mónica R. | app (ACM) | Medio | **Medio** |
| [7](#7) | Los ACM no se guardan en ningún lado | Diego C. | app (ACM) | Medio | Bajo |
| [8](#8) | La sesión se cae, sobre todo en celular | Carlos G. | app (auth) | ? | **Alto** |
| [9](#9) | Dirección de la propiedad en Leads Tokko | Ailén | **bloqueado** | — | — |
| [10](#10) | Filtros manuales en el Buscador IA | Julia M. | app | Alto | Bajo |
| [11](#11) | Pirámide de valores en el ACM | Julia M. | app | ? | Bajo |

---

<a id="1"></a>
## 1. El bot está agendando visitas solo

### Diagnóstico (lo que dijo el cliente)
> **Carlos Grossi** — tipo: queja — 22/07
> *"Se ha vuelto a producir un arreglo de visita con un cliente!!! Adjunto foto"*

El "**se ha vuelto**" es lo importante: es reincidente, ya lo había reportado antes.

### Evidencia
Adjuntó un collage de 6 capturas del chat. El Asesor IA no solo informa: **negocia, propone y cierra**:

- *"¿Confirmamos la visita del lunes entonces? ¿A qué hora te viene bien?"*
- *"Perfecto, Lin. Ya le aviso a Carolina que llegás hoy a las 17:40 para la visita."*
- *"Hemos quedado para mañana a las 17:30…"*
- *"Le adjudiqué al asesor tu horario lunes antes de las 18:00, preferentemente a las 17:30."*

### Causa real
Está en el **prompt del agente principal de n8n** (workflow `PRISMA`, id `aNowZdPO_xMlGwKRb54ir`), no en PRISMA-SYSTEM. El objetivo declarado del agente es *generar confianza y derivar*, **no cerrar visitas** — pero el prompt no lo prohíbe con la dureza suficiente, y el modelo cae en el comportamiento "servicial" por defecto: si el cliente pide un horario, se lo confirma.

Existe además un workflow `Gestion_Visita` (id `EnwkA8ZPyieCqLEo`, activo) — hay que revisar si el agente lo está invocando para cerrar en vez de solo derivar.

### Solución óptima (la menos invasiva)
**No tocar la arquitectura. Endurecer el prompt y cambiar el guion de salida.**

1. Agregar al prompt del agente principal una **regla dura y literal**, del mismo tenor que las que ya funcionan:
   - Prohibición explícita de: confirmar día u hora, decir "quedamos", "confirmado", "te espero", "ya le aviso al asesor que vas".
   - El bot **junta la disponibilidad** ("¿qué días y en qué franja te queda cómodo?") y **ahí corta**.
   - Frase de cierre fija: *"Le paso tu disponibilidad a [nombre del asesor], que te confirma el horario exacto."*
2. Verificar que ante intención de visita el agente llame a `Avisar_Asesor` (escenario "quiere visitar") y **no** a un flujo que cierre la visita.
3. Agregar 2-3 ejemplos negativos en el prompt (los diálogos reales de las capturas de Carlos son el mejor material posible).

### Riesgo
**Bajo en la app** (no se toca). Medio-bajo en n8n: un prompt más restrictivo puede hacer al bot más seco al final de la conversación. Se mitiga dándole la frase de cierre exacta en vez de solo prohibirle cosas.

### Autorización
**Requiere tu OK explícito** — es escritura en n8n.

### Cómo se prueba
Conversación de prueba en la que el cliente diga "quiero verlo el lunes a las 17". El bot debe pedir disponibilidad, **no** confirmar, y disparar el aviso al asesor. Repetir 3 veces (el modelo es no determinista: una sola prueba no alcanza).

---

<a id="2"></a>
## 2. No llegó el aviso del lead nuevo

### Diagnóstico
> **Eric Zambrana** — tipo: queja — 21/07
> *"No notificó el nuevo leads. Tampoco por mail ni es Tokko. Quisiera tener la oportunidad primero yo de interactuar ante la primer consulta y en caso de que no conteste que entre la asistente a trabajar."*

Son **dos pedidos distintos** y conviene no mezclarlos.

### Evidencia
Su captura muestra la Bandeja WhatsApp con el lead "Juan" (5492914149547), consulta entrada por link de Mercado Libre, **ya asignada a `ezambrana@maxre.com.ar`**, con el Asesor IA respondiendo y mandando la ficha. Es exactamente el escenario "CONSULTA POR LINK" que `Avisar_Asesor` debería notificar. La conversación **sí se derivó** (aparece asignada), pero el mail no llegó.

### Causa real (2a — el aviso que no llegó)
El workflow `Avisar_Asesor` (id `bx5bqyUigVr3Hlvf`, activo) tiene una estructura frágil: **es un agente LLM el que decide llamar a las herramientas**, no un flujo determinista.

```
When Executed by Another Workflow → extraer_agency_id (Code) → AI Agent
                                                                ├─ Enviar_Email_Resend (httpRequestTool)
                                                                └─ DERIVAR_CONVERSACION (postgresTool)
```

El Code node ya deja el email armado (`email_subject`, `html_email`). El agente **solo debería disparar dos herramientas en orden**. Pero:

- Si el LLM decide no llamar a `Enviar_Email_Resend`, no hay email y **nadie se entera**.
- La regla 2 del propio prompt dice que si falta `email_asesor` no se manda el mail pero sí se deriva → **coincide exactamente con lo que vio Eric** (conversación derivada, mail ausente). Sospecha principal: `email_asesor` llegó vacío desde el agente principal.
- No hay ningún registro de fallo: si no se manda, se pierde en silencio.

### Causa real (2b — "quiero contestar yo primero")
No es un bug: **hoy el bot es primera línea por diseño.** No existe ningún mecanismo de espera ni de opt-in por asesor. Es un cambio de política del producto.

### Solución óptima (la menos invasiva)

**Para 2a — que el aviso no se pierda nunca:**
1. Sacar el email de las manos del LLM: convertir `Enviar_Email_Resend` de *tool* a **nodo HTTP fijo en el flujo**, después del agente. Si el dato existe, el mail sale — sin criterio de por medio.
2. En `extraer_agency_id`, si `email_asesor` viene vacío, **resolverlo por SQL** desde `wa_conversations.agent_id → profiles.email` (el nodo `Buscar_agent_id` ya hace algo equivalente para la derivación) en lugar de abortar.
3. Agregar una rama de error que registre el fallo, para que un aviso perdido deje rastro.

**Para 2b — "yo primero":** no construirlo todavía. Es una decisión de producto que cambia la promesa central de PRISMA (respuesta inmediata 24/7). Si se hace, la forma más barata es un **switch por asesor** ("responder yo primero") con una ventana de N minutos: el aviso sale al instante, el bot entra recién si el asesor no contestó. Antes de programarlo, conviene preguntarle a MAXRE si lo quieren todos o solo Eric.

### Riesgo
Bajo. El punto 1 hace el flujo **más** determinista, no menos.

### Autorización
**Requiere tu OK explícito** (escritura en n8n).

### Cómo se prueba
Consulta por link con un número de prueba asignado a un asesor: debe llegar el mail **y** derivarse la conversación. Después repetir forzando `email_asesor` vacío: debe resolverlo por SQL e igual mandarlo.

### ⚠️ Hallazgo lateral de seguridad
La API key de Resend está **escrita en texto plano** dentro del nodo `Enviar_Email_Resend` (`"Authorization": "Bearer re_6P5..."`), en vez de usar una credencial de n8n. Cualquiera con acceso al workflow la ve, y viaja en cada export/backup. No es urgente, pero conviene moverla a credencial cuando se toque el flujo.

---

<a id="3"></a>
## 3. El mail de aviso no lleva al chat del lead

### Diagnóstico
> **Carlos Grossi** — tipo: sugerencia — 22/07
> *"Cuando llega un email, y quiero redirigirlo a la app, en vez de abrir directo, me reenvia a la pagina de inicio para volver a iniciar sesion (la cual ya estaba abierta y en uso)."*

**Tu aclaración:** habla del mail de aviso de lead. Debería llevarlo **al chat de ese lead**; si no se puede, a la pantalla donde estaba; y si realmente no tenía sesión, ahí sí está bien mandarlo a iniciar sesión.

### Causa real — verificada, y es de una línea
El botón del email apunta a **la raíz del sitio**:

```js
// n8n · Avisar_Asesor · nodo extraer_agency_id (última línea del HTML)
<div class='btn-wrap'><a href='https://prisma.vakdor.com' class='button'>${btnText}</a></div>
```

Y en el **mismo Code node**, 60 líneas más arriba, el `conversation_id` ya está extraído y disponible:

```js
const conversationMatch = text.match(/conversation_id:\s*([a-f0-9-]{36})/i);
item.json.extracted_conversation_id = conversationMatch ? conversationMatch[1] : "default_conversation";
```

O sea: **el dato para llevarlo al chat exacto ya lo tenemos, y lo estamos tirando.**

Y hay una segunda causa que explica la parte de "me pide login de nuevo": el middleware, cuando expulsa, **no guarda el destino**:

```ts
// middleware.ts:115
return NextResponse.redirect(new URL('/auth/login', request.url))
```

El formulario de login (`components/auth-login-form.tsx:74-79`) manda siempre al dashboard según el rol. Aunque el usuario se loguee bien, **el destino original ya se perdió**.

### Solución óptima (la menos invasiva) — 3 capas, en este orden

**Capa A — deep link al chat (n8n, 1 línea).**
Ya existe la ruta: `app/asesor/leads-whatsapp/[id]/page.tsx` abre el chat de una conversación puntual, con verificación de que le pertenezca al asesor. El botón pasa a ser:

```js
const destino = v.extracted_conversation_id && v.extracted_conversation_id !== 'default_conversation'
  ? `https://prisma.vakdor.com/asesor/leads-whatsapp/${v.extracted_conversation_id}`
  : 'https://prisma.vakdor.com';
```

Con sesión activa, el asesor cae **directo en la conversación**. Esto solo ya resuelve el 80% de la molestia.

**Capa B — conservar el destino al pedir login (app, ~15 líneas).**
1. `middleware.ts:115` → agregar el destino: `/auth/login?next=<pathname+search>`.
2. `components/auth-login-form.tsx` → leer `next` (ya usa `useSearchParams` para `error`, así que no hay dependencia nueva) y, si existe **y es una ruta interna**, ir ahí en vez del dashboard.

> **Seguridad — no omitir:** validar que `next` empiece con `/` y no con `//` ni `http`. Sin esa validación se abre un *open redirect* (un mail malicioso podría mandar a un login falso). Es la única parte delicada de todo este punto.

**Capa C — no tocar nada más.** Si el asesor efectivamente no tenía sesión, mandarlo a login es correcto. Con las capas A y B, después de loguearse cae igual en el chat del lead.

### Riesgo
Muy bajo. La capa B toca middleware, pero solo agrega un parámetro a un redirect que ya existía. Nada cambia para quien tiene sesión.

### Cómo se prueba
1. Con sesión abierta: clic en el botón del mail → tiene que abrir el chat de ese lead.
2. Sin sesión (ventana de incógnito): mismo clic → login → después del login, cae en el chat.
3. Intento de open redirect: `/auth/login?next=https://google.com` → debe ignorarlo e ir al dashboard.

---

<a id="4"></a>
## 4. Nombre del PDF del ACM

### Diagnóstico
> **Mónica R.** — 21/07
> *"Cuando descargamos un archivo generado como ACM en Prisma, que el nombre esté compuesto por ACM + Calle y N° + Mes y Año."*

### Causa real
```tsx
// app/asesor/acm/components/step4-resultado.tsx:76-77
const handlePrint = () => {
  window.print();
};
```
El nombre del PDF lo decide el navegador a partir del `document.title`, que hoy es el título fijo de la página. Por eso todos los ACM se descargan con el mismo nombre y se pisan en la carpeta de descargas.

### Solución óptima (la menos invasiva)
Cambiar el título justo antes de imprimir y restaurarlo después. Sin librerías, sin generador de PDF nuevo:

```tsx
const handlePrint = () => {
  const anterior = document.title;
  document.title = nombreArchivoAcm(sujeto); // "ACM - Arcos 2825 - Julio 2026"
  window.print();
  setTimeout(() => { document.title = anterior; }, 1000);
};
```

Detalles a cuidar:
- Sanear la dirección: sacar `/ \ : * ? " < > |` que Windows no acepta en nombres de archivo.
- Fallback si no hay dirección cargada: `ACM - Julio 2026`.
- Restaurar con `setTimeout` (o el evento `afterprint`), porque `window.print()` es bloqueante y el diálogo lee el título en ese momento.

### Riesgo
**Nulo.** No toca datos, ni cálculo, ni el render del informe.

### Cómo se prueba
Generar un ACM de Arcos 2825, "Imprimir / PDF", y verificar que el nombre propuesto sea `ACM - Arcos 2825 - Julio 2026`. Probar también sin dirección.

---

<a id="5"></a>
## 5. Filtro de período en Dashboard y Tracking Performance

### Diagnóstico
> **Ailén** — 22/07
> *"Ver si se puede agregar un filtro de periodo en el Dashboard para poder visualizar rendimiento de, por ejemplo, ultima semana, ultimo mes, etc. Y tambien en el tracking Performance."*

### Causa real
**No falta el motor, falta el control.** La función ya acepta el rango:

```ts
// lib/queries/dashboard.ts:3
export async function getDashboardData(agencyId: string, agentId?: string, startDate?: string, endDate?: string)
```

y lo aplica tanto a WhatsApp (líneas 12-13) como a `performance_logs` (líneas 37-38). Pero la página nunca se lo pasa:

```tsx
// app/asesor/dashboard/page.tsx:36-40
getDashboardData(profile.agency_id, user.id),   // ← sin fechas
getDashboardData(profile.agency_id),            // ← sin fechas
```

### Solución óptima (la menos invasiva)
1. Selector de período arriba del dashboard: **Últimos 7 días · Últimos 30 · Este año · Todo** (default: **Todo**, así nadie ve números distintos de un día para el otro sin haber pedido nada).
2. Pasar el rango por `searchParams` (`?periodo=30d`) — la página ya es un Server Component, así que no hace falta estado de cliente ni refactor.
3. Pasar `startDate`/`endDate` a `getDashboardData`.
4. Replicar en Tracking Performance.

**Decisiones que hay que tomar antes de programar (te las dejo señaladas):**
- **El leaderboard**: ¿se filtra también? Yo lo filtraría, para que sea coherente con el resto de lo que se ve en pantalla.
- **Los objetivos anuales** (`getObjectivesDashboard(agencyId, currentYear)`): **no** deberían filtrarse. Un objetivo anual comparado contra "últimos 7 días" muestra un 3% de cumplimiento y parece una catástrofe. Los dejaría siempre en el año completo, con la etiqueta "Año 2026" bien visible.

### Riesgo
Bajo. El default "Todo" hace que, si nadie toca el filtro, se vea exactamente lo mismo que hoy.

### Cómo se prueba
Comparar "Todo" contra los números actuales (deben ser idénticos). Después "Últimos 7 días" y validar contra un conteo directo en `performance_logs` por `fecha_actividad`.

---

<a id="6"></a>
## 6. PH apareciendo como comparable de una casa

### Diagnóstico
> **Mónica R.** — 21/07
> *"Realizando un ACM de una casa, me propone opciones comparables que son PH mayoritariamente, mi sugerencia es que me permita filtrar si el ph es una opción o no."*

### Causa real — y es más profunda que lo que ella describe
Los PH **no vienen de la cartera propia, vienen de la red de colaboración (roomix)**, donde las publicaciones usan tipos de schema.org en inglés que no distinguen PH. Verificado en la base:

Distribución real de `roomix_properties.property_type`: `Apartment` 631 · `Accommodation` 209 · `House` 160.

Y así se ven los PH ahí adentro:

| `property_type` | Título real |
|---|---|
| `House` | VENTA **PH** 4 AMBIENTES EN PALERMO CON TERRAZA |
| `House` | **PH** 2 ambientes con cochera |
| `House` | **PH** - Palermo Soho |
| `House` | **PH** de 3 ambientes planta baja con patio… |
| `Apartment` | Depto estilo **PH** de 3 ambientes… |

El ACM traduce el tipo del sujeto así:

```ts
// lib/acm/subject.ts:64-71
const ROOMIX_TYPE = {
  casa: ["%house%", "%singlefamily%"],   // ← acá entran TODOS los PH
  ph:   ["%apartment%", "%house%", "%accommodation%"],
}
```

Es decir: **cuando el sujeto es una casa, el filtro de tipo arrastra todos los PH de la red.** No es que el ranking los prefiera; es que el filtro duro nunca los excluyó.

**Segundo hallazgo, que nadie reportó todavía:** en la cartera propia de MAXRE **no existe el tipo PH**. Distribución real de `properties.property_type`: Departamento 401, Casa 97, Lote 51, Condo 25, Bussiness Premises 16, Oficina 11, Garage 5, Hotel 3, Weekend House 3, Commercial Building 1, Warehouse 1. Y el patrón configurado es `ph: ["%ph%"]`, que **no matchea con ninguno de esos valores**. Conclusión: **si un asesor tasa un PH, hoy obtiene cero comparables de cartera propia** y solo ve los de la red. Nadie lo reportó porque probablemente lo leyeron como "no hay parecidos".

### Solución óptima (la menos invasiva)
**Corregirlo en el origen, no agregar un filtro que el asesor tenga que acordarse de tildar.** Un asesor no debería tener que pedir que no le mezclen PH con casas.

1. **Detectar PH por título** en las funciones SQL `acm_match_roomix` / `acm_match_properties`: un regex acotado sobre `title` (`\mph\M`, `p\.h\.`), que no confunda con palabras que contienen "ph" adentro.
2. **Casa ≠ PH:** si el sujeto es casa, excluir del universo lo detectado como PH. Si el sujeto es PH, **exigirlo** (esto además arregla el segundo hallazgo: un PH pasaría a encontrar comparables reales dentro de `House`/`Apartment`).
3. **Marca visible:** los comparables detectados como PH muestran el chip "PH" en la ficha, para que el asesor vea por qué entró o no.
4. **Recién entonces**, si Mónica lo sigue queriendo, agregar el switch "incluir PH" — pero apagado por defecto y solo para casas.

### Riesgo
**Medio — el más alto de los cambios de app en esta lista.** Toca el matching, que es el corazón del ACM, y **cambia resultados de tasaciones que los asesores ya vieron**. Un ACM que hoy da X pasaría a dar Y.

Mitigaciones obligatorias:
- Rama aparte, sin mergear hasta comparar.
- Correr 8-10 casos reales (casas y PH) **antes y después**, y mirar los dos listados lado a lado.
- Validar con Mónica el caso concreto que ella reportó antes de mergear.
- El regex es lo único que puede fallar feo: si es muy amplio, saca casas que no son PH. Probarlo contra los 1.000 títulos de `roomix_properties` y revisar los falsos positivos **a mano**.

### Cómo se prueba
ACM de una casa: cero PH en el resultado, y el resto de comparables igual que antes. ACM de un PH: ahora aparecen comparables (hoy da vacío en cartera propia).

---

<a id="7"></a>
## 7. Los ACM no se guardan en ningún lado

### Diagnóstico
> **Diego Capozzo** — tipo: otro — 21/07
> *"Generé un ACM en la mañana y no encuentro donde quedó guardado. Arcos 2825. A su vez creé el contacto que es la dueña y no entiendo como vincularla con ese ACM. Se trata de una posible captación, en que categoría se etiqueta?"*

### Causa real
**No es que no lo encuentre: no se guarda.** No existe ninguna tabla de ACM en el sistema. Lo único que se persiste es `shared_acm_reports` (migración `20260703120000_shared_acm_reports.sql`), y **solo** cuando el asesor genera el link público para el cliente. Si Diego cerró la pestaña sin compartir, el ACM se perdió — y con él una hora de trabajo.

Sus otras dos preguntas tampoco tienen respuesta en el sistema hoy: no hay forma de vincular un ACM a un contacto, ni una categoría "captación" para etiquetarlo.

### Solución óptima (la menos invasiva) — por etapas, y la etapa 1 ya resuelve el dolor

**Etapa 1 — Guardar y listar (esto es lo urgente).**
- Tabla `acm_reports`: `id, agency_id, agent_id, sujeto (jsonb), comparables (jsonb), operacion, created_at, updated_at`. Un snapshot, igual que `shared_acm_reports` — así el ACM guardado no cambia si después cambia la cartera.
- Guardado **automático** al llegar al paso 4 (el asesor no debería tener que acordarse de apretar "guardar"; ese es justo el error que ya pasó).
- Pantalla "Mis ACM" en `/asesor/acm`, ordenada por fecha, con la dirección visible.
- RLS igual que el resto: cada asesor ve los suyos, el director los de la agencia.

**Etapa 2 — Vincular al contacto.** Campo opcional `contact_id` en `acm_reports` + selector en el paso 4. Simple una vez que existe la tabla.

**Etapa 3 — La categoría "captación".** Esto **no lo decido yo**: hay que definir con MAXRE si "captación" es una etapa del pipeline, una etiqueta del contacto, o un tipo de ACM. Preguntarles antes de programar.

### Riesgo
Bajo: es agregar, no modificar. Nada de lo que existe hoy cambia de comportamiento.

### Cómo se prueba
Generar un ACM, cerrar el navegador, volver a entrar: tiene que estar en "Mis ACM" con la dirección correcta y abrir igual que cuando se generó.

---

<a id="8"></a>
## 8. La sesión se cae, sobre todo en el celular

### Diagnóstico
> **Carlos Grossi** — 21/07
> *"Seria muy util que la sesion permaneciera iniciada durante un periodo prolongado, en lugar de cerrarse cada vez que se sale de la misma, o se cambia de pantalla (especialmente en el celular)… Se podria poner una alternativa para que el usuario elija mantener la sesion iniciada por X tiempo en dispositivos de confianza."*

### Causa real — hipótesis fundada, **no confirmada**
Voy a ser honesto acá porque es el punto donde más caro sale equivocarse.

Lo que **sí** verifiqué:
- El middleware corre en prácticamente **todas** las peticiones: `matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']` (`middleware.ts:126-129`). No excluye rutas de API ni archivos.
- En **cada una** de esas peticiones llama a `supabase.auth.getUser()` (`middleware.ts:105`), que valida el token y puede dispararle una renovación.

Lo que **sospecho** (y no puedo confirmar desde el código): al abrirse muchas peticiones en paralelo, varias intentan renovar el token al mismo tiempo. Supabase **rota** el refresh token en cada uso, así que si dos renovaciones se pisan, la segunda llega con un token ya consumido y la sesión se cae. Esto pega más fuerte en el celular, donde el navegador suspende y despierta pestañas — que es exactamente lo que describe Carlos.

Lo que **no** puedo ver desde acá: la duración configurada del JWT y del refresh token vive en el panel de Supabase, no en el repositorio.

### Solución óptima (la menos invasiva) — investigar primero, tocar después
**No arrancaría escribiendo código.** El orden que propongo:

1. **Mirar la configuración de Supabase** (Auth → Sessions): duración del JWT, si hay timebox de sesión, si hay expiración por inactividad. Puede ser que esté simplemente mal configurado y no haya nada que programar. Es lo primero y es gratis.
2. **Reproducirlo con Carlos** o en un celular real: cuánto tarda en caerse, si es al cambiar de pestaña o al volver después de un rato.
3. **Recién ahí**, y solo si se confirma la hipótesis: acotar el `matcher` para que el middleware no corra en rutas donde no hace falta. Es el cambio más chico que ataca la causa, y de paso hace la app más rápida.
4. **Lo de "dispositivos de confianza" lo dejaría para el final.** Es la parte más vistosa del pedido pero la más riesgosa: sesiones largas en un celular compartido son un problema de seguridad real para una inmobiliaria. Y si la causa es la carrera de renovación, alargar la sesión **no arregla nada**.

### Riesgo
**Alto — el más alto de la lista.** Un error en autenticación no afecta a un asesor: deja afuera a todos, al mismo tiempo, incluido el director. Cualquier cambio acá va en rama, se prueba en local con varias pestañas y en celular real, y se mergea con tu OK expreso.

### Cómo se prueba
Sesión abierta en celular, cambiar de app 10 veces, volver después de 30 min y después de 2 h. Y en escritorio con 3 pestañas abiertas navegando en paralelo (el escenario que dispara la carrera).

---

<a id="9"></a>
## 9. Dirección de la propiedad consultada en Leads Tokko — **BLOQUEADO**

### Diagnóstico
> **Ailén** — 22/07
> *"Agregar en la solapa de Leads Tokko, el detalle o dirección de la propiedad consultada"*

Es un pedido razonable: sin saber por qué propiedad preguntó el lead, el asesor arranca la conversación a ciegas.

### Causa real — no es un cambio de UI, **el dato no existe**
Tres verificaciones, en orden:

**1. Las columnas existen y están vacías.** La tabla `leads` tiene `tokko_property_id`, `tokko_property_title`, `tokko_property_address`, `tokko_property_type`, `tokko_property_price`, `tokko_search_data`. Conteo real sobre **7.979 leads**:

| Columna | Con dato |
|---|---|
| `tokko_property_address` | **0** |
| `tokko_property_title` | **0** |
| `tokko_property_id` | **0** |
| `tokko_search_data` | **0** |

**2. Nada las escribe.** `mapTokkoContact()` (`lib/tokko-sync.ts:262-324`) no mapea ningún campo de propiedad. Las únicas dos referencias en todo el repo a `tokko_property_address` son **lecturas**, en las páginas de detalle del lead. O sea: esas pantallas ya tienen el espacio hecho, mostrando vacío desde siempre.

**3. Y la API de Tokko no lo da.** Probé contra la API real con la key de producción:

| Endpoint | Resultado |
|---|---|
| `GET /contact/?limit=1` | **200** — 21 campos, **ninguno de propiedad** (`agent, birthdate, cellphone, created_at, deleted_at, document_number, email, id, is_company, is_owner, lead_status, name, opportunity_status, other_email, other_phone, phone, related_to_companies, tags, work_email, work_name, work_position`) |
| `GET /contact/65815448/` | **200** — el detalle trae **exactamente los mismos 21 campos** |
| `GET /webcontact/` | **405** — no acepta lectura (es solo para enviar consultas) |
| `GET /inquiry/` | **404** |
| `GET /opportunity/` | **404** |
| `GET /search/` | **404** |

**Conclusión: no se puede resolver desde Tokko.** No es cuestión de esfuerzo: el dato no está disponible por API.

### Solución óptima — lo que sí se puede hacer
Tres caminos posibles, ordenados por cuánto dan a cambio de cuánto cuestan:

**A — Mostrar lo que sí tenemos (barato, ayuda de verdad).**
Los tags de Tokko traen bastante contexto útil. Un lead real de la base:
```
tags: ["Mercadolibre", "La Plata", "Alquiler", "Contacto por Whatsapp", "PH"]
```
Eso es origen, zona, operación y tipo. No es la dirección, pero saca al asesor de la ceguera total. Se puede mostrar como chips en la solapa de Leads Tokko sin tocar el sync. **Esto lo haría ya.**

**B — Cruzar con WhatsApp (medio, y es el dato bueno).**
Cuando el lead entra por WhatsApp, **PRISMA sí sabe** por qué propiedad preguntó: el bot le pasó la ficha, y queda en la conversación. Cruzando por teléfono entre `leads` y `wa_conversations` se puede mostrar la propiedad real. Cubre solo los leads de WhatsApp, pero ahí el dato es exacto.

**C — Parsear el mail del portal (alto, frágil).** Los mails de ZonaProp/ML sí traen la propiedad. Requiere ingesta de correo y parsers que se rompen cada vez que el portal cambia el formato. **No lo recomiendo.**

### Qué le respondería a Ailén
Que el pedido es correcto pero que Tokko no expone ese dato por API — con la evidencia, sin vueltas. Y ofrecerle A ahora mismo y B como paso siguiente. Es mejor que quede pendiente con una explicación real que "no se puede".

---

<a id="10"></a>
## 10. Filtros manuales en el Buscador IA

### Diagnóstico
> **Julia M.** — 21/07
> *"Estaría bueno que cuando hacemos búsquedas por el buscador IA, me deje acceder a un mampara y poder buscar por ahi, tal cual como se hace en zonaprop"*

("mampara" = una pantalla/panel de filtros.)

### Causa real
No hay causa: es una funcionalidad que no existe. El buscador es conversacional por diseño.

### Lectura honesta
Vale la pena, pero **no es urgente y hay una tensión de fondo**: PRISMA apostó al buscador conversacional justamente para no ser un ZonaProp más. Que una asesora pida filtros clásicos puede significar dos cosas muy distintas:
- que quiera las dos formas (legítimo, y frecuente), **o**
- que el buscador conversacional no le esté dando buenos resultados y esté buscando la salida que conoce.

**Si es lo segundo, construir filtros tapa el problema en vez de resolverlo.** Hubo ya un ajuste al retrieval del buscador por un tema parecido.

### Solución óptima
1. **Hablar con Julia primero.** Diez minutos: ¿qué buscaste que no encontraste? Barato, y decide todo lo demás.
2. Si el retrieval está fallando → arreglar eso, que es más importante.
3. Si de verdad quiere las dos formas → panel de filtros lateral (zona, tipo, operación, ambientes, precio) que **complemente** al chat, aplicándose sobre los mismos resultados. Nunca reemplazarlo.

### Riesgo
Bajo técnicamente. El riesgo real es **de producto**: construir la cosa equivocada durante dos semanas.

---

<a id="11"></a>
## 11. Pirámide de valores en el ACM

### Diagnóstico
> **Julia M.** — 21/07
> *"Estaria bueno en los ACM, agregar la pirámide de valores que usualmente agregamos"*

### Causa real
No existe en el informe. El "que usualmente agregamos" indica que **ya la usan a mano**, con un formato propio.

### Solución óptima
**Bloqueado hasta ver un ejemplo de ellos.** Sin el modelo real que usan, cualquier cosa que programemos es adivinar — y una pirámide de valores mal armada en un informe que va al cliente propietario es peor que no tenerla.

Lo que necesito para poder planificarlo:
1. Un ACM de ellos con la pirámide puesta (una foto o un PDF alcanza).
2. Saber si los rangos salen de los comparables (calculable) o del criterio del asesor (input manual).
3. Si va en el informe interno, en la ficha pública para el cliente, o en los dos.

Con eso vuelvo con un plan concreto. Una vez definida, la parte técnica no es difícil: el paso 4 del ACM ya tiene todos los datos de precio y $/m².

---

## Orden de ejecución que propongo

**Tanda 1 — n8n (necesita tu OK).** Ítems 1, 2a y 3-capa-A.
Los tres son de bajo esfuerzo, atacan las dos quejas (no sugerencias) de la lista, y el ítem 3 es literalmente una línea. Máximo retorno inmediato.

**Tanda 2 — app, sin riesgo.** Ítems 4, 5 y 3-capa-B.
Una sola rama, un solo ciclo de prueba. Nada de esto puede romper algo existente.

**Tanda 3 — app, con cuidado.** Ítem 6 (PH) en rama, con comparación antes/después y validación de Mónica.

**Tanda 4 — funcionalidad nueva.** Ítem 7 (guardar ACM), que es el pendiente de mayor valor real para el asesor.

**Aparte, sin fecha:** ítem 8 (investigar antes de tocar), ítem 9 (responder a Ailén con la verdad y ofrecer la opción A), ítems 10 y 11 (hablar con Julia antes de programar).

**Para todos:** rama desde `main` actualizado, prueba en local, actualización de los 4 documentos afectados (LOGICA / TECNICO / FUNCIONAL-ASESOR / FUNCIONAL-DIRECTOR) y merge solo con tu OK.

---

## Cerrar el círculo con los clientes

Aparte del código: las 11 están en `estado = 'pendiente'` y **ninguna tiene respuesta**. Los asesores que se tomaron el trabajo de escribir no saben si alguien las leyó.

La bandeja ya tiene todo para hacerlo (campos `estado` y `respuesta`, y la pantalla `/admin-vakdor/sugerencias/[id]`). Aunque no se programe nada todavía, marcar cada una y contestar dos líneas — sobre todo la de Ailén, que no tiene solución, y la de Diego, que perdió un ACM — vale más para la relación que cualquiera de estos arreglos.

---
---

# ANEXO — Para las sesiones que ejecuten estas tareas

> Este anexo existe porque las tareas se reparten entre varias sesiones que **no comparten contexto**.
> Todo lo de acá ya está verificado: **no hace falta volver a investigarlo.**

## A. Reglas de trabajo (no negociables)

1. **Rama desde `main` actualizado**, siempre. Nunca desde otra rama de feature.
2. **Una carpeta (worktree) por terminal.** Dos sesiones en la misma carpeta se pisan los archivos.
3. **Nunca `git add -A`.** Al 22/07 hay trabajo sin commitear que no es de estas tareas (la skill `vakdor-video`, archivos sueltos en `scratch/`). Commitear **solo** los archivos propios de la tarea, nombrados uno por uno.
4. **n8n: leer es libre, escribir necesita OK explícito de Leonardo**, antes de tocar. Sin excepción.
5. Al terminar, actualizar los 4 documentos afectados: `LOGICA-PRISMA.md`, `TECNICO-PRISMA.md`, `FUNCIONAL-ASESOR-PRISMA.md`, `FUNCIONAL-DIRECTOR-PRISMA.md`.
6. **Merge a `main` solo con OK de Leonardo.**
7. Verificar antes de afirmar: correr la prueba y mostrar la salida. Nada de "debería funcionar".

## B. Mapa de colisiones — qué NO puede ir en paralelo

**⚠️ Lo más importante de este anexo.** Estos ítems tocan el mismo archivo o el mismo nodo:

| Colisión | Ítems | Cómo resolverlo |
|---|---|---|
| `middleware.ts` | **3-capa-B** (guardar destino) y **8** (acotar el matcher) | **Misma sesión, o el 8 después de mergeado el 3B.** Nunca en paralelo. |
| n8n · nodo `extraer_agency_id` de `Avisar_Asesor` | **2a** (email determinista) y **3-capa-A** (link al chat) | **Obligatoriamente la misma sesión.** Es el mismo nodo de código; dos ediciones concurrentes en n8n **se pisan sin avisar** (no hay merge, gana el último que guarda). |
| `app/asesor/acm/components/step4-resultado.tsx` | **4** (nombre del PDF) y **7** (guardar ACM) | El 4 es de 10 líneas: **hacerlo y mergearlo primero**, después arrancar el 7. |

**Sí pueden ir en paralelo, sin riesgo de pisarse:**
- **Ítem 1** (prompt del workflow `PRISMA`) — workflow distinto de `Avisar_Asesor`.
- **Ítem 5** (dashboard) — toca `app/asesor/dashboard/` y `lib/queries/dashboard.ts`, que nadie más toca.
- **Ítem 6** (PH) — toca `lib/acm/subject.ts` y funciones SQL; no toca `step4-resultado.tsx`.

## C. Cómo llegar a los datos (recetas exactas, ya probadas)

Las tres fuentes se leen con las credenciales del `.env` de `PRISMA-SYSTEM`. Base común:

```js
import fs from 'fs'
const env = {}
for (const l of fs.readFileSync('<ruta>/PRISMA-SYSTEM/.env','utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,'')
}
```

**Supabase (base de PRISMA) — REST con service role:**
```js
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const q = async p => (await fetch(`${U}/rest/v1/${p}`, {
  headers: { apikey: K, Authorization: `Bearer ${K}` }
})).json()
await q('system_feedback?select=*&order=created_at.desc')
```
Para contar sin traer filas: agregar el header `Prefer: 'count=exact'` y leer `content-range` de la respuesta.

**Tokko:**
```js
const r = await fetch(`${env.TOKKO_API_BASE_URL}/contact/?limit=1&key=${env.TOKKO_API_KEY}&format=json`)
```

**n8n (lectura de workflows):**
```js
const r = await fetch('https://vn8nv.vakdor.com/api/v1/workflows/<id>', {
  headers: { 'X-N8N-API-KEY': env.N8N_API_KEY }
})
```

**IDs de workflows relevantes:**

| Workflow | ID | Estado | Ítems |
|---|---|---|---|
| `PRISMA` (agente principal) | `aNowZdPO_xMlGwKRb54ir` | activo | 1 |
| `Avisar_Asesor` | `bx5bqyUigVr3Hlvf` | activo | 2a, 3A |
| `Gestion_Visita` | `EnwkA8ZPyieCqLEo` | activo | 1 (revisar) |
| `Gestion_Handoff` | `Xy0tpQWNwj5dVXSw` | activo | referencia |

## D. IDs de las sugerencias — para cerrar el círculo al terminar

Tabla `system_feedback`. Al completar un ítem, actualizar `estado` y escribir la `respuesta` desde `/admin-vakdor/sugerencias/[id]`:

| Ítem | `id` | Quién |
|---|---|---|
| 1 · Bot agenda visitas | `e1398ed1-698a-4037-b319-34207acf5830` | cgrossi@maxre.com.ar |
| 2 · Aviso de lead nuevo | `124aa414-4159-4341-8b25-0f50ca23dc72` | ezambrana@maxre.com.ar |
| 3 · Link del email | `00c3cd8a-18f8-4d2e-8ce5-fe6ad877be6d` | cgrossi@maxre.com.ar |
| 4 · Nombre del PDF | `4b971940-4ce3-43c3-ba35-71e6ac6aa52e` | monicar@maxre.com.ar |
| 5 · Filtro de período | `3c622b2e-e5e7-4f2a-9f90-3d836dad38bc` | ailen@maxre.com.ar |
| 6 · PH en comparables | `cb38e9de-39d3-4373-9b71-e62ec91eb096` | monicar@maxre.com.ar |
| 7 · Guardar ACM | `58149f32-284b-4a03-9904-4d3aa4fa8c0f` | dcapozzo@maxre.com.ar |
| 8 · Sesión que se cae | `32477d21-9032-4601-b22f-51ee517f98a5` | cgrossi@maxre.com.ar |
| 9 · Dirección en Leads Tokko | `cc297cfc-48ff-4140-b534-4de773cd7f24` | ailen@maxre.com.ar |
| 10 · Filtros en Buscador IA | `d7e7493c-fbbb-4c84-b380-9164f990a3df` | juliam@maxre.com.ar |
| 11 · Pirámide de valores | `d13adc78-2bef-48c3-8581-a7001bdfc542` | juliam@maxre.com.ar |

Los adjuntos de los asesores están en el bucket `feedback-evidence` (públicos), en `evidence_urls`. Los de los ítems 1 y 2 son los más útiles: muestran el problema exacto.

## E. Ya verificado — no volver a investigar

Todo esto se comprobó el 22/07 contra código, base y APIs de producción. Repetirlo es gastar tokens al pedo:

- **Tokko no expone la propiedad consultada por el lead.** `/contact/` y `/contact/{id}/` devuelven los mismos 21 campos, ninguno de propiedad; `/webcontact/` da 405; `/inquiry/`, `/opportunity/`, `/search/` dan 404. **Ítem 9 está bloqueado por esto, no por esfuerzo.**
- **0 de 7.979 leads** tienen `tokko_property_address`, `_title`, `_id` o `tokko_search_data`. `mapTokkoContact()` (`lib/tokko-sync.ts:262`) nunca las escribió.
- **`getDashboardData()` ya acepta `startDate`/`endDate`** (`lib/queries/dashboard.ts:3`, aplicados en líneas 12-13 y 37-38). El ítem 5 es cablear la UI, no escribir queries.
- **Los PH de roomix están tipados como `House`** (160 de 1.000). Por eso `casa: ["%house%"]` los arrastra. Ver la tabla de ejemplos en el ítem 6.
- **En la cartera propia no existe el tipo PH.** Los tipos reales son: Departamento 401, Casa 97, Lote 51, Condo 25, Bussiness Premises 16, Oficina 11, Garage 5, Hotel 3, Weekend House 3, Commercial Building 1, Warehouse 1.
- **No existe tabla de ACM.** La única es `shared_acm_reports`, y solo se escribe al generar el link público.
- **El botón del email de aviso apunta a `https://prisma.vakdor.com`** (raíz), y el `conversation_id` ya está extraído en el mismo nodo, sin usar.
- **Ya existe `app/asesor/leads-whatsapp/[id]/page.tsx`**, que abre el chat de una conversación y valida que le pertenezca al asesor. El ítem 3A **no tiene que construir una ruta nueva**.
- **`components/auth-login-form.tsx` ya usa `useSearchParams`** (línea 19, para `error`). El ítem 3B no agrega dependencias.

## F. Advertencias específicas por ítem

- **Ítem 3B — validar `next`.** Si no se valida que empiece con `/` y no con `//` ni `http`, se abre un *open redirect*: un mail malicioso podría mandar al asesor a un login falso. Es el único punto de seguridad real de toda la tanda.
- **Ítem 6 — no mergear sin comparar.** Cambia resultados de tasaciones que los asesores ya vieron. Correr 8-10 casos reales antes/después, revisar los falsos positivos del regex de PH **a mano** sobre los títulos de `roomix_properties`, y validar con Mónica su caso concreto.
- **Ítem 1 — probar 3 veces, no una.** El modelo es no determinista: que no agende una vez no prueba nada.
- **Ítem 8 — mirar la configuración de Supabase antes de escribir código.** La duración de sesión no está en el repositorio. Puede que no haya nada que programar. Y ojo: si la causa es la carrera de renovación de token, **alargar la sesión no arregla nada**.
- **Ítems 10 y 11 — no programar todavía.** El 10 necesita hablar con Julia (puede ser un problema de retrieval disfrazado de pedido de filtros); el 11 necesita ver la pirámide que ellos usan hoy.
- **n8n — la API key de Resend está hardcodeada** en el nodo `Enviar_Email_Resend`. Quien toque ese workflow, moverla a credencial de n8n.

## G. Lo que este plan da por decidido (y no lo está)

Tres cosas quedaron marcadas como decisión de Leonardo, no del ejecutor. **Si aparecen en el camino, preguntar — no resolver por criterio propio:**

1. **Ítem 2b — "el asesor contesta primero".** Cambia la promesa central de PRISMA (respuesta inmediata 24/7). No implementarlo dentro del ítem 2a.
2. **Ítem 5 — los objetivos anuales no se filtran por período.** Un objetivo anual contra "últimos 7 días" da 3% y parece una catástrofe. Si alguien quiere cambiarlo, que lo consulte.
3. **Ítem 7 etapa 3 — qué es "captación".** ¿Etapa del pipeline, etiqueta del contacto, o tipo de ACM? Lo define MAXRE, no nosotros.

---

## H. Cómo arranca cada sesión

### La orden para pegarle a la sesión

```
Leé docs/superpowers/plans/2026-07-22-sugerencias-clientes-pendientes.md
y ejecutá el ÍTEM <N>.

Leé el Anexo completo (secciones A a H) antes de tocar nada:
tiene las reglas de trabajo, las colisiones con otras sesiones,
y todo lo que ya está verificado (no lo re-investigues).

Trabajás en una carpeta propia. Rama: fix/<slug-del-item>
Cuando termines, PARÁ y mostrame el diff. No mergees ni pushees.
```

Repo: `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\PRISMA-SYSTEM`
Para probar en local, la sesión levanta `npm run dev` ella misma y entrega el link listo.

### Qué SÍ hace cada sesión

1. **Crea su rama, desde `main` actualizado.** Nombre sugerido por ítem:
   `fix/aviso-lead-y-link-chat` (2a+3A) · `fix/bot-no-agenda-visitas` (1) · `fix/nombre-pdf-acm` (4) · `fix/login-vuelve-al-destino` (3B) · `feat/dashboard-filtro-periodo` (5) · `fix/acm-ph-comparables` (6) · `feat/acm-guardar-informes` (7)
2. **Commitea en su rama**, nombrando los archivos uno por uno. **Nunca `git add -A`** (hay trabajo ajeno sin commitear en el repo).
3. **Prueba en local** y muestra la salida real de la prueba.
4. **Para ahí y reporta.**

### Qué NO hace ninguna sesión

- **No mergea a `main`.** Con 5 ramas vivas, cinco merges autónomos es la forma más rápida de romper `main`. El merge va de a uno, en orden, con OK de Leonardo.
- **No pushea.** Leonardo avisa cuándo se pushea.
- **No toca n8n sin OK explícito**, aunque el plan diga qué cambiar. Leer es libre; escribir no.
- **No arregla de paso otra cosa que ve rota.** Si encuentra algo, lo reporta y sigue con lo suyo. Si no, terminamos con 5 ramas que se pisan por fuera de lo planificado.

### ⚠️ Los 4 documentos: el conflicto que sí o sí va a pasar

Todas las tareas terminan actualizando los mismos 4 archivos (`LOGICA-PRISMA.md`, `TECNICO-PRISMA.md`, `FUNCIONAL-ASESOR-PRISMA.md`, `FUNCIONAL-DIRECTOR-PRISMA.md`). Con varias ramas en paralelo, **eso choca en el merge**.

Dos formas de manejarlo — elegir una **antes** de repartir, no después:

- **Opción 1 (recomendada con 3 o más sesiones en paralelo):** cada sesión **no** toca los 4 documentos. Deja lo que habría escrito en un archivo propio, `docs/interno/pendientes-doc/item-<N>.md`, con la sección exacta donde va. Al final, **una sola pasada** los consolida. Cero conflictos.
- **Opción 2 (sirve con 1 o 2 sesiones):** cada una edita los 4 documentos en su rama, y el que mergea segundo resuelve el conflicto a mano. En Markdown es fácil de resolver, pero **hay que saber que va a pasar**.

### Las sesiones de n8n entregan otra cosa

Los ítems **1, 2a y 3A viven en n8n, no en el repositorio.** Esas sesiones no tienen código que commitear (salvo la nota de documentación). Su entregable es distinto:

1. **Antes de tocar:** bajar el workflow completo por API y guardarlo como backup. Si algo sale mal, es la única vuelta atrás.
2. Mostrar a Leonardo **el cambio exacto propuesto** (el antes y el después del nodo) y **esperar el OK**.
3. Recién ahí aplicarlo, y probar con una conversación real de prueba.
4. Reportar el resultado de esa prueba, con la salida.
