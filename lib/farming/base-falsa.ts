// lib/farming/base-falsa.ts
//
// DOBLE DE PRUEBA. Un cliente de Supabase en memoria, con lo justo que usan los endpoints de
// Farming: from().select().eq().neq().in().order().limit().single().maybeSingle(), insert(),
// update(), delete(), upsert(). Es thenable, como el real. No toca red.
//
// Solo lo importan los *.test.ts: no va a producción.

type Fila = Record<string, any>
type Predicado = (f: Fila) => boolean
type OpcionesUpsert = { onConflict?: string; ignoreDuplicates?: boolean }

export function baseFalsa(inicial: Record<string, Fila[]>, rpcs: Record<string, (args: any) => Fila[]> = {}) {
  const tablas: Record<string, Fila[]> = JSON.parse(JSON.stringify(inicial))
  let siguienteId = 1

  function from(tabla: string) {
    const filas = () => (tablas[tabla] ??= [])
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select"
    let carga: any = null
    let opcionesUpsert: OpcionesUpsert = {}
    const filtros: Predicado[] = []
    let orden: { col: string; asc: boolean } | null = null
    let tope: number | null = null
    let unico = false
    let quizas = false
    let pedirCuenta = false
    let soloCabecera = false

    const q: any = {
      select: (_cols?: string, opciones?: { count?: "exact"; head?: boolean }) => {
        pedirCuenta = opciones?.count === "exact"
        soloCabecera = !!opciones?.head
        return q
      },
      insert: (f: any) => { op = "insert"; carga = f; return q },
      update: (p: any) => { op = "update"; carga = p; return q },
      delete: () => { op = "delete"; return q },
      upsert: (f: any, o?: OpcionesUpsert) => { op = "upsert"; carga = f; opcionesUpsert = o || {}; return q },
      eq: (c: string, v: any) => { filtros.push((f) => f[c] === v); return q },
      neq: (c: string, v: any) => { filtros.push((f) => f[c] !== v); return q },
      in: (c: string, vs: any[]) => { filtros.push((f) => vs.includes(f[c])); return q },
      order: (c: string, o?: { ascending?: boolean }) => { orden = { col: c, asc: o?.ascending !== false }; return q },
      limit: (n: number) => { tope = n; return q },
      single: () => { unico = true; return q },
      maybeSingle: () => { unico = true; quizas = true; return q },
      // `count` viaja igual que en el cliente real cuando se pidió con `{ count: "exact" }`:
      // sin declararlo acá, el `resolve({ data, count, error })` de más abajo no compila.
      then: (resolve: (r: { data: any; count?: number | null; error: any }) => void) => {
        const pasa = (f: Fila) => filtros.every((p) => p(f))
        let res: Fila[]
        let count: number | null = null
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
        } else if (op === "upsert") {
          // ON CONFLICT DO NOTHING (con ignoreDuplicates:true): si ya existe una fila con las
          // mismas columnas de onConflict, no se toca ni se duplica; si no existe, se inserta.
          const columnas = (opcionesUpsert.onConflict || "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
          const nuevas = Array.isArray(carga) ? carga : [carga]
          res = []
          for (const nueva of nuevas) {
            const existente = columnas.length
              ? filas().find((f) => columnas.every((c) => f[c] === nueva[c]))
              : undefined
            if (existente) {
              if (!opcionesUpsert.ignoreDuplicates) Object.assign(existente, nueva)
              res.push(existente)
            } else {
              const fila: Fila = { id: `id-${siguienteId++}`, created_at: new Date().toISOString(), ...nueva }
              filas().push(fila)
              res.push(fila)
            }
          }
        } else {
          res = filas().filter(pasa)
          // select(..., { count: "exact" }) cuenta las filas que pasaron el filtro, ANTES del
          // límite — como el real: un `.limit()` no achica el total, solo lo que viaja.
          count = pedirCuenta ? res.length : null
          if (orden) {
            const { col, asc } = orden
            res = [...res].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
          }
          if (tope !== null) res = res.slice(0, tope)
        }
        // Con head:true no viajan filas, solo el número (como el real).
        const data = soloCabecera ? null : unico ? (res[0] ?? null) : res
        const error = unico && !quizas && !data ? { message: "no rows", code: "PGRST116" } : null
        return resolve({ data, count, error })
      },
    }
    return q
  }

  /** Las funciones SQL: el doble no ejecuta SQL, devuelve lo que el test programó.
   *  Igual que el cliente real, responde { data, error } y nunca tira. */
  async function rpc(fn: string, args: any) {
    const impl = rpcs[fn]
    if (!impl) return { data: null, error: { message: `rpc desconocida: ${fn}` } }
    return { data: impl(args), error: null }
  }

  return { from, rpc, tablas }
}
