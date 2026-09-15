/**
 * Formatos y nombres legibles de Inteligencia Conversacional.
 *
 * Las categorías salen de los datos (15/9/2026: antes había listas fijas y "venta" o "triplex"
 * quedaban afuera). Acá solo se traduce la clave a un nombre para el director; lo que no está
 * en el mapa se muestra igual, con los guiones bajos cambiados por espacios.
 */

export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`)

export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("es-AR"))

const ETIQUETAS: Record<string, string> = {
  compra: "Compra",
  alquiler: "Alquiler",
  venta: "Venta",
  inversion: "Inversión",
  departamento: "Departamento",
  casa: "Casa",
  ph: "PH",
  duplex: "Dúplex",
  triplex: "Tríplex",
  local_comercial: "Local comercial",
  terreno: "Terreno",
  oficina: "Oficina",
  country: "Country",
  inmediata: "Inmediata (menos de 1 mes)",
  corto_plazo: "Corto plazo (1 a 3 meses)",
  medio_plazo: "Medio plazo (3 a 6 meses)",
  explorando: "Solo explorando",
  pareja_sin_hijos: "Pareja sin hijos",
  familia_con_hijos: "Familia con hijos",
  soltero: "Soltero/a",
  adulto_mayor_solo: "Adulto mayor solo",
  adultos_mayores_pareja: "Pareja de adultos mayores",
}

export function etiquetaCategoria(clave: string): string {
  const conocida = ETIQUETAS[clave.toLowerCase()]
  if (conocida) return conocida
  const t = clave.replace(/_/g, " ").trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Lunes primero, como se lee una semana de trabajo. */
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

/** Colores por posición para las categorías (sirven en claro y en oscuro). */
export const PALETA = ["#60a5fa", "#2dd4bf", "#f59e0b", "#a78bfa", "#fb7185", "#34d399", "#94a3b8", "#c084fc"]
