// lib/farming/base-falsa.ts
//
// DOBLE DE PRUEBA. Un cliente de Supabase en memoria, con lo justo que usan los endpoints de
// Farming: from().select().eq().neq().in().order().limit().single().maybeSingle(), insert(),
// update(), delete(). Es thenable, como el real. No toca red.
//
// Solo lo importan los *.test.ts: no va a producción.

type Fila = Record<string, any>
type Predicado = (f: Fila) => boolean

export function baseFalsa(inicial: Record<string, Fila[]>) {
  const tablas: Record<string, Fila[]> = JSON.parse(JSON.stringify(inicial))
  let siguienteId = 1

  function from(tabla: string) {
    const filas = () => (tablas[tabla] ??= [])
    let op: "select" | "insert" | "update" | "delete" = "select"
    let carga: any = null
    const filtros: Predicado[] = []
    let orden: { col: string; asc: boolean } | null = null
    let tope: number | null = null
    let unico = false
    let quizas = false

    const q: any = {
      select: () => q,
      insert: (f: any) => { op = "insert"; carga = f; return q },
      update: (p: any) => { op = "update"; carga = p; return q },
      delete: () => { op = "delete"; return q },
      eq: (c: string, v: any) => { filtros.push((f) => f[c] === v); return q },
      neq: (c: string, v: any) => { filtros.push((f) => f[c] !== v); return q },
      in: (c: string, vs: any[]) => { filtros.push((f) => vs.includes(f[c])); return q },
      order: (c: string, o?: { ascending?: boolean }) => { orden = { col: c, asc: o?.ascending !== false }; return q },
      limit: (n: number) => { tope = n; return q },
      single: () => { unico = true; return q },
      maybeSingle: () => { unico = true; quizas = true; return q },
      then: (resolve: (r: { data: any; error: any }) => void) => {
        const pasa = (f: Fila) => filtros.every((p) => p(f))
        let res: Fila[]
        if (op === "insert") {
          const nuevas = (Array.isArray(carga) ? carga : [carga]).map((f: Fila) => ({
            id: `id-${siguienteId++}`,
            created_at: new Date().toISOString(),
            ...f,
          }))
          filas().push(...nuevas)
          res = nuevas
        } else if (op === "update") {
          res = filas().filter(pasa)
          for (const f of res) Object.assign(f, carga)
        } else if (op === "delete") {
          res = filas().filter(pasa)
          tablas[tabla] = filas().filter((f) => !res.includes(f))
        } else {
          res = filas().filter(pasa)
          if (orden) {
            const { col, asc } = orden
            res = [...res].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
          }
          if (tope !== null) res = res.slice(0, tope)
        }
        const data = unico ? (res[0] ?? null) : res
        const error = unico && !quizas && !data ? { message: "no rows", code: "PGRST116" } : null
        return resolve({ data, error })
      },
    }
    return q
  }

  return { from, tablas }
}
