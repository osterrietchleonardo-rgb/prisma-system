# Módulo Marketing — Fase 2+: Motor local (2 pasos) + publicación automática

**Fecha:** 2026-07-16
**Depende de:** Fase 1 (rama `feat/marketing-pipeline`, tablero + tabla + reformular + generar provisional).
**Estado:** Diseño acordado con Leo (pendiente de su revisión antes de implementar).

## Por qué cambia respecto del spec original

El spec de Fase 1 asumía que el motor diario sería un **GitHub Action (nube) corriendo Claude Code con las skills reales**. Al aterrizarlo, apareció un bloqueo real: **las skills están hechas para la máquina local de Leo (Windows)** — rutas absolutas `C:\Users\LENOVO\...\Prisma - MK`, la `memoria.md` vive ahí, y `vakdor-carousel`/`Vakdor-LeadMagnet` usan **Playwright + disco local**. Un Action en Linux no tiene nada de eso, así que correr las skills *tal cual* en la nube se rompe.

**Decisión de Leo:** dispara a mano el motor local (usa sus skills y memoria de verdad). Lo que le importa que sea automático es **programar y publicar**.

## Regla dura de reparto

- **Todo lo que usa las skills reales o Playwright** (generar ideas, desarrollar contenido, hacer carruseles/PDFs) → **corre en la máquina de Leo** (ahí están las skills, `memoria.md` y Playwright).
- **Solo programar + publicar** (llamadas a Buffer y a la base del blog) → **automático en la nube** (cron Vercel).

## Arquitectura

```
┌─ MÁQUINA DE LEO — "motor local" (Claude Code + skills reales) ───────┐
│                                                                       │
│  DISPARO 1 — Generar ideas  (Leo lo corre cuando quiere)             │
│    • vakdor-metricas: Buffer (qué post rinde) + GA + Search Console  │
│    • vakdor-copywriter: ángulos/hooks nuevos, sin repetir            │
│      (lee memoria.md de Prisma-MK + ideas previas de la tabla)       │
│    → sube SOLO ideas (titulo, fuente, formato, angulo, gancho,       │
│      motivo con el fundamento) a Supabase (estado 'idea')            │
│                                                                       │
│         ── Leo revisa en el tablero y APRUEBA las que quiere ──      │
│                                                                       │
│  DISPARO 2 — Desarrollar aprobadas  (Leo lo corre después)          │
│    • lee de Supabase las ideas marcadas para desarrollo             │
│    • vakdor-copywriter: contenido completo al pie de la skill        │
│      (LinkedIn: copy + primer comentario + hashtags; blog: title/    │
│      slug/meta/keywords/content markdown)                            │
│    • vakdor-carousel / Vakdor-LeadMagnet: assets (Playwright → PDF/PNG)│
│    → actualiza contenido en Supabase + sube assets a Storage         │
│      + pasa la idea a 'en_revision'                                   │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
        App (tablero) — Leo revisa / reformula / aprueba / PROGRAMA
                               ▼
┌─ NUBE — automático (cron Vercel) ────────────────────────────────────┐
│  toma lo APROBADO + con `programada_para` <= ahora y PUBLICA:        │
│   • LinkedIn: Buffer (post + primer comentario)                      │
│   • Blog: fila en la base "vakdor app" (blog_posts, is_published)    │
│  → marca la idea 'publicada' + guarda `publicado_en`                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Cómo el motor local escribe en la app

Dos opciones (a decidir en el plan):
- **A) Supabase MCP** desde la sesión de Claude Code (lectura/escritura directa a `marketing_ideas` + Storage). Más simple, sin código nuevo en la app.
- **B) Endpoint `ingest`** en la app (`POST /api/admin-vakdor/marketing/ingest`, protegido con `CRON_SECRET`) que recibe el JSON de ideas/contenido y sube assets. Más controlado, reutiliza validaciones.

Recomendado: **A** para empezar (menos piezas), con opción de pasar a B si hace falta control.

## El "motor" en concreto

Cada disparo es un **comando de Claude Code** (`claude -p "<prompt del motor>"`) que Leo corre (doble clic a un `.bat`/`.cmd`, o un `npm run`). No es un script plano: es Claude manejando las skills. Se define el prompt exacto de Disparo 1 y Disparo 2, y las skills hacen el resto (leen memoria, aplican checklists, generan, suben a Supabase vía MCP).

## Cómo encaja el feedback de Leo

- **#2 (aviso al pasar idea→"en proceso"):** mover a "En proceso" = **marcar la idea para desarrollo**. El tablero muestra un aviso ("marcada para desarrollo — corré el Disparo 2 del motor"). El Disparo 2 lee las que están en ese estado, las desarrolla y las pasa a "En revisión".
- **#3 (fundamentos + skill al pie + no repetir):** lo resuelve el motor local, que corre las skills reales, lee `memoria.md` y trae Buffer + GA/Search como fundamento del `motivo` de cada idea.

## Sub-fases de implementación

1. **Motor local — Disparo 1 (ideas):** prompt del motor + escritura a Supabase (MCP) + `.cmd`/`npm run` para dispararlo. Reemplaza al "generar provisional" in-app por el real.
2. **App — marcar para desarrollo + calendario/programar:** aviso al pasar a "En proceso"; vista calendario; setear `programada_para`; filtros por fuente/formato/ángulo/estructura.
3. **Motor local — Disparo 2 (contenido + assets):** desarrolla aprobadas, sube assets a Storage, pasa a "En revisión".
4. **Nube — publicar:** cron Vercel que publica lo aprobado+programado (Buffer + blog "vakdor app"), marca `publicada`/`publicado_en`.

Cada sub-fase = su propio plan + implementación, probada en local, merge con OK de Leo.

## Verificación
- Disparo 1: correr el comando → aparecen ideas reales (con fundamento en el `motivo`) en el tablero, sin repetir ángulos previos.
- Disparo 2: aprobar 1-2, correr el comando → aparece el contenido completo + assets descargables.
- Publicar: idea aprobada+programada → el cron la postea a la hora (probado con una de prueba).

## Pendientes de Fase 1 (arrastrados)
- Commitear el fix de etiquetas (chips) — hecho en working tree, falta commit.
- `ANTHROPIC_API_KEY` ya está en `.env` (verificada); falta cargarla en **Vercel** para producción.
- Merge de `feat/marketing-pipeline` → main con OK de Leo.
