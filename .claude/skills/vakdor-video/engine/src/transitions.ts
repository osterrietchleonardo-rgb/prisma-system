// transitions.ts — Presets de transiciones para el motor Vakdor-Video.
// Usa @remotion/transitions (ya instalada en package.json pero no se usaba).
// Importar estos presets en cualquier composición para transiciones entre Sequences.
//
// Ejemplo de uso en una composición:
//   import { TransitionSeries } from "@remotion/transitions";
//   import { TRANSITIONS } from "./transitions";
//   <TransitionSeries>
//     <TransitionSeries.Sequence durationInFrames={60}>
//       <SceneA />
//     </TransitionSeries.Sequence>
//     <TransitionSeries.Transition
//       presentation={TRANSITIONS.slide.presentation}
//       timing={TRANSITIONS.slide.timing}
//     />
//     <TransitionSeries.Sequence durationInFrames={60}>
//       <SceneB />
//     </TransitionSeries.Sequence>
//   </TransitionSeries>

import { springTiming, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";

// Duraciones estandar en frames (a 30fps)
const FAST = 10; //  ~0.33s
const NORMAL = 18; // ~0.60s
const SLOW = 28; //  ~0.93s
const CINEMATIC = 40; // ~1.33s

// --- Presets listos para usar ---

export const TRANSITIONS = {
  // Slide: la escena nueva empuja a la anterior
  slide: {
    presentation: slide(),
    timing: springTiming({ config: { damping: 200 }, durationInFrames: NORMAL }),
  },
  slideLeft: {
    presentation: slide({ direction: "from-left" }),
    timing: springTiming({ config: { damping: 200 }, durationInFrames: NORMAL }),
  },
  slideUp: {
    presentation: slide({ direction: "from-bottom" }),
    timing: springTiming({ config: { damping: 200 }, durationInFrames: NORMAL }),
  },
  slideDown: {
    presentation: slide({ direction: "from-top" }),
    timing: springTiming({ config: { damping: 200 }, durationInFrames: NORMAL }),
  },

  // Fade: crossfade suave entre escenas
  fade: {
    presentation: fade(),
    timing: linearTiming({ durationInFrames: NORMAL }),
  },
  fadeSlow: {
    presentation: fade(),
    timing: linearTiming({ durationInFrames: SLOW }),
  },
  fadeCinematic: {
    presentation: fade(),
    timing: linearTiming({ durationInFrames: CINEMATIC }),
  },

  // Wipe: barrido de una escena a otra
  wipe: {
    presentation: wipe(),
    timing: linearTiming({ durationInFrames: NORMAL }),
  },
  wipeLeft: {
    presentation: wipe({ direction: "from-left" }),
    timing: linearTiming({ durationInFrames: NORMAL }),
  },
  wipeUp: {
    presentation: wipe({ direction: "from-bottom-to-top" }),
    timing: linearTiming({ durationInFrames: NORMAL }),
  },

  // Flip: la escena gira y muestra la siguiente
  flip: {
    presentation: flip(),
    timing: springTiming({ config: { damping: 200 }, durationInFrames: SLOW }),
  },

  // ClockWipe: barrido circular tipo reloj
  clockWipe: {
    presentation: clockWipe(),
    timing: linearTiming({ durationInFrames: SLOW }),
  },
  clockWipeFast: {
    presentation: clockWipe(),
    timing: linearTiming({ durationInFrames: FAST }),
  },
} as const;

// Helper: elegir una transicion por nombre (util para props dinamicos)
export type TransitionName = keyof typeof TRANSITIONS;
export const getTransition = (name: TransitionName) => TRANSITIONS[name];

// Helper: transicion aleatoria (para variedad visual)
export const randomTransition = () => {
  const keys = Object.keys(TRANSITIONS) as TransitionName[];
  return TRANSITIONS[keys[Math.floor(Math.random() * keys.length)]];
};
