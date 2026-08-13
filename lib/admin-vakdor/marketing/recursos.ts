import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { CANON_FALLBACK } from "./voz"

export type TipoRecurso = "canon" | "estructura" | "escena" | "comentario"

export interface Recurso {
  id: string
  tipo: TipoRecurso
  clave: string | null
  titulo: string
  detalle: string
  usos: number
  ultimo_uso: string | null
}

/** Orden determinista: menos usados primero; a igual uso, el que hace más tiempo no se usa. */
function ordenar(a: Recurso, b: Recurso): number {
  if (a.usos !== b.usos) return a.usos - b.usos
  const ta = a.ultimo_uso ? Date.parse(a.ultimo_uso) : 0
  const tb = b.ultimo_uso ? Date.parse(b.ultimo_uso) : 0
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

/**
 * Elige `cantidad` recursos evitando los de `excluirIds`. Si al excluir no queda
 * ninguno, recicla los menos usados: nunca bloquea la generación de una pieza.
 */
export function elegirRecursos(candidatos: Recurso[], cantidad: number, excluirIds: string[]): Recurso[] {
  if (candidatos.length === 0) return []
  const excluir = new Set(excluirIds)
  const frescos = candidatos.filter((c) => !excluir.has(c.id))
  const pool = frescos.length > 0 ? frescos : candidatos
  return [...pool].sort(ordenar).slice(0, cantidad)
}

export async function traerRecursos(tipo: TipoRecurso): Promise<Recurso[]> {
  const { data, error } = await getAdminDb()
    .from("marketing_recursos")
    .select("id, tipo, clave, titulo, detalle, usos, ultimo_uso")
    .eq("tipo", tipo)
    .eq("activo", true)
  if (error) throw new Error(`traerRecursos(${tipo}): ${error.message}`)
  return (data ?? []) as Recurso[]
}

export async function marcarUsados(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = getAdminDb()
  const { data, error } = await db.from("marketing_recursos").select("id, usos").in("id", ids)
  if (error) {
    // No tiramos: una pieza ya escrita no debe morir porque no se pudo actualizar un contador.
    // Pero tiene que verse: si esto falla en silencio, la rotación deja de avanzar y el
    // generador vuelve a repetir estructuras y escenas sin dejar rastro.
    console.error(`marcarUsados(leer): ${error.message}`)
    return
  }
  const ahora = new Date().toISOString()
  const fallidos: string[] = []
  for (const fila of (data ?? []) as { id: string; usos: number }[]) {
    const { error: errUpdate } = await db
      .from("marketing_recursos")
      .update({ usos: fila.usos + 1, ultimo_uso: ahora })
      .eq("id", fila.id)
    if (errUpdate) fallidos.push(fila.id)
  }
  if (fallidos.length > 0) {
    console.error(`marcarUsados(escribir): fallaron ${fallidos.length}/${(data ?? []).length} recursos: ${fallidos.join(", ")}`)
  }
}

/** El canon vive en la base para poder editarlo sin deploy. Falla suave al fallback. */
export async function canonDeVoz(): Promise<string> {
  try {
    const filas = await traerRecursos("canon")
    return filas[0]?.detalle?.trim() || CANON_FALLBACK
  } catch {
    return CANON_FALLBACK
  }
}
