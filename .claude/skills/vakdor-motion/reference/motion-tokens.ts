// ============================================================================
// PRISMA — Lenguaje de movimiento (Vakdor)
// ----------------------------------------------------------------------------
// Copiar este archivo al proyecto como `lib/motion.ts` y SIEMPRE animar usando
// estos tokens (no inventar duraciones/easings sueltos por componente).
// El movimiento de PRISMA es: sobrio, premium, rápido y con propósito.
// NO usar rebotes exagerados, giros ni efectos llamativos: transmite "software
// serio y caro", no "plantilla animada".
//
// Requiere: npm install motion   (import desde "motion/react")
// ============================================================================
import type { Variants, Transition } from "motion/react";

// --- Duraciones (segundos) -------------------------------------------------
export const duration = {
  fast: 0.15, //  microinteracciones (hover, tap, toggles)
  base: 0.25, //  entradas/salidas estándar (cards, paneles)
  slow: 0.4, //   transiciones de página / overlays grandes
} as const;

// --- Easings (curvas) ------------------------------------------------------
// easeOutExpo-ish: arranca rápido y desacelera suave. Es la curva "firma" de PRISMA.
export const ease = {
  out: [0.22, 1, 0.36, 1] as const, //  entradas (lo más usado)
  inOut: [0.65, 0, 0.35, 1] as const, // movimientos simétricos
  in: [0.5, 0, 0.75, 0] as const, //     salidas
};

// --- Transiciones reutilizables -------------------------------------------
export const transition = {
  // Tween estándar para opacidad/posición.
  base: { duration: duration.base, ease: ease.out } as Transition,
  fast: { duration: duration.fast, ease: ease.out } as Transition,
  slow: { duration: duration.slow, ease: ease.out } as Transition,
  // Spring suave para elementos interactivos (botones, drag, layout).
  spring: { type: "spring", stiffness: 400, damping: 32, mass: 0.8 } as Transition,
  // Spring más blando para paneles/drawers.
  springSoft: { type: "spring", stiffness: 260, damping: 30 } as Transition,
};

// Desplazamiento de entrada chico (px). Sobrio: nunca grandes saltos.
const RISE = 12;

// ============================================================================
// VARIANTS LISTOS
// ============================================================================

// Aparecer subiendo (la entrada por defecto de PRISMA: cards, secciones).
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: RISE },
  show: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: RISE, transition: transition.fast },
};

// Aparecer sin moverse (texto, badges).
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

// Escalar al entrar (modales, popovers, tooltips).
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: transition.base },
  exit: { opacity: 0, scale: 0.96, transition: transition.fast },
};

// Contenedor que escalona a sus hijos (listas, grillas de propiedades).
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

// Hijo de un staggerContainer (cada fila/card de la lista).
export const staggerItem: Variants = fadeInUp;

// Drawer/panel lateral (entra desde la derecha). Ej: detalle de lead, filtros.
export const drawerRight: Variants = {
  hidden: { x: "100%" },
  show: { x: 0, transition: transition.springSoft },
  exit: { x: "100%", transition: { duration: duration.base, ease: ease.in } },
};

// Backdrop/overlay oscuro detrás de modales y drawers.
export const backdrop: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.fast },
  exit: { opacity: 0, transition: transition.fast },
};

// Gestos de interacción estándar (botones, cards clickeables).
export const tapScale = { scale: 0.97 };
export const hoverLift = { y: -2 };
