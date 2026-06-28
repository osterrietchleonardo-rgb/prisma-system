---
name: vakdor-motion
description: Experto en animar la APP PRISMA con Motion (motion/react, ex Framer Motion) en Next.js 14 App Router. Usar SIEMPRE que se pida animar/dar movimiento a la interfaz: transiciones, aparición de cards/listas, modales y drawers con entrada/salida, hover/tap de botones, contadores del dashboard, scroll reveal, transición entre páginas, tabs, acordeones. Triggerea con "animá", "animación", "transición", "que aparezca suave", "darle movimiento", "motion", "framer". NO es para crear videos (eso es vakdor-video) ni piezas de marketing (eso es vakdor-carousel/video): esta skill toca el CÓDIGO de la app.
---

# Vakdor Motion — Animar la app PRISMA (Motion / Next.js)

Skill experta para darle a PRISMA una sensación de **producto premium** mediante micro-animaciones
e interacciones con **Motion** (`motion/react`). A diferencia de las skills de marketing, esta
**modifica el código de la app** (`PRISMA-SYSTEM`), no genera nada en `Prisma - MK`.

## Qué es y qué NO es
- ✅ Anima la INTERFAZ que usan asesores y directores (dashboards, listas, modales, navegación).
- ❌ NO hace videos (→ `vakdor-video`) ni imágenes/carruseles (→ `vakdor-carousel`).
- 🎯 Objetivo de negocio: que PRISMA **se sienta caro y serio** → más fácil de vender y retener.

## Filosofía de movimiento de PRISMA (no negociable)
El movimiento es **sobrio, rápido y con propósito**. NUNCA rebotes exagerados, giros, parpadeos ni
animaciones que distraen del trabajo. Si una animación no aporta claridad o pulido, no va.
Toda animación sale de los **tokens de marca** (`lib/motion.ts`), no de valores inventados sueltos.

---

## Modo de trabajo (igual que el resto del repo)

Esta skill cambia código de la app, así que sigue el flujo del proyecto: **rama → probar en local
→ OK de Leonardo → merge**. No mergear a `main` sin su OK. (Motion **todavía no está instalado** en
la app; la primera vez hay que `npm install motion`.)

---

## Flujo al invocar

### Paso 1 — Entender qué animar y elegir patrón
Identificar el componente/flujo y mapearlo a una receta de `reference/recipes.md`:

| Lo que pide el usuario | Receta |
|---|---|
| "que las cards aparezcan suave" | Scroll reveal (1) / Stagger (2) |
| "que la lista entre escalonada" | Stagger (2) |
| "modal/popup con animación" | Modal + AnimatePresence (3) |
| "panel lateral de detalle" | Drawer (4) |
| "botones más vivos" | Hover/Tap (5) |
| "que los números del dashboard suban" | CountUp (6) |
| "transición al cambiar de página" | Template App Router (7) |
| "subrayado de tab que se desliza" | layoutId (8) |
| "expandir/colapsar" | Acordeón (9) |

Si no encaja en ninguna, combinar tokens de `lib/motion.ts` siguiendo la misma filosofía.

### Paso 2 — Asegurar el setup (idempotente)
Verificar / hacer una sola vez (ver `reference/setup.md`):
1. `npm install motion` si no está en `package.json`.
2. Copiar `reference/motion-tokens.ts` → `lib/motion.ts` del proyecto (si no existe).
3. Montar el provider global de accesibilidad (`MotionConfig reducedMotion="user"`, recipe 0) en
   el layout raíz, si no está.

### Paso 3 — Implementar
- Crear/editar el componente **cliente** (`"use client"` arriba; import de `motion/react`).
- Mantener páginas/layouts como Server Components; aislar lo animado en un componente cliente chico.
- Usar SIEMPRE los variants/transitions de `lib/motion.ts`.
- Animar **solo `transform`/`opacity`** (o `layout`); nunca `width/height/top/left` a mano.
- Contemplar reduced-motion (el provider ya cubre lo general; lógica a medida usa `useReducedMotion`).

### Paso 4 — Probar de verdad (no teórico)
- Levantar `npm run dev` y verificar la animación en el navegador (Claude levanta el dev y entrega
  el link). Comprobar también que no rompa el build (`npm run build` si se tocó algo estructural).
- Revisar que respete "reducir movimiento" del sistema.

### Paso 5 — Cierre
- Si corresponde, actualizar la doc técnica del proyecto.
- Dejar la rama lista y pedir OK para merge.

---

## Material de referencia (leer antes de implementar)
- **`reference/motion-tokens.ts`** — el lenguaje de movimiento (duraciones, easings, transitions y
  variants listos). Es la FUENTE de todo. Se copia a `lib/motion.ts`.
- **`reference/recipes.md`** — recetario de 10 patrones con código verificado para App Router.
- **`reference/setup.md`** — instalación, reglas de Next.js (`"use client"`), performance (qué
  animar y qué no, LazyMotion), accesibilidad y errores comunes.

## Decisión: ¿conviene animar esto?
- ✅ Sí: entradas de contenido, feedback de interacción, cambios de estado (abrir/cerrar), navegación.
- ❌ No: tablas de datos densas en pleno uso, elementos que cambian muy seguido, nada que retrase
  una acción del usuario. Ante la duda, **menos es más**: una animación de 0.2s bien puesta vale
  más que diez efectos.

## Licencia
Motion es **MIT (gratis)**, sin límites de equipo. (No confundir con la licencia de Remotion de
`vakdor-video`.)
