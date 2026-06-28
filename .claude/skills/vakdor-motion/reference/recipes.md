# Recetario Motion — PRISMA

Patrones listos para Next.js 14 App Router. **Regla #1:** todo componente que use Motion
necesita `"use client"` arriba (Motion corre en el cliente). **Regla #2:** importar siempre de
`motion/react` y usar los tokens de `lib/motion.ts` (no hardcodear duraciones).

---

## 0) Provider global (una vez) — respeta "reducir movimiento"

`MotionConfig reducedMotion="user"` hace que toda la app respete la preferencia del sistema
operativo del usuario (accesibilidad). Crear un provider cliente y montarlo en el layout raíz.

```tsx
// app/motion-provider.tsx
"use client";
import { MotionConfig } from "motion/react";
import { transition } from "@/lib/motion";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={transition.base}>
      {children}
    </MotionConfig>
  );
}
```
```tsx
// app/layout.tsx  ->  envolver {children} con <MotionProvider>
```

---

## 1) Scroll reveal (aparece al entrar en pantalla)

Para secciones del landing o tarjetas que aparecen al hacer scroll. `once: true` = anima una sola
vez; `amount` = cuánto del elemento debe verse para disparar.

```tsx
"use client";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/motion";

export function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
```

---

## 2) Lista/grilla con escalonado (stagger)

Para la grilla de propiedades, lista de leads, tabla de asesores. El contenedor escalona la
entrada de cada hijo.

```tsx
"use client";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";

export function PropertyGrid({ items }: { items: Property[] }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-3 gap-4"
    >
      {items.map((p) => (
        <motion.article key={p.id} variants={staggerItem} className="...">
          {/* card */}
        </motion.article>
      ))}
    </motion.div>
  );
}
```

---

## 3) Modal con entrada y salida (AnimatePresence)

`AnimatePresence` permite animar la SALIDA antes de desmontar. El hijo necesita `key` estable.

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { backdrop, scaleIn } from "@/lib/motion";

export function Modal({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          variants={backdrop}
          initial="hidden" animate="show" exit="exit"
          onClick={onClose}
          className="fixed inset-0 bg-black/60 grid place-items-center z-50"
        >
          <motion.div
            key="modal"
            variants={scaleIn}
            initial="hidden" animate="show" exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

## 4) Drawer lateral (detalle de lead / filtros)

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { backdrop, drawerRight } from "@/lib/motion";

export function Drawer({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" variants={backdrop} initial="hidden" animate="show" exit="exit"
            onClick={onClose} className="fixed inset-0 bg-black/50 z-40" />
          <motion.aside key="dw" variants={drawerRight} initial="hidden" animate="show" exit="exit"
            className="fixed right-0 top-0 h-full w-[420px] bg-white z-50 shadow-xl">
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

---

## 5) Botón / card interactiva (hover + tap)

```tsx
"use client";
import { motion } from "motion/react";
import { transition, tapScale, hoverLift } from "@/lib/motion";

export function ActionButton(props) {
  return (
    <motion.button
      whileHover={hoverLift}
      whileTap={tapScale}
      transition={transition.spring}
      className="px-5 py-2.5 rounded-lg bg-[#C07C41] text-white font-semibold"
      {...props}
    />
  );
}
```

---

## 6) Contador animado (métricas del dashboard)

Para que los números del panel "suban" hasta su valor. Usa `useMotionValue` + `animate` +
`useTransform`. Respeta reduced-motion saltando directo al valor final.

```tsx
"use client";
import { useEffect } from "react";
import { useMotionValue, useTransform, animate, useReducedMotion, motion } from "motion/react";

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString("es-AR") }) {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const text = useTransform(count, (v) => format(v));

  useEffect(() => {
    if (reduce) { count.set(value); return; }
    const controls = animate(count, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [value, reduce]);

  return <motion.span>{text}</motion.span>;
}
```

---

## 7) Transición de página (App Router)

`template.tsx` se remonta en cada navegación (a diferencia de `layout.tsx`), ideal para animar
el cambio de ruta. Ponerlo en el nivel que quieras animar (ej. `app/(director)/template.tsx`).

```tsx
// app/(director)/template.tsx
"use client";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}
```

---

## 8) Indicador de tab que se desliza (shared layout, `layoutId`)

Dos elementos con el mismo `layoutId` se animan entre sí automáticamente. Perfecto para el
subrayado de tabs/pestañas activas.

```tsx
"use client";
import { motion } from "motion/react";

export function Tabs({ tabs, active, onSelect }) {
  return (
    <div className="flex gap-2">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onSelect(t.id)} className="relative px-4 py-2">
          {t.label}
          {active === t.id && (
            <motion.div layoutId="tab-underline"
              className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#C07C41]" />
          )}
        </button>
      ))}
    </div>
  );
}
```

---

## 9) Acordeón / expandir-colapsar (animar altura con `layout`)

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";

export function Accordion({ open, children }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```
