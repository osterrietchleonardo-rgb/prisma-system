# Setup y reglas técnicas — Motion en PRISMA

Stack de la app: **Next.js 14.2 (App Router), React 18.3, Tailwind 3.4, TypeScript**.

## 1) Instalación

```bash
npm install motion
```

- Paquete: `motion` (es la evolución de `framer-motion`; mismo equipo).
- Import SIEMPRE desde `"motion/react"` (no `"framer-motion"`).
- Copiar `motion-tokens.ts` de esta skill a `lib/motion.ts` del proyecto.

## 2) Reglas de Next.js App Router (CRÍTICO)

- **`"use client"`** obligatorio en todo archivo que importe `motion/react`. Motion anima en el
  navegador; en un Server Component tira error.
- Patrón recomendado: dejar las páginas/layouts como Server Components y mover SOLO la parte
  animada a un componente cliente chico (ej. `<Reveal>`, `<PropertyGrid>`). No convertir toda la
  página a cliente por una animación.
- Para transición entre rutas usar `template.tsx` (se remonta en cada navegación), no `layout.tsx`.

## 3) Performance (mantener 60fps)

- **Animá solo `transform` y `opacity`** siempre que puedas: `x`, `y`, `scale`, `rotate`, `opacity`.
  Corren en GPU y no recalculan layout.
- **Evitá animar `width`, `height`, `top`, `left`, `margin`**: disparan reflow y van con tirones.
  Para tamaño/posición que cambia, usá la prop **`layout`** (Motion lo hace con transform por detrás)
  o animá `scale`.
- Motion ya maneja `will-change` solo; no lo fuerces a mano.
- Listas largas: usá `key` estable (id, no índice) y considerá `AnimatePresence mode="popLayout"`.

## 4) Bundle size (opcional, si pesa) — LazyMotion + `m`

Si el peso importa, en vez de `motion.div` usá el componente `m` con `LazyMotion`, que carga las
features bajo demanda (reduce mucho el JS inicial).

```tsx
"use client";
import { LazyMotion, domAnimation, m } from "motion/react";

export function Box() {
  return (
    <LazyMotion features={domAnimation}>
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
    </LazyMotion>
  );
}
```
- `domAnimation` = animaciones + gestos (liviano). `domMax` = agrega layout + drag (más pesado).
- Regla: dentro de `LazyMotion` usar `m.*`, nunca `motion.*` (anularía el ahorro).

## 5) Accesibilidad

- El provider global (`MotionConfig reducedMotion="user"`, ver recipe 0) hace que la app respete
  "Reducir movimiento" del sistema: desactiva transforms/layout y deja solo opacidad/color.
- Para lógica a medida (ej. parallax, contadores) usar el hook `useReducedMotion()` y saltar al
  estado final.

## 6) Errores comunes a evitar

| Síntoma | Causa | Solución |
|---|---|---|
| "You're importing a component that needs useState…" o error de hooks | falta `"use client"` | agregarlo arriba del archivo |
| La salida no anima (desaparece de golpe) | falta `AnimatePresence` o `key` | envolver y poner `key` estable |
| Animación con tirones | se anima `width`/`height`/`left` | usar `transform`/`scale`/`layout` |
| Movimiento exagerado/poco serio | spring con bounce alto o distancias grandes | usar tokens de `lib/motion.ts` |
| Stagger no escalona | el contenedor no pasa `variants` a hijos | hijos con `variants` y sin `animate` propio |
