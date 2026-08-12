# Módulo Marketing — HANDOFF (estado actual + qué falta)

> Para retomar en otra sesión. Módulo = `/admin-vakdor/marketing` (sala de control del "Agente IA de Marketing"). Specs: `docs/superpowers/specs/2026-07-15-marketing-pipeline-design.md` y `2026-07-16-marketing-motor-local-design.md`. Receta del motor: `docs/interno/motor-marketing-local.md`.

## ✅ HECHO y EN PRODUCCIÓN (mergeado a `main`, deployado en Vercel; env vars ya cargadas por Leo)
- **Tablero kanban** (6 columnas idea→en_proceso→en_revision→aprobada→publicada / rechazada): mover (drag+botones), alta manual, **reformular** con IA, ver/descargar assets. Tabla `marketing_ideas` (Supabase PRISMA, RLS sin políticas) + bucket privado `marketing-assets`.
- **Desarrollar contenido** al pasar a "En proceso" (botón in-app, Claude) + **visor** "Ver contenido" (texto + **preview de imagen de marca** + links a PDF).
- **Calendario** (toggle Tablero/Calendario, grilla mensual, filtros fuente/formato/ángulo, botón 📅 Programar fecha).
- **Publicar blog** (botón) → escribe en `blog_posts` de **vakdor-app** (`PROJECT_URL` + `SERVICE_ROLE_SECRET`), con `featured_image_url` = portada pública. Bucket público `blog-images` en vakdor-app (creado).
- **Publicar LinkedIn** (botón) → Buffer `createPost` (verificado en borrador contra la API real). Postea texto + imagen; **el primer comentario NO va por API (requiere plan pago Buffer)** → el botón te lo muestra para pegar a mano.
- **Cron auto-publicar** (endpoint `publicar-programadas` + workflow `.github/workflows/marketing-publish.yml` cada 30 min) — un solo cron saca todas las programadas vencidas. **✅ ACTIVO y corriendo** (secrets `SITE_DOMAIN`+`CRON_SECRET` ya en el repo; verificado 18-jul: 2 corridas OK, respuesta `{"revisadas":0,"publicadas":0,"errores":[]}`).
- **Motor de ideas (Disparo 1)** probado a mano: 5 ideas reales fundamentadas (GA + Search Console + memoria + copywriter) insertadas.

## ✅ El WORKER (el "automático" que quería Leo) — HECHO y verificado
- Carpeta: **`Prisma - MK/marketing-worker/`**. Ahora **modular**: `watch.mjs` (orquestador) + `content.mjs` (prompts Claude) + `render.mjs` (portada/slides + carousel.pdf) + `vakdor-pdf.mjs` (markdown→PDF on-brand) + `iniciar-worker.bat` + `README.md`. Deps en Prisma-MK: playwright + @anthropic-ai/sdk + @supabase/supabase-js + pdfkit + **marked** (nueva). Lee las claves del `.env` de PRISMA-SYSTEM.
- **Qué hace:** observa "En proceso" cada 20s → por cada idea: desarrolla contenido (Claude + copywriter + `memoria.md`) si falta + genera **assets de marca según el `formato`** (ver abajo) → sube a `blog-images` (público, cada asset con `url`) → setea contenido/`featured_image_url`/`assets` → pasa a "En revisión".
- **Assets por formato:** `carrusel` → N slides 1080×1080 (portada+cuerpo+CTA final) + `carousel.pdf`; `lead_magnet` → `magnet.pdf` on-brand (scorecard con tabla+casillas, vía Vakdor-PDF) + portada; **resto** → portada única (blog 1200×630 / LinkedIn 1080×1080).
- **Cómo se corre:** doble clic a `iniciar-worker.bat` (o `node watch.mjs`). Para Leo = automático (mueve tarjeta → worker la procesa).
- **Fix logos (18-jul):** los logos ahora se embeben como **data-URI base64**, no `file://`. Las rutas `file://` con espacios ("Antigravity - Apps"/"Prisma - MK") no cargaban → portadas salían **sin logos**. El data-URI además corre en EasyPanel (sin rutas absolutas de Windows).
- **Verificado (18-jul-2026):** corrida en vivo end-to-end OK — se crearon ideas reales `carrusel`/`lead_magnet`, el worker generó y subió los assets (9 y 2), quedaron en `en_revision` con URLs públicas 200. Render on-brand + prompts (JSON válido) verificados.

## ✅ HECHO en la sesión del 18-jul (mergeado a `main`)
- **Carruseles multi-slide + lead-magnets (PDF)** — el worker genera, por `formato`: `carrusel` = N slides + `carousel.pdf`; `lead_magnet` = `magnet.pdf` (Vakdor-PDF) + portada. Se suben como `assets` con `url` público → el visor los previsualiza.
- **Imagen en LinkedIn (cron):** `resolverImagenLinkedIn()` en `buffer-client.ts`; el cron `publicar-programadas` cae a `assets[].url` público igual que el route manual. `url?` en `AssetRef`.
- **Botón de descarga del visor:** abre `a.url` directo si existe.
- **Fix logos (data-URI)** en el worker (ver sección WORKER).

## ✅ Carrusel a LinkedIn como DOCUMENTO (rama `feat/linkedin-carrusel-documento`)
- **Verificado contra la API real de Buffer:** un carrusel de LinkedIn es un **document post** (PDF deslizable). `AssetInput.document{url,title,thumbnailUrl}` — todo URL pública. Draft real creado con `DocumentAsset` (mimeType `application/pdf`) desde el `carousel.pdf` + slide-01 del worker → `PostActionSuccess`. (La otra idea —subir slice por slice y que Buffer arme el PDF— NO aplica: Buffer espera el PDF ya hecho, que el worker ya genera.)
- **Implementado:** helper `resolverDocumentoLinkedIn(titulo, assets)` (elige `carousel.pdf` + primera slide png); `publicarLinkedIn` acepta `document`; el route manual `[id]/publicar` y el cron `publicar-programadas` publican **document post si es `carrusel`**, imagen si no. **Publicar ya (botón) y programar (fecha + cron) funcionan para carruseles.** E2E probado con un carrusel real del worker (draft OK, luego borrado).

## ✅ Preview real en el visor + reformular con visuales (rama `feat/marketing-preview-y-reformular-visuales`)
- **Visor "Ver contenido"** (`PreviewPieza`): carrusel = **galería slide por slide** (◀▶ + puntos) + **Descargar PDF**; lead_magnet = **PDF embebido** + descargar; resto = portada. El `contenido` se etiqueta **"Descripción del posteo"**. Descarga forzada con `?download=` de Supabase Storage.
- **Descripción con hook + storytelling:** los prompts del worker (`content.mjs`) desarrollan `contenido` como un posteo con gancho + storytelling (no un pie de foto), para carrusel y lead_magnet.
- **Reformular con visuales:** check "También regenerar imágenes/PDF" (carrusel/lead_magnet). Marcado → `regenerarVisuales(id, comentario)` limpia contenido+assets, → `en_proceso`, y el worker rehace **descripción + slides/PDF** alineados al comentario (`ajusteIdea`). Sin marcar → solo texto (para estas piezas, el texto es la descripción del posteo).
- **Verificado (18-jul) en dev real** (login admin + Playwright): galería carrusel navegable (slide 3/8), lead_magnet PDF embebido, checkbox visible; flujo reformular+regenerar end-to-end (carrusel real → en_proceso → worker rehace descripción limpia + 8 slides + pdf → en_revision).

## ✅ Artículo de blog → CROSS-POST web + LinkedIn (rama `feat/blog-crosspost-linkedin`)
- Publicar un `articulo_blog` (`fuente=blog`) ahora hace **las dos**: web (`blog_posts` + portada) **y** LinkedIn (post teaser standalone + misma portada, **sin links** ni mención del artículo — el link vive en el perfil). Helper `publicarArticuloBlog` en `publisher.ts`, usado por el botón y el cron.
- El **worker** genera la versión LinkedIn del artículo (`blog.linkedin_post` / `linkedin_primer_comentario` / `linkedin_hashtags`); el visor la muestra ("Versión LinkedIn") para revisarla.
- **Fix de 2 bugs** del botón manual de blog: no mandaba la portada (web salía sin imagen) y exigía `category` que el worker no setea (daba 400). Ahora pasa portada + defaultea category.
- **Verificado (18-jul):** worker desarrolla artículo + portada + versión LinkedIn (sin links, confirmado por query); crosspost a LinkedIn = post con la portada como imagen (Buffer draft OK). Web = vía ya probada por el cron.

## ✅ Embudo TOFU/MOFU/BOFU + estructura copywriter + desarrollo solo-worker (main)
- **Desarrollo solo por el worker:** mover a "En proceso" ya NO dispara el desarrollo in-app (texto sin imágenes, que volcaba las slides como texto y no generaba imagen en blog). Desarrolla el worker (estructura + imágenes de marca). Se quitó ese botón.
- **Estructura vakdor-copywriter:** las descripciones de LinkedIn (post, carrusel, versión LinkedIn del blog) siguen la estructura de `platform_structures.md` (hook→fricción→quiebre→solución→prueba→CTA, 1500-2500 car).
- **Embudo:** columna `funnel` (`tofu|mofu|bofu`) + badge de color en la tarjeta/visor + selector en Nueva idea + filtro en calendario + el motor balancea las 3 etapas. El worker adapta el contenido a la etapa (`funnelInstruccion`): TOFU no vende, MOFU muestra el mecanismo, BOFU empuja a la reunión. Verificado (TOFU vs BOFU dan tono/CTA distintos).

## ✅ Skills reales + análisis diario (main)
- **Skills reales (`marketing-worker/skills.mjs`):** el worker carga los `.md` reales de vakdor-copywriter (+ platform_structures/angles/hooks), vakdor-carousel y Vakdor-LeadMagnet (~85K car) y los sigue al pie. Van como bloque de system **cacheado** (`cache_control: ephemeral`) → se escribe 1 vez por ráfaga, las piezas siguientes leen barato (verificado: cache_write 42.764 la 1ª, cache_read después). `SKILLS_DIR` override para EasyPanel.
- **Análisis diario (`marketing-worker/insights.mjs` + tabla `marketing_insights`):** 1×/día trae los posts publicados de LinkedIn de Buffer (query `Posts` status `sent`, con text + engagement por post), arma el ranking (qué rinde más/menos) y lo cachea en Supabase. Se inyecta en los prompts del worker Y en el motor `generar`. Verificado con datos reales: 40 posts, top = "Tu equipo te interrumpe 15 veces al día…" (6.85%). Migración `20260718121000_marketing_insights.sql`.
- **Nota:** el análisis usa la API de Buffer directo (misma key `BUFFER_API_KEY`); cubre lo que pedías de "leer Buffer + métricas 1×/día". La skill vakdor-metricas es el equivalente interactivo (mismo dato).

## ✅ Motor de voz humana (rama `feat/marketing-voz-humana`, prueba end-to-end ago-2026)

Antes, todas las piezas salían con el mismo molde (hook → fricción → quiebre → solución → prueba → CTA), lo que se notaba como "todo escrito por la misma fórmula". Ahora cada pieza sortea su propia forma de un banco de recursos, y pasa por una revisión antes de quedar lista.

- **Cómo ampliar el banco de escenas (sin tocar código ni redeployar):** el banco vive en la tabla `marketing_recursos` de Supabase. Para agregar una escena nueva alcanza con un `insert` directo:
  ```sql
  insert into marketing_recursos (tipo, titulo, detalle)
  values ('escena', 'Título corto de la escena', 'La situación concreta desarrollada en 1-2 frases, con un detalle específico (hora/día/tipo de propiedad).');
  ```
  Entra a la rotación automáticamente en el próximo ciclo del worker — no hace falta reiniciar nada. Lo mismo aplica para agregar una `estructura` o un `comentario` nuevos (con `clave` corta en minúsculas) o para editar el `canon` (fila única `tipo='canon'`). Para sacar una escena/estructura/comentario de circulación sin borrarla, poner `activo=false` en vez de borrar la fila (así no se pierde el historial de usos).
- **Qué significa cada campo de `receta`** (columna jsonb en `marketing_ideas`, se llena sola al procesar la idea):
  - `estructura`: la forma narrativa que usó esa pieza (una de las 8 del banco, ej. `confesion`, `contraste`).
  - `escenas`: los 2 ids de `marketing_recursos` (tipo `escena`) que sirvieron de apoyo.
  - `comentario_tipo`: el tipo del primer comentario (una de las 5 claves, ej. `pregunta_binaria`).
  - `modelo`: el modelo de IA que escribió la pieza (`claude-sonnet-5`).
  - `revision`: `{aprobado, reintentos, fallos}` — si `aprobado=true` y `reintentos=0`, pasó la revisión a la primera; si `reintentos=1`, falló algún punto de la rúbrica (los motivos están en `fallos`) y se reescribió una vez antes de quedar lista.
- **`ANTHROPIC_API_KEY` tiene que estar en 3 lugares** (si falta en cualquiera de los 3, esa parte del sistema no genera nada):
  1. **Local:** `.env` de PRISMA-SYSTEM (ya confirmado presente).
  2. **EasyPanel:** variables del servicio del worker de Marketing (pendiente de confirmar por Leo — no se puede chequear desde acá).
  3. **Vercel:** variables de entorno del proyecto (pendiente de confirmar por Leo). **Sin esta variable en Vercel + un redeploy, los botones "Desarrollar"/"Reformular" del panel fallan en producción** (son los que corren in-app, no en el worker).
- **Prueba end-to-end (ago-2026):** se insertaron 3 ideas de prueba (una por etapa del embudo) y se corrió el worker hasta procesarlas. Las 3 terminaron con contenido, portada y `receta` completos: 3 estructuras distintas, 6 escenas distintas (sin repetir entre piezas), 3 tipos de primer comentario distintos, y el link `vakdor.com/demostracion` apareció únicamente en el comentario de la pieza BOFU (nunca en un cuerpo de post). Detalle completo (texto de las 3 piezas + verificación punto por punto) en `docs/superpowers/sdd/2026-08-10-marketing-voz-humana/task-12-report.md`.

## ⚠️ Problemas conocidos (encontrados en la prueba end-to-end, no bloquean el uso normal)
- El worker intenta clasificar los posts de Buffer para el análisis diario de rendimiento, pero le falta pasar el cliente de IA en esa llamada puntual — falla en silencio en cada ciclo y el "ranking de qué rinde más" nunca se termina de armar. No afecta la generación de contenido ni las piezas de la prueba.
- En 2 de las 3 piezas de la prueba, que necesitaron una reescritura tras la revisión, el texto final quedó envuelto en tres comillas (`"""`) al principio y al final — un detalle a limpiar antes de publicar esas piezas puntuales, revisando el texto en el visor. No pasa en las piezas que aprueban a la primera.

## ⏭️ QUÉ FALTA (infra)
1. **Deploy del worker a EasyPanel** (always-on, sin depender de la PC de Leo) — **igual que el acm-extractor**: Dockerfile con base `mcr.microsoft.com/playwright`, instalar las deps (playwright/@anthropic-ai/sdk/@supabase/supabase-js/pdfkit/marked), env vars como secrets, `CMD ["node","watch.mjs"]`. El worker ya es host-agnóstico (logos data-URI, sin rutas absolutas en el render).
2. **Primer comentario LinkedIn automático:** requiere plan pago de Buffer. Decisión de Leo (por ahora se pega a mano).
3. **(Opcional) lead-magnet como document post** de LinkedIn: hoy va como texto+imagen (portada); se podría publicar el `magnet.pdf` como documento igual que el carrusel si conviene.

## Datos clave verificados (para no re-investigar)
- **Modelo Claude (ago-2026):** `claude-sonnet-5` (sin `temperature`/`top_p`/`top_k`, thinking adaptativo, `max_tokens` al techo de 8000 porque el thinking consume el mismo presupuesto que el texto visible). Antes era `claude-opus-4-8`.
- **Blog vakdor-app:** `PROJECT_URL` (=https://upggigryxdvcmnuwafyl.supabase.co) + `SERVICE_ROLE_SECRET`. Bucket público `blog-images`. URL pública: `{PROJECT_URL}/storage/v1/object/public/blog-images/<path>`.
- **Buffer LinkedIn:** POST `https://api.buffer.com/graphql`, `Authorization: Bearer BUFFER_API_KEY`. Mutación `createPost(input: CreatePostInput!)` → union `PostActionPayload` (`PostActionSuccess{post{id,status}}` / errores con `message`). Input: `channelId` (LinkedIn personal = `6a4aca1140483446287320b8`), `text`, `schedulingType:"automatic"`, `mode:"shareNow"` (ahora) / `"customScheduled"`+`dueAt` (programar), `assets:[{image:{url}}]`, `saveToDraft` (true=probar sin publicar), `metadata:{linkedin:{firstComment}}` (SOLO plan pago). `deletePost(input:{id})` para borrar.
- **Rama/deploy:** todo en `main` (mergeado desde `feat/marketing-pipeline`; main había avanzado con tracking/marketing-ia de otra sesión, merge fue limpio sin conflictos). Build OK. Repo privado `osterrietchleonardo-rgb/prisma-system`.

## Arquitectura (regla dura, para no volver a discutirla)
Todo lo que usa **skills reales o Playwright** (ideas, contenido fiel, imágenes de marca) corre **LOCAL** (worker) o en **EasyPanel** — NUNCA en Vercel. La app (Vercel) hace: tablero, develop rápido in-app (texto), publicar, calendario, cron. El worker/EasyPanel hace: contenido fiel + imágenes de marca.
