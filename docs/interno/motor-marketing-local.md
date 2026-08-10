# Motor de Marketing — procedimiento local (Disparo 1 y Disparo 2)

El motor corre en la **máquina de Leo** (Claude Code + skills reales + Playwright), porque usa `memoria.md` (Prisma-MK), las skills y Playwright, que no existen en la nube. Escribe a **Supabase de PRISMA** (`marketing_ideas` + bucket `marketing-assets`) vía el MCP de Supabase. La app (tablero/calendario/publicar) solo lee/usa lo que el motor deja.

Proyecto Supabase PRISMA: ref `vutopjvdrwmvrkgnrfno`. Tabla `marketing_ideas`. Bucket privado `marketing-assets` (path `ideas/<id>/<archivo>`).

---

## Disparo 1 — Generar ideas (solo ideas, sin contenido ni assets)

**Comando:** en una sesión de Claude Code parada en `PRISMA-SYSTEM`, pedir:

> "Disparo 1 del motor de marketing: generá 5 ideas nuevas."

**Procedimiento (lo que hace Claude):**
1. **Fundamento (métricas reales):**
   - `vakdor-metricas` / Buffer → qué posts de LinkedIn rinden (ángulo/formato).
   - GA4 (property 526455345) → páginas que traen tráfico.
   - Search Console (`https://www.vakdor.com/`) → queries reales (SEO).
2. **Anti-repetición:** leer `Prisma - MK/memoria.md` + `INSIGHTS-CONTENIDO.md` **y** las ideas ya cargadas (`select titulo, angulo from marketing_ideas`). Elegir **ángulos/hooks frescos** (no repetir).
3. **Copywriter al pie:** `vakdor-copywriter` (references/angles.md, hooks.md, ipc_psychology.md, seo_keywords.md) — Eje Clave (aterriza en el Resultado), IPC2, 2ª persona. Variar ejes/ángulos (contrarian, teardown, confesión, predicción, comparación, manifiesto, SEO…), manteniendo el núcleo.
4. **Insertar** en `marketing_ideas` (estado `idea`, origen `motor`): titulo, fuente, formato, angulo, estructura, gancho, **motivo** (el fundamento: qué métrica/keyword/ángulo lo respalda), y el **brief** jsonb (objetivo, fractura, eje, angulo_id, hook_id, disparador, cta). Para blog, además `blog` jsonb (slug, keyword_principal, secundarias, category).

Aparecen en el tablero (columna **Idea**). Leo aprueba las que quiere.

---

## Disparo 2 — Desarrollar aprobadas (contenido + imágenes de marca)

**Comando:** con las ideas ya aprobadas/en "En proceso", pedir:

> "Disparo 2: desarrollá las aprobadas (contenido + imágenes)."

**Procedimiento (por cada idea a desarrollar):**
1. **Contenido (copywriter al pie):**
   - LinkedIn → post/carrusel completo + **primer comentario** (engagement, nunca "comentá X") + hashtags.
   - Blog → artículo Markdown (intro que responde en 100 palabras, H2 respuesta directa/TL;DR, 3-6 H2, FAQ Schema, cierre con CTA a `/call`) + campos SEO (title, slug, meta, keywords, read_time).
   - Si es de VENTA/feature → leer `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md` (regla Venta vs Autoridad).
2. **Imágenes de marca (SIEMPRE `vakdor-carousel`, Playwright):**
   - **Blog** → **portada Open Graph 1200×630** (caso "Portada de Artículo" de la skill) → es el `featured_image_url`.
   - **LinkedIn artículo/carrusel** → slides o imagen de marca (1080×1080).
   - Regla de oro de la skill: la generación (export.html/export.js/PNG/PDF) va a `Prisma - MK/Activos de Marketing/<fecha>/<activo>` (NUNCA dentro de PRISMA-SYSTEM). Brand: fondo `#0A0F1A`, cobre `#C07C41`, Inter, logos vakdor + prisma.
3. **Subir a Storage** (`marketing-assets`, path `ideas/<id>/<archivo>.png|pdf`) y **actualizar la idea**:
   - `contenido`, `primer_comentario`, `hashtags` (LinkedIn) o `blog` (blog).
   - `assets` = lista `[{tipo, path, orden}]` con las imágenes/PDF subidos.
   - Blog: setear `blog.featured_image_url` con la URL/asset de la portada.
   - Pasar la idea a estado **`en_revision`**.

Leo revisa en el tablero (visor "Ver contenido" + botón de descarga de assets), reformula si hace falta, aprueba y programa.

---

## Publicación (la app)
- **Blog:** botón "Publicar en blog" → escribe en `blog_posts` de **vakdor-app** (`PROJECT_URL` + `SERVICE_ROLE_SECRET`), con `featured_image_url` = portada del Disparo 2.
- **LinkedIn (pendiente):** Buffer `createPost` (channelId LinkedIn `6a4aca1140483446287320b8`, `mode: shareNow` o `customScheduled`+`dueAt`, `firstComment`, imagen/carrusel del Disparo 2).
- **Cron (pendiente):** publica lo aprobado + `programada_para <= ahora` automáticamente.

---

## Notas
- Verificado en jul-2026: Disparo 1 corrido a mano (5 ideas reales fundamentadas insertadas). Disparo 2 (imágenes) pendiente de primera corrida.
- El motor NO corre en GitHub Action: las skills asumen rutas Windows locales + Prisma-MK. Ver `docs/superpowers/specs/2026-07-16-marketing-motor-local-design.md`.
