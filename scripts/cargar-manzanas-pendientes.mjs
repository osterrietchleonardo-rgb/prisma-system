// Traza las manzanas que le faltan al mapa, guiado por DONDE ESTAN LAS PROPIEDADES.
//
//   node scripts/cargar-manzanas-pendientes.mjs [cuantas]
//
// No hay que decirle que zona cargar: le pregunta a la base cuales de sus propiedades
// todavia no caen dentro de ninguna manzana trazada, las agrupa en baldosas y trabaja esa
// lista, empezando por donde hay mas propiedades esperando. Si manana la red publica en
// un pueblo nuevo, esa baldosa aparece sola en la lista.
//
// POR QUE DE A TANDAS Y NO TODAS DE UNA
// Overpass es un servicio comunitario y gratuito: contesta 429 si se lo golpea seguido
// (paso al cargar CABA). Medido el 2026-08-11 habia 2.071 baldosas pendientes; a una cada
// ~20 segundos serian mas de 11 horas seguidas. Se hace de a tandas todas las noches y el
// mapa se completa solo en unas semanas, arrancando por lo que mas se usa.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const POR_TANDA = Number(process.argv[2]) || 80
const MARGEN = 0.006
const ESPERA_MS = 4000
const REINTENTOS = 4

const TIPOS =
  "motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian"

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
  if (!r.ok) throw new Error(`SQL ${r.status}: ${texto.slice(0, 200)}`)
  return JSON.parse(texto)
}

async function bajarCalles(sur, oeste, norte, este) {
  const consulta = `[out:json][timeout:180];
way["highway"~"^(${TIPOS})$"](${sur},${oeste},${norte},${este});
out geom;`

  let d = null
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "PRISMA-mapa/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(consulta),
      })
      if (r.ok) { d = await r.json(); break }
      if (r.status !== 429 && r.status !== 504) throw new Error(`Overpass ${r.status}`)
    } catch (e) {
      if (intento === REINTENTOS) throw e
    }
    await new Promise((res) => setTimeout(res, 15000 * intento))
  }
  if (!d) throw new Error("Overpass no contesto")

  return (d.elements || [])
    .filter((el) => el.geometry && el.geometry.length >= 2)
    .map((el) => "LINESTRING(" + el.geometry.map((p) => `${p.lon} ${p.lat}`).join(",") + ")")
}

// El intento se anota SIEMPRE, salga bien o mal. Una baldosa rural donde OSM no tiene
// calles se pediria todas las noches para siempre; a la tercera se deja de insistir.
async function anotarIntento(zona, manzanas) {
  await sql(`
    INSERT INTO mapa_baldosas_intentos (zona, intentos, manzanas, ultimo)
    VALUES ('${zona}', 1, ${manzanas}, now())
    ON CONFLICT (zona) DO UPDATE
      SET intentos = mapa_baldosas_intentos.intentos + 1,
          manzanas = EXCLUDED.manzanas,
          ultimo = now()
  `)
}

const pendientes = await sql(`SELECT * FROM mapa_baldosas_pendientes(${POR_TANDA})`)
if (pendientes.length === 0) {
  console.log("No hay baldosas pendientes: el mapa ya cubre todas las propiedades.")
  process.exit(0)
}

const [{ total }] = await sql(
  "SELECT count(*)::int AS total FROM mapa_baldosas_pendientes(1000000)",
)
console.log(`Pendientes: ${total}. Esta tanda: ${pendientes.length}.\n`)

let trazadas = 0
for (let i = 0; i < pendientes.length; i++) {
  const b = pendientes[i]
  try {
    const lineas = await bajarCalles(
      b.sur - MARGEN, b.oeste - MARGEN, b.norte + MARGEN, b.este + MARGEN,
    )
    if (lineas.length < 20) {
      console.log(`  ${b.zona} (${b.propiedades} props): ${lineas.length} calles, sin trama urbana`)
      await anotarIntento(b.zona, 0)
    } else {
      const valores = lineas.map((l) => `('${l}')`).join(",")
      const [fila] = await sql(`
        CREATE TEMP TABLE _calles_cargadas (geom geometry(LineString,4326)) ON COMMIT DROP;
        INSERT INTO _calles_cargadas (geom)
          SELECT ST_GeomFromText(w, 4326) FROM (VALUES ${valores}) v(w);
        SELECT armar_manzanas('${b.zona}', ${b.sur}, ${b.oeste}, ${b.norte}, ${b.este}) AS manzanas;
      `)
      trazadas += fila.manzanas
      console.log(`  ${b.zona} (${b.propiedades} props): ${lineas.length} calles -> ${fila.manzanas} manzanas`)
      await anotarIntento(b.zona, fila.manzanas)
    }
  } catch (e) {
    console.error(`  ${b.zona}: FALLO -> ${e.message}`)
    await anotarIntento(b.zona, 0).catch(() => {})
  }
  if (i < pendientes.length - 1) await new Promise((r) => setTimeout(r, ESPERA_MS))
}

console.log(`\n${trazadas} manzanas nuevas. Recalculando el precio por m2...`)
const [r] = await sql("SELECT refrescar_precio_m2_manzanas() AS filas")
console.log(`Manzanas con precio: ${r.filas}`)

const [{ total: quedan }] = await sql(
  "SELECT count(*)::int AS total FROM mapa_baldosas_pendientes(1000000)",
)
console.log(`Quedan pendientes: ${quedan}`)
