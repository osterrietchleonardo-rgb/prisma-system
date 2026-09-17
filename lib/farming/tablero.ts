//
// Farming · las reglas del tablero, sin base de datos en el medio.
//
// Lo que convierte esto en un método y no en una lista de colores: **al mover una tarjeta hay
// que decir qué hiciste, cuál es el próximo paso y cuándo**. Sin la fecha no se guarda el
// movimiento (regla 4 del punto 9 del PDF). Y los nueve indicadores salen de lo que el asesor
// ya movió: el tablero ES el reporte, no hay una pantalla de carga de números.
import { ETAPAS, type EtapaDireccion } from "./direcciones"

/** Las seis del método. «descartada» existe, pero va al costado y no es una columna del flujo. */
export const COLUMNAS: EtapaDireccion[] = ["relevado", "presentado", "en_secuencia", "respondio", "tasacion", "captada"]

/** Los 15 valores que la base acepta, en el orden en que se usan de verdad. */
export const TIPOS_CONTACTO: { clave: string; etiqueta: string }[] = [
  { clave: "visita_encargado", etiqueta: "Visita al encargado" },
  { clave: "carta_1", etiqueta: "Carta 1" },
  { clave: "carta_2", etiqueta: "Carta 2" },
  { clave: "carta_3", etiqueta: "Carta 3" },
  { clave: "carta_4", etiqueta: "Carta 4" },
  { clave: "carta_5", etiqueta: "Carta 5" },
  { clave: "carta_6", etiqueta: "Carta 6" },
  { clave: "carta_7", etiqueta: "Carta 7" },
  { clave: "carta_otra", etiqueta: "Otra carta" },
  { clave: "llamada", etiqueta: "Llamada" },
  { clave: "whatsapp", etiqueta: "WhatsApp" },
  { clave: "email", etiqueta: "Email" },
  { clave: "tasacion", etiqueta: "Tasación" },
  { clave: "entrevista", etiqueta: "Entrevista" },
  { clave: "otro", etiqueta: "Otro" },
]

const CLAVES_TIPO = TIPOS_CONTACTO.map((t) => t.clave)
const CLAVES_ETAPA = ETAPAS.map((e) => e.clave) as string[]

/** Lo que uno suele hacer al llegar a esa etapa. Es una sugerencia: el desplegable tiene los 15. */
export function tipoSugerido(etapa: EtapaDireccion): string {
  switch (etapa) {
    case "relevado": return "visita_encargado"
    case "presentado": return "carta_1"
    case "en_secuencia": return "carta_otra"
    case "respondio": return "llamada"
    case "tasacion": return "tasacion"
    case "captada": return "entrevista"
    default: return "otro"
  }
}

export interface Movimiento {
  etapa_hasta: EtapaDireccion
  tipo: string
  nota?: string | null
  proxima_accion: string
  proxima_accion_en: string
  cartas_entregadas?: number | null
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Todos los problemas juntos, en criollo. Vacío = se puede guardar el movimiento. */
export function validarMovimiento(m: Partial<Movimiento>): string[] {
  const errores: string[] = []

  if (!m.etapa_hasta || !CLAVES_ETAPA.includes(m.etapa_hasta)) errores.push("Esa columna no existe.")
  if (!m.tipo || !CLAVES_TIPO.includes(m.tipo)) errores.push("Elegí qué hiciste.")
  if (!m.proxima_accion?.trim()) errores.push("Escribí cuál es el próximo paso.")

  // La regla que sostiene el método: sin fecha no hay movimiento. Una tarjeta sin próxima acción
  // con fecha es una tarjeta que se va a olvidar.
  const f = (m.proxima_accion_en || "").trim()
  if (!f) errores.push("Decinos para cuándo es el próximo paso.")
  else if (!ES_FECHA.test(f)) errores.push("Esa fecha no se entiende.")
  else {
    // JS Date silently rolls over (2026-02-30 → 2026-03-02), pero Postgres rechaza.
    // Rebuild and round-trip: si año/mes/día no coinciden, la fecha no es válida.
    const [year, month, day] = f.split("-").map(Number)
    const d = new Date(year, month - 1, day)
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) {
      errores.push("Esa fecha no se entiende.")
    }
  }

  if (m.cartas_entregadas != null && (!Number.isInteger(m.cartas_entregadas) || m.cartas_entregadas < 0)) {
    errores.push("Las cartas entregadas van como un número entero.")
  }

  return errores
}

export interface FilaIndicadores {
  tramo: string | null
  etapa: EtapaDireccion
  unidades_totales: number | null
  encargado_nombre: string | null
  contactos: { tipo: string; etapa_hasta: string | null }[]
}

export interface Indicadores {
  cuadras: number
  propiedades: number
  unidades: number
  contactos: number
  encargados: number
  respuestas: number
  tasaciones: number
  entrevistas: number
  captaciones: number
}

/**
 * Los nueve del punto 8 del PDF, sacados de lo que ya está cargado. Cada uno sale de una sola
 * pregunta, y ninguno se carga a mano.
 */
export function calcularIndicadores(filas: FilaIndicadores[]): Indicadores {
  const cuadras = new Set<string>()
  let unidades = 0, contactos = 0, encargados = 0, respuestas = 0, tasaciones = 0, entrevistas = 0, captaciones = 0

  for (const f of filas) {
    // Una cuadra sin nombre no es una cuadra: no se inventa un tramo vacío.
    if (f.tramo?.trim()) cuadras.add(f.tramo.trim())
    unidades += f.unidades_totales ?? 0
    contactos += f.contactos.length

    // El encargado cuenta cuando además lo fueron a ver: tener su nombre anotado no es haberlo
    // contactado.
    if (f.encargado_nombre?.trim() && f.contactos.some((c) => c.tipo === "visita_encargado")) encargados++

    // «Pasaron por respondió», no «están en respondió»: una que ya avanzó a tasación también
    // respondió, y el indicador mide el método, no la foto de hoy.
    if (f.contactos.some((c) => c.etapa_hasta === "respondio")) respuestas++

    tasaciones += f.contactos.filter((c) => c.tipo === "tasacion").length
    entrevistas += f.contactos.filter((c) => c.tipo === "entrevista").length
    if (f.etapa === "captada") captaciones++
  }

  return { cuadras: cuadras.size, propiedades: filas.length, unidades, contactos, encargados, respuestas, tasaciones, entrevistas, captaciones }
}
