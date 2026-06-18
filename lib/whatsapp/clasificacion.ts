// =============================================
// Clasificación de origen del lead (WhatsApp)
// Fuente única de verdad para valores, etiquetas y colores.
// Usado en: Leads WhatsApp, solapa Contactos y bandeja de chats.
// =============================================

export const CLASIFICACION_CONSULTA = "Whatsapp-Consulta"
export const CLASIFICACION_MANUAL = "Whatsapp-Manual"

/** Etiqueta que se muestra cuando el lead no tiene clasificación (NULL). */
export const CLASIFICACION_SIN = "Sin clasificar"

// Colores fijos para las clasificaciones automáticas.
const KNOWN_STYLES: Record<string, string> = {
  [CLASIFICACION_CONSULTA]:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  [CLASIFICACION_MANUAL]:
    "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
}

const SIN_STYLE =
  "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20"

// Paleta para clasificaciones personalizadas (importadas). Se elige de forma
// determinística según el texto, así cada base importada mantiene su color.
const CUSTOM_PALETTE = [
  "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
]

function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export interface ClasificacionStyle {
  /** Texto a mostrar en el badge. */
  label: string
  /** Clases tailwind para el badge (bg/text/border). */
  className: string
  /** true si el lead no tiene clasificación. */
  isEmpty: boolean
}

/** Devuelve la etiqueta y el color para una clasificación (o "Sin clasificar"). */
export function getClasificacionStyle(
  value: string | null | undefined
): ClasificacionStyle {
  const clean = (value ?? "").trim()
  if (!clean) {
    return { label: CLASIFICACION_SIN, className: SIN_STYLE, isEmpty: true }
  }
  if (KNOWN_STYLES[clean]) {
    return { label: clean, className: KNOWN_STYLES[clean], isEmpty: false }
  }
  const className = CUSTOM_PALETTE[hashString(clean) % CUSTOM_PALETTE.length]
  return { label: clean, className, isEmpty: false }
}
