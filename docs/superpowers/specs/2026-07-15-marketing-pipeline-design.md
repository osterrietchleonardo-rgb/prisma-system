# Módulo Marketing — Pipeline de contenido (Agente IA de Marketing)

**Fecha:** 2026-07-15
**Rama:** `feat/marketing-pipeline`
**Estado:** Diseño aprobado (Fase 1 a implementar; Fases 2–4 en roadmap)

---

## 1. Visión

La página `/admin-vakdor/marketing` es la **sala de control del Agente IA experto en Marketing de Vakdor**.
No es un simple CRUD de posts: es la superficie visible de un agente cuyas **habilidades son las skills** ya existentes:

- `vakdor-copywriter` — el cerebro de contenido (brief combinatorio, ángulos, hooks, keywords, memoria anti-repetición, reglas de marca).
- `vakdor-carousel` — maquetado visual con la identidad de marca (`brand.json`, Playwright → PNG/PDF).
- `Vakdor-LeadMagnet` — imanes de leads en PDF.
- `vakdor-metricas` — Buffer (LinkedIn orgánico) + Google Analytics + Search Console.

El agente propone **ideas de publicación** (LinkedIn en todos sus formatos + blog), que el director (Leo) mueve por un **pipeline kanban** hasta publicarlas. Todo el bloque debe comportarse como una habilidad más del agente: mismas reglas de marca, misma voz, misma memoria.

### Objetivo de negocio
Que cada mañana Leo encuentre ideas listas para revisar y publicar **ese mismo día**, alineadas a lo que ya funciona (métricas reales), sin depender de arrancar de cero ni de repetir ángulos.

---

## 2. Arquitectura (final)

```
┌──────────────────────────────────────────────────────────────────┐
│ GitHub Action  (schedule ~8AM AR + workflow_dispatch manual)      │
│   runner con: repo PRISMA-SYSTEM (skills reales) + Claude Code CLI │
│               + Playwright + ANTHROPIC_API_KEY                     │
│   claude -p "modo motor marketing":                               │
│     • vakdor-metricas → Buffer(posts) + GA4 + Search Console       │
│     • vakdor-copywriter → brief + ángulos + hooks + keywords       │
│         memoria = lee ideas previas de la tabla → NO repite        │
│     • vakdor-carousel / Vakdor-LeadMagnet → PNG/PDF (Playwright)   │
│   → POST ideas a /api/admin-vakdor/marketing/ingest (CRON_SECRET)  │
│   → sube assets a Supabase Storage (bucket privado)               │
└───────────────────────────┬──────────────────────────────────────┘
                            ▼
   Supabase PRISMA:  tabla `marketing_ideas` + bucket `marketing-assets`
                            ▼
   App  /admin-vakdor/marketing   (lee/escribe la tabla)
     • Tablero kanban (6 columnas)
     • Reformular = Claude API en la app (rápido, prompt de marca destilado)
     • Publicar → Buffer (LinkedIn + primer comentario) / blog_posts (web "vakdor app")
```

**Dos motores de IA, a propósito:**
- **Motor pesado (diario + assets):** GitHub Action que corre **Claude Code con las skills reales**. Es la única forma de: (a) usar las skills verbatim sin duplicar su lógica ni sufrir "drift", y (b) generar carruseles y lead magnets, que necesitan Playwright + filesystem y **no pueden correr en Vercel**. Fase 2.
- **Motor liviano (interactivo):** el botón **Reformular** llama a la **API de Claude** desde la app, con un prompt de marca destilado. Necesita respuesta en segundos; no puede esperar al Action. Fase 1.

**Dos bases Supabase:**
- **PRISMA** (la de siempre): `marketing_ideas`, `audit_snapshots`, bucket `marketing-assets`.
- **"vakdor app"** (la web): tabla `blog_posts`. Publicar un blog = insertar/actualizar una fila con `is_published=true`; la web la renderiza sola desde Markdown, sin re-deploy. Requiere un **segundo cliente Supabase** en la app (Fase 4).

---

## 3. Alcance por fases

| Fase | Qué entrega |
|---|---|
| **1 (esta)** | Página + tabla + bucket Storage + tablero kanban (6 columnas) + mover estados + **Reformular** (Claude API) + **alta manual** de idea + **"Generar ideas ahora"** provisional (Claude API, solo texto). |
| **2** | GitHub Action con Claude Code + skills reales (motor de la mañana) + generación de carruseles/lead magnets subidos a Storage + endpoint `ingest`. Tabla = memoria anti-repetición. |
| **3** | Vista **calendario** + **programar** publicaciones; filtros por fuente / formato / ángulo / estructura. |
| **4** | **Publicar** de verdad: Buffer (LinkedIn + primer comentario) y `blog_posts` (segundo cliente Supabase "vakdor app"). |

Cada fase futura tendrá su propio spec + plan. Este documento detalla la **Fase 1** y deja el roadmap de 2–4 anotado (sección 7).

---

## 4. Fase 1 — Detalle

### 4.1 Modelo de datos

**Tabla `marketing_ideas`** (Supabase PRISMA). Estilo alineado a `audit_snapshots`: columnas `text` con `check`, `jsonb` para lo flexible.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `estado` | `text` | check: `idea` \| `en_proceso` \| `en_revision` \| `aprobada` \| `publicada` \| `rechazada`. Default `idea`. |
| `fuente` | `text` | check: `linkedin` \| `instagram` \| `blog`. |
| `formato` | `text` | check: `post_texto` \| `carrusel` \| `imagen` \| `encuesta` \| `articulo_linkedin` \| `reel` \| `lead_magnet` \| `articulo_blog`. |
| `titulo` | `text` | título corto de la idea. |
| `angulo` | `text` | legible, ej. `A12 Reframe · trazabilidad`. |
| `estructura` | `text` | ej. `PAS`, `8 partes`, `SLAY`. |
| `gancho` | `text` | hook / primera línea. |
| `contenido` | `text` | borrador completo (post/artículo/blog). Se llena en `en_proceso`. |
| `primer_comentario` | `text` | comentario de engagement para LinkedIn (pregunta/estadística; **nunca** "comentá X"; el link a vakdor.com va acá). |
| `hashtags` | `text[]` | 3–5, para LinkedIn/IG. |
| `motivo` | `text` | por qué se generó (trazabilidad: métrica / post / keyword que la inspiró). |
| `comentario` | `text` | último feedback de Leo para reformular. |
| `brief` | `jsonb` | brief combinatorio del copywriter: `{ objetivo, fractura, eje, angulo_id, hook_id, tono, disparador, cta, mecanismo_prueba, modo }`. |
| `blog` | `jsonb` | solo blogs: `{ slug, meta_description, category, seo_keywords[], read_time_minutes, featured_image_prompt }` (listo para `blog_posts`). |
| `assets` | `jsonb` | lista de archivos en Storage: `[{ tipo: 'pdf'\|'png', path, orden }]`. |
| `programada_para` | `timestamptz` | null hasta Fase 3. |
| `publicado_en` | `jsonb` | null hasta Fase 4: `{ canal, ref_id, url, fecha }`. |
| `origen` | `text` | check: `motor` \| `manual`. |
| `historial` | `jsonb` | lista de eventos: `[{ fecha, tipo, detalle }]` (movimientos, reformulaciones). |
| `created_at` | `timestamptz` | default `now()`. |
| `updated_at` | `timestamptz` | trigger `update_updated_at`. |

**Índices:** `(estado)`, `(fuente)`, `(created_at desc)`.

**Migración:** vía `mcp__supabase__apply_migration` (o SQL en `supabase/`), siguiendo cómo se crearon las tablas admin.

### 4.2 RLS

La tabla es **solo de back-office admin**. Igual que las 5 tablas admin ya protegidas (ver memoria `finanzas-modulo-costos`):
- `alter table marketing_ideas enable row level security;`
- **Sin políticas públicas.** El acceso es exclusivamente vía `createAdminClient()` (service role, salta RLS). Ningún cliente anónimo puede leer/escribir.

### 4.3 Storage

- Bucket **`marketing-assets`**, **privado**.
- Path sugerido: `ideas/{idea_id}/{archivo}` (ej. `ideas/<uuid>/lead-magnet.pdf`, `ideas/<uuid>/slide-01.png`).
- La tarjeta arma **URL firmada temporal** (`createSignedUrl`) para ver/descargar sin exponer el bucket.
- En Fase 1 el bucket se crea y se soporta ver/descargar; la **subida** real de assets llega con el motor (Fase 2). Se permite adjuntar un PDF manualmente si hiciera falta para probar.

### 4.4 UI — página y tablero

**Ruta y layout:**
- `app/admin-vakdor/marketing/page.tsx` (server component, `force-dynamic`) → carga las ideas con `getAdminDb()` y las pasa a un client component.
- `components/admin-vakdor/marketing-client.tsx` (client) → el tablero.
- Entrada en el sidebar (`components/admin-vakdor/sidebar.tsx`): `{ href: "/admin-vakdor/marketing", icon: "📣", label: "Marketing" }`.
- Estilo: inline styles, paleta oscura de admin (fondo `#070B14`, acento índigo/cobre), consistente con el resto del panel.

**Tablero kanban — 6 columnas:**
`Idea` → `En proceso` → `En revisión` → `Aprobada` → `Publicada`, y `Rechazada` como columna al costado (terminal, fuera del flujo).

**Tarjeta (card):** muestra `titulo`, chips de `fuente` + `formato` + `angulo`, `motivo` (por qué se generó), y acciones según estado:
- Mover de estado: **drag & drop** entre columnas **y** botones ◀ ▶ (accesible sin arrastrar).
- **En revisión:** botón **"+comentario → Reformular"** (abre input, llama a Reformular).
- Si hay `assets`: botón **Ver/Descargar** (URL firmada).
- Ver contenido completo (`contenido`, `primer_comentario`, `hashtags`) en un panel/expand.

**Mover estado:** server action que hace `update marketing_ideas set estado=... , historial = historial || <evento>` y revalida.

**Alta manual:** botón **"Nueva idea"** → formulario mínimo (`titulo`, `fuente`, `formato`, `angulo`, `motivo`) → inserta fila con `origen='manual'`, `estado='idea'`.

### 4.5 Reformular (Claude API, interactivo)

- **Endpoint:** `app/api/admin-vakdor/marketing/reformular/route.ts` (POST), protegido por sesión admin (cookie `admin_vakdor_token`, mismo patrón que el layout).
- **Body:** `{ idea_id, comentario }`.
- **Lógica:** lee la idea, arma un prompt con el **paquete de marca destilado** (ver 4.7) + el `contenido` actual + el `comentario` de Leo → llama a la **API de Claude** → guarda la nueva versión en `contenido` (y `primer_comentario` si aplica), agrega evento a `historial`, guarda el `comentario`.
- **Modelo:** Claude (interactivo, rápido/económico; id exacto a confirmar leyendo la skill `claude-api` en implementación).
- **Env:** `ANTHROPIC_API_KEY` (Vercel).

### 4.6 "Generar ideas ahora" (provisional, Fase 1)

Para ver el tablero vivo antes de tener el Action (Fase 2):
- **Endpoint:** `app/api/admin-vakdor/marketing/generar/route.ts` (POST, sesión admin).
- **Versión provisional (Fase 1):** llama a la **API de Claude** con el paquete de marca destilado + un resumen de métricas si está a mano, y devuelve **N ideas solo de texto** (sin assets) que se insertan con `origen='motor'`, `estado='idea'`. Anti-repetición: se le pasan los `titulo/angulo/hook` de las ideas recientes de la tabla.
- **En Fase 2** este disparo manual queda **reemplazado/complementado** por el Action con skills reales (mismo `ingest`), que sí genera assets.

> Nota: el "Generar ahora" provisional es un **stand-in** para no bloquear la Fase 1. La generación fiel y con assets es responsabilidad del Action (Fase 2).

### 4.7 Paquete de marca destilado (para el motor liviano)

Un módulo en `lib/admin-vakdor/marketing/brand-prompt.ts` que condensa, para uso del reformular y del "generar provisional", los pilares NO negociables del copywriter:
- Eje Clave (Vehículo → Mecanismo → Resultado, aterrizar en el Resultado).
- Reglas de formato (2ª persona, párrafos cortos, cero emojis, viñetas •, sin links en el cuerpo, primer comentario aparte).
- Modo por plataforma (LinkedIn = ultracualificación / Instagram = alcance).
- Referencia a las 3 Fracturas y el Método P-R-I-S-M-A.

> Este paquete **no reemplaza** las skills (eso lo hace el Action con las skills reales en Fase 2); es solo el mínimo de marca para las tareas interactivas de la app. Se mantiene alineado a `vakdor-copywriter/SKILL.md`.

### 4.8 Archivos (Fase 1)

**Nuevos:**
- `supabase/migrations/<ts>_marketing_ideas.sql` (o migración vía MCP) — tabla + índices + RLS + bucket.
- `app/admin-vakdor/marketing/page.tsx`
- `components/admin-vakdor/marketing-client.tsx` (tablero + tarjetas + modales)
- `lib/admin-vakdor/marketing/store.ts` (leer/insertar/mover/actualizar ideas)
- `lib/admin-vakdor/marketing/types.ts` (tipos `MarketingIdea`, enums)
- `lib/admin-vakdor/marketing/brand-prompt.ts` (paquete de marca destilado)
- `lib/admin-vakdor/marketing/claude.ts` (cliente Claude para reformular/generar)
- `app/api/admin-vakdor/marketing/reformular/route.ts`
- `app/api/admin-vakdor/marketing/generar/route.ts`
- `app/actions/marketing.ts` (server actions: mover estado, alta manual, rechazar)

**Modificados:**
- `components/admin-vakdor/sidebar.tsx` (nav item).

**Env nuevas:** `ANTHROPIC_API_KEY` (Vercel).

---

## 5. Decisiones tomadas (log)

1. **Motor diario = GitHub Action que corre Claude Code con las skills reales** (no una ruta API que las imita). Razón: fidelidad total a las skills + los carruseles/lead magnets necesitan Playwright/filesystem, imposible en Vercel.
2. **Reformular = Claude API en la app**, al toque (segundos), no en la próxima corrida.
3. **La tabla `marketing_ideas` es la memoria anti-repetición** del motor (reemplaza al `memoria.md` local, inaccesible desde CI/server).
4. **Blog se publica escribiendo en la base "vakdor app" (`blog_posts`)**, no vía deploy; requiere segundo cliente Supabase (Fase 4).
5. **Buffer cumple doble función:** fuente de métricas por-post (motor) y canal de publicación de LinkedIn (Fase 4), incluyendo el primer comentario.
6. **Fase 1 incluye un "Generar ideas ahora" provisional (texto)** para ver el tablero vivo; la generación fiel con assets llega en Fase 2.

---

## 6. Riesgos / cuestiones abiertas

- **Claude Code en CI (Fase 2):** hay que instalar el CLI + `ANTHROPIC_API_KEY` como secret, y parsear su salida de forma robusta (contrato JSON de ideas). Costo por corrida a monitorear (Finanzas).
- **Extender `getBufferMetrics` a por-post:** hoy trae agregados de 30 días; el motor necesita los mejores posts individuales (mismo endpoint/token, más detalle). Se resuelve en Fase 2.
- **Regla de oro de las skills carousel/copywriter:** NUNCA escribir dentro de `PRISMA-SYSTEM`; su output va a `Prisma - MK`. El Action genera el asset allí y **sube el archivo a Supabase Storage** para que la app lo muestre.
- **Contenido de venta:** cuando la idea menciona features, el motor debe leer `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md` (regla Venta vs Autoridad).
- **Modelo/ids de Claude:** confirmar leyendo la skill `claude-api` al implementar (no fijar de memoria).

---

## 7. Roadmap Fases 2–4 (resumen)

**Fase 2 — Motor automático (Action + skills reales):**
- Workflow `.github/workflows/marketing-motor.yml` (schedule + workflow_dispatch), calcado del patrón de `market-sync.yml`.
- Job: checkout repo → instala Claude Code CLI + deps (Playwright) → `claude -p` en "modo motor marketing" (metricas + copywriter + carousel/leadmagnet), con memoria = ideas recientes de la tabla → produce `ideas.json` + archivos de asset.
- Endpoint `app/api/admin-vakdor/marketing/ingest/route.ts` (POST, `CRON_SECRET` vía `assertCron`) que inserta ideas; assets subidos a Storage.

**Fase 3 — Calendario + programación:**
- Vista calendario (por `programada_para`), filtros por `fuente` / `formato` / `angulo` / `estructura`.
- Programar = setear `programada_para`; un cron mueve/publica al llegar la fecha (Fase 4).

**Fase 4 — Publicar:**
- **LinkedIn (Buffer):** crear update programado/inmediato + primer comentario. Reusar recetas GraphQL de `lib/admin-vakdor/audit/sources/buffer.ts`.
- **Blog (web "vakdor app"):** segundo cliente Supabase → insertar en `blog_posts` (title, slug, meta_description, category, content Markdown, seo_keywords[], read_time, featured_image_url, `is_published=true`, `published_at`).
- Registrar en `publicado_en` (canal, ref_id, url, fecha) y pasar la tarjeta a `publicada`.

---

## 8. Criterios de éxito (Fase 1)

- [ ] `/admin-vakdor/marketing` accesible desde el sidebar, protegida por sesión admin.
- [ ] Tabla `marketing_ideas` creada con RLS (sin acceso público) y bucket `marketing-assets` privado.
- [ ] Tablero con las 6 columnas; se pueden mover tarjetas (drag y botones) y el estado persiste.
- [ ] Alta manual de una idea funcionando.
- [ ] Reformular con comentario en "En revisión" devuelve una versión nueva del contenido (Claude API) y queda en `historial`.
- [ ] "Generar ideas ahora" inserta ideas de texto respetando el paquete de marca y sin repetir ángulos recientes.
- [ ] Ver/Descargar de un asset por URL firmada (con un PDF de prueba).
- [ ] Se prueba en local (`npm run dev`) antes de mergear; merge a `main` solo con OK de Leo.
