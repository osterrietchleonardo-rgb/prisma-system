# Módulo Marketing — HANDOFF (estado actual + qué falta)

> Para retomar en otra sesión. Módulo = `/admin-vakdor/marketing` (sala de control del "Agente IA de Marketing"). Specs: `docs/superpowers/specs/2026-07-15-marketing-pipeline-design.md` y `2026-07-16-marketing-motor-local-design.md`. Receta del motor: `docs/interno/motor-marketing-local.md`.

## ✅ HECHO y EN PRODUCCIÓN (mergeado a `main`, deployado en Vercel; env vars ya cargadas por Leo)
- **Tablero kanban** (6 columnas idea→en_proceso→en_revision→aprobada→publicada / rechazada): mover (drag+botones), alta manual, **reformular** con IA, ver/descargar assets. Tabla `marketing_ideas` (Supabase PRISMA, RLS sin políticas) + bucket privado `marketing-assets`.
- **Desarrollar contenido** al pasar a "En proceso" (botón in-app, Claude) + **visor** "Ver contenido" (texto + **preview de imagen de marca** + links a PDF).
- **Calendario** (toggle Tablero/Calendario, grilla mensual, filtros fuente/formato/ángulo, botón 📅 Programar fecha).
- **Publicar blog** (botón) → escribe en `blog_posts` de **vakdor-app** (`PROJECT_URL` + `SERVICE_ROLE_SECRET`), con `featured_image_url` = portada pública. Bucket público `blog-images` en vakdor-app (creado).
- **Publicar LinkedIn** (botón) → Buffer `createPost` (verificado en borrador contra la API real). Postea texto + imagen; **el primer comentario NO va por API (requiere plan pago Buffer)** → el botón te lo muestra para pegar a mano.
- **Cron auto-publicar** (endpoint `publicar-programadas` + workflow `.github/workflows/marketing-publish.yml` cada 30 min) — un solo cron saca todas las programadas vencidas. **OJO: falta activarlo** (ver pendientes).
- **Motor de ideas (Disparo 1)** probado a mano: 5 ideas reales fundamentadas (GA + Search Console + memoria + copywriter) insertadas.

## ✅ El WORKER (el "automático" que quería Leo) — HECHO y verificado
- Carpeta: **`Prisma - MK/marketing-worker/`** (`watch.mjs` + `iniciar-worker.bat` + `README.md`). Deps instaladas en Prisma-MK (playwright + @anthropic-ai/sdk + @supabase/supabase-js). Lee las claves del `.env` de PRISMA-SYSTEM.
- **Qué hace:** observa "En proceso" cada 20s → por cada idea: desarrolla contenido (Claude + copywriter + `memoria.md`) si falta + genera **imagen de marca con logos** (Playwright: blog 1200×630 / LinkedIn 1080×1080) → sube a `blog-images` (público) → setea contenido/`featured_image_url`/`assets` → pasa a "En revisión".
- **Cómo se corre:** doble clic a `iniciar-worker.bat` (o `node watch.mjs`). Para Leo = automático (mueve tarjeta → worker la procesa).
- **Verificado (17-jul-2026):** procesó el blog "Cómo medir la performance de tus asesores" → portada generada + subida + pasado a "En revisión".

## ⏭️ QUÉ FALTA (próximos pasos, en orden sugerido)
1. **Deploy del worker a EasyPanel** (always-on, sin depender de la PC de Leo) — **igual que el acm-extractor**: Dockerfile con base `mcr.microsoft.com/playwright`, instalar las 3 deps, env vars como secrets, `CMD ["node","watch.mjs"]`. El worker ya es host-agnóstico.
2. **Carruseles multi-slide + lead-magnets (PDF)** — hoy el worker hace la portada/imagen ÚNICA de marca. Falta: para formato `carrusel` generar las N slides + `carousel.pdf` (vakdor-carousel completo), y para `lead_magnet` el PDF (Vakdor-LeadMagnet). Subirlos como `assets` (tipo pdf/png) → el visor ya los previsualiza.
3. **Imagen en LinkedIn:** el post de LinkedIn ya soporta imagen (`assets:[{image:{url}}]`), pero la idea de LinkedIn necesita una imagen PÚBLICA (el worker la genera 1080×1080 y la sube a `blog-images` → usar esa `assets[].url` como `imageUrl` en el publish LinkedIn; hoy el route de LinkedIn busca `blog.featured_image_url` — extenderlo a tomar `assets[].url` público).
4. **Activar el cron en GitHub:** el workflow `marketing-publish.yml` ya está en `main`. Confirmar secrets `SITE_DOMAIN` + `CRON_SECRET` en el repo, y que corra (o engancharlo al cron diario existente si Leo prefiere ahorrar minutos — él creía que GitHub free era 1/día, pero el mínimo real es 5 min).
5. **Primer comentario LinkedIn automático:** requiere plan pago de Buffer. Decisión de Leo (por ahora se pega a mano).

## Datos clave verificados (para no re-investigar)
- **Modelo Claude:** `claude-opus-4-8` (sin temperature, sin streaming, max_tokens 4000).
- **Blog vakdor-app:** `PROJECT_URL` (=https://upggigryxdvcmnuwafyl.supabase.co) + `SERVICE_ROLE_SECRET`. Bucket público `blog-images`. URL pública: `{PROJECT_URL}/storage/v1/object/public/blog-images/<path>`.
- **Buffer LinkedIn:** POST `https://api.buffer.com/graphql`, `Authorization: Bearer BUFFER_API_KEY`. Mutación `createPost(input: CreatePostInput!)` → union `PostActionPayload` (`PostActionSuccess{post{id,status}}` / errores con `message`). Input: `channelId` (LinkedIn personal = `6a4aca1140483446287320b8`), `text`, `schedulingType:"automatic"`, `mode:"shareNow"` (ahora) / `"customScheduled"`+`dueAt` (programar), `assets:[{image:{url}}]`, `saveToDraft` (true=probar sin publicar), `metadata:{linkedin:{firstComment}}` (SOLO plan pago). `deletePost(input:{id})` para borrar.
- **Rama/deploy:** todo en `main` (mergeado desde `feat/marketing-pipeline`; main había avanzado con tracking/marketing-ia de otra sesión, merge fue limpio sin conflictos). Build OK. Repo privado `osterrietchleonardo-rgb/prisma-system`.

## Arquitectura (regla dura, para no volver a discutirla)
Todo lo que usa **skills reales o Playwright** (ideas, contenido fiel, imágenes de marca) corre **LOCAL** (worker) o en **EasyPanel** — NUNCA en Vercel. La app (Vercel) hace: tablero, develop rápido in-app (texto), publicar, calendario, cron. El worker/EasyPanel hace: contenido fiel + imágenes de marca.
