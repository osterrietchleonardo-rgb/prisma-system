// Recalcula todo lo que el mapa tiene PRECALCULADO: el catálogo de barrios del buscador,
// la cuadrícula de respaldo, el ranking de barrios y el precio por m² de cada manzana.
//
//   node scripts/refrescar-mapa.mjs
//
// Los PINES del mapa se leen de la base en vivo, así que una propiedad nueva aparece
// sola. Los COLORES y el ranking no: salen de estas cuatro tablas, y sin este recálculo
// se quedan con los números del día que se cargaron.
//
// POR QUÉ UN SCRIPT Y NO UN curl AL ENDPOINT DE LA APP
// Hasta el 21/8/2026 esto era un `curl` a /api/cron/mapa-refrescar, y falló las 10 veces
// que corrió. Dos motivos encadenados, los dos por el mismo camino equivocado:
//
//   1. El rol `authenticator` —el que usa PostgREST, o sea toda llamada que sale de la
//      app— tiene `session_preload_libraries=safeupdate`, que rechaza cualquier DELETE
//      sin WHERE. Las tres funciones abren vaciando su tabla. Error 21000, todos los días.
//
//   2. Destrabado eso, apareció el techo que estaba tapado abajo: ese mismo rol tiene
//      `statement_timeout=8s`. Medido el 21/8/2026 el recálculo tarda 7,8 s + 11,4 s +
//      20,4 s. Ninguna de las tres entra, y la más liviana pasa raspando.
//
// Ocho segundos es un límite pensado para que una pantalla no se cuelgue esperando, no
// para un recálculo de 90.000 celdas. Así que este trabajo no va por ahí: habla con la
// base por la Management API, igual que cargar-manzanas-pendientes.mjs, que es el otro
// workflow del mapa y el que sí viene funcionando.
//
// Las manzanas EN SÍ (mapa_manzanas) no se tocan acá: son las calles de OpenStreetMap y
// no cambian de un día para el otro. Se trazan aparte, en mapa-manzanas.yml.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function leerEnv() {
  const env = {}
  for (const linea of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  }
  return env
}

const env = leerEnv()
const REF = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0]

if (!REF || !env.SUPABASE_API_KEY_MANAGEMENT) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_API_KEY_MANAGEMENT en el .env")
  process.exit(1)
}

async function sql(consulta) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_API_KEY_MANAGEMENT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: consulta }),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`SQL ${r.status}: ${texto.slice(0, 400)}`)
  return JSON.parse(texto)
}

// En orden, no en paralelo: las tres pelean por la misma base y en paralelo se estorban.
// El catálogo de barrios va primero porque es del que se habla en el buscador.
const PASOS = [
  {
    nombre: "Catálogo de barrios del buscador",
    consulta: "SELECT refrescar_mapa_barrios() AS filas;",
    leer: (d) => `${d[0].filas} barrios`,
  },
  {
    nombre: "Cuadrícula de respaldo y ranking de barrios",
    consulta: "SELECT * FROM refrescar_precio_m2();",
    leer: (d) => `${d[0].celdas} celdas, ${d[0].barrios} barrios con precio`,
  },
  {
    nombre: "Precio por m² de cada manzana",
    consulta: "SELECT refrescar_precio_m2_manzanas() AS filas;",
    leer: (d) => `${d[0].filas} manzanas con precio`,
  },
]

const arranque = Date.now()
let fallo = false

for (const paso of PASOS) {
  const t0 = Date.now()
  try {
    const d = await sql(paso.consulta)
    const seg = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`OK   ${paso.nombre}: ${paso.leer(d)} (${seg}s)`)
  } catch (e) {
    const seg = ((Date.now() - t0) / 1000).toFixed(1)
    console.error(`FALLA ${paso.nombre} (${seg}s): ${e.message}`)
    fallo = true
    // Se sigue con los demás: que falle el ranking no es motivo para dejar las manzanas
    // sin recalcular. Al final el script termina en error igual.
  }
}

console.log(`\nTotal: ${((Date.now() - arranque) / 1000).toFixed(1)}s`)

// Si algo falló, el workflow tiene que fallar. Un cron que "termina bien" habiendo
// fallado deja los precios viejos sin que nadie se entere: eso fue lo que pasó 10 días.
if (fallo) process.exit(1)
