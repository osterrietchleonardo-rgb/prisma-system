import { useCallback, useMemo, useState } from "react"

export type DireccionOrden = "asc" | "desc"

export interface OrdenTabla<K extends string> {
  clave: K
  dir: DireccionOrden
}

export type ValorOrdenable = string | number | null | undefined

/**
 * Orden por columna para una tabla: un clic ordena de menor a mayor, el segundo de mayor a
 * menor y el tercero vuelve al orden original (el que llegó). Los vacíos van siempre al final,
 * así una columna oculta o sin dato no se mezcla con los números reales. A igual valor se
 * respeta el orden original, para que la tabla no "salte" entre clics.
 *
 * `valor` tiene que ser estable (useCallback o una función fuera del componente).
 */
export function useOrdenTabla<T, K extends string>(filas: T[], valor: (fila: T, clave: K) => ValorOrdenable) {
  const [orden, setOrden] = useState<OrdenTabla<K> | null>(null)

  const ordenadas = useMemo(() => {
    if (!orden) return filas
    const factor = orden.dir === "asc" ? 1 : -1
    return filas
      .map((fila, i) => ({ fila, i, v: valor(fila, orden.clave) }))
      .sort((a, b) => {
        const aVacio = a.v === null || a.v === undefined || a.v === ""
        const bVacio = b.v === null || b.v === undefined || b.v === ""
        if (aVacio || bVacio) return aVacio && bVacio ? a.i - b.i : aVacio ? 1 : -1
        const cmp =
          typeof a.v === "number" && typeof b.v === "number"
            ? a.v - b.v
            : String(a.v).localeCompare(String(b.v), "es", { sensitivity: "base", numeric: true })
        return cmp !== 0 ? cmp * factor : a.i - b.i
      })
      .map((x) => x.fila)
  }, [filas, orden, valor])

  const alternar = useCallback((clave: K) => {
    setOrden((o) =>
      !o || o.clave !== clave ? { clave, dir: "asc" } : o.dir === "asc" ? { clave, dir: "desc" } : null
    )
  }, [])

  const restablecer = useCallback(() => setOrden(null), [])

  return { ordenadas, orden, alternar, restablecer }
}
