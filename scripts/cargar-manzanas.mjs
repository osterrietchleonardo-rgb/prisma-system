// Carga las manzanas REALES de una zona: baja las calles de OpenStreetMap, las cruza y
// cierra los poligonos que encierran.
//
//   node scripts/cargar-manzanas.mjs caba
//   node scripts/cargar-manzanas.mjs --zona "belgrano" --sur -34.58 --oeste -58.47 --norte -34.55 --este -58.43
//
// POR QUE POR BALDOSAS Y NO TODO JUNTO
// ST_Node cruza cada calle contra todas las demas: es cuadratico. Sobre CABA entera son
// decenas de miles de calles y la base se queda sin tiempo. Por baldosas de ~0,04 grados
// cada tanda es de 1.000 a 2.000 calles, que es lo que se midio andando bien.
//
// POR QUE CADA BALDOSA SE BAJA MAS GRANDE DE LO QUE GUARDA
// Una manzana del borde necesita la calle del otro lado para quedar cerrada. Si se baja
// justo, esas manzanas quedan abiertas y ST_Polygonize las funde en un poligono enorme.
// Se baja con MARGEN y despues se guardan solo las manzanas cuyo centro cae adentro de la
// baldosa, asi ninguna se cuenta dos veces.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// Recuadros conocidos. El de CABA se estiro hasta el norte del conurbano porque ahi esta
// buena parte del inventario (Vicente Lopez, Olivos, San Isidro).
// Los recuadros salen de MEDIR donde esta el inventario sin manzana, no de adivinar:
//   SELECT neighborhood, count(*) FROM roomix_properties r
//   WHERE ... AND NOT EXISTS (SELECT 1 FROM mapa_manzanas m WHERE ST_Contains(m.geom, punto))
//   GROUP BY 1 ORDER BY 2 DESC
const ZONAS = {
  caba: { sur: -34.71, oeste: -58.55, norte: -34.52, este: -58.33 },
  // Vicente Lopez, Olivos, San Isidro, Tigre, Nordelta, Escobar, Pilar.
  "zona-norte": { sur: -34.52, oeste: -58.95, norte: -34.30, este: -58.45 },
  "la-plata": { sur: -35.00, oeste: -58.10, norte: -34.85, este: -57.88 },
  cordoba: { sur: -31.48, oeste: -64.28, norte: -31.32, este: -64.12 },
  rosario: { sur: -33.00, oeste: -60.75, norte: -32.85, este: -60.60 },
  // Oeste y sur del conurbano: Moron, Ramos, Lomas, Quilmes, Berazategui.
  "gba-oeste-sur": { sur: -34.85, oeste: -58.75, norte: -34.60, este: -58.30 },
}

const LADO = 0.04       // grados de lado de cada baldosa
const MARGEN = 0.006    // ~600 m de calles de mas alrededor, para cerrar los bordes
const ESPERA_MS = 4000  // Overpass es gratis y comunitario: no se lo golpea sin pausa
const REINTENTOS = 4    // 429 (demasiados pedidos) y 504 son normales, no son errores

const TIPOS =
  "motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian"

function leerEnv() {
  const txt = fs.readFileSync(path.join(RAIZ, ".env"), "utf8")
  const env = {}
  for (const linea of txt.split(/\r?\n/)) {
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
  if (!r.ok) throw new Error(`SQL ${r.status}: ${texto.slice(0, 300)}`)
  return JSON.parse(texto)
}

async function bajarCalles(sur, oeste, norte, este) {
  const consulta = `[out:json][timeout:180];
way["highway"~"^(${TIPOS})$"](${sur},${oeste},${norte},${este});
out geom;`

  // Overpass devuelve 429 cuando hay muchos pedidos seguidos y 504 cuando esta cargado.
  // Las dos cosas se arreglan esperando, no reescribiendo la consulta: se reintenta con
  // esperas cada vez mas largas.
  let d = null
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass contesta 406 a quien no se identifica.
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
    const espera = 15000 * intento
    console.log(`    (Overpass ocupado, reintento ${intento}/${REINTENTOS} en ${espera / 1000}s)`)
    await new Promise((r) => setTimeout(r, espera))
  }
  if (!d) throw new Error("Overpass no contesto despues de reintentar")

  const lineas = []
  for (const el of d.elements || []) {
    if (!el.geometry || el.geometry.length < 2) continue
    lineas.push("LINESTRING(" + el.geometry.map((p) => `${p.lon} ${p.lat}`).join(",") + ")")
  }
  return lineas
}

async function cargarBaldosa(nombre, b) {
  // Retomar donde quedo: una baldosa ya cargada no se vuelve a bajar. Asi el script se
  // puede correr de nuevo despues de un corte sin repetir el trabajo hecho.
  const [ya] = await sql(`SELECT count(*)::int AS n FROM mapa_manzanas WHERE zona = '${nombre}'`)
  if (ya.n > 0) {
    console.log(`  ${nombre}: ya estaba (${ya.n} manzanas), se saltea`)
    return ya.n
  }

  const lineas = await bajarCalles(
    b.sur - MARGEN, b.oeste - MARGEN, b.norte + MARGEN, b.este + MARGEN,
  )
  if (lineas.length < 20) {
    console.log(`  ${nombre}: ${lineas.length} calles, se saltea (zona sin trama urbana)`)
    return 0
  }

  const valores = lineas.map((l) => `('${l}')`).join(",")
  const [fila] = await sql(`
    CREATE TEMP TABLE _calles_cargadas (geom geometry(LineString,4326)) ON COMMIT DROP;
    INSERT INTO _calles_cargadas (geom)
      SELECT ST_GeomFromText(w, 4326) FROM (VALUES ${valores}) v(w);
    SELECT armar_manzanas('${nombre}', ${b.sur}, ${b.oeste}, ${b.norte}, ${b.este}) AS manzanas;
  `)

  console.log(`  ${nombre}: ${lineas.length} calles -> ${fila.manzanas} manzanas`)
  return fila.manzanas
}

function baldosasDe(recuadro) {
  const salida = []
  for (let s = recuadro.sur; s < recuadro.norte; s += LADO) {
    for (let o = recuadro.oeste; o < recuadro.este; o += LADO) {
      salida.push({
        sur: s,
        oeste: o,
        norte: Math.min(s + LADO, recuadro.norte),
        este: Math.min(o + LADO, recuadro.este),
      })
    }
  }
  return salida
}

// ── main ──
const arg = process.argv[2]
const recuadro = ZONAS[arg]
if (!recuadro) {
  console.error(`Zona desconocida. Conocidas: ${Object.keys(ZONAS).join(", ")}`)
  process.exit(1)
}

const baldosas = baldosasDe(recuadro)
console.log(`Zona "${arg}": ${baldosas.length} baldosas de ${LADO}°\n`)

let total = 0
for (let i = 0; i < baldosas.length; i++) {
  const nombre = `${arg}-${i}`
  try {
    total += await cargarBaldosa(nombre, baldosas[i])
  } catch (e) {
    // Una baldosa que falla no tiene que tirar abajo la carga entera: se anota y sigue.
    console.error(`  ${nombre}: FALLO -> ${e.message}`)
  }
  if (i < baldosas.length - 1) await new Promise((r) => setTimeout(r, ESPERA_MS))
}

console.log(`\nTotal: ${total} manzanas. Recalculando el precio por m2...`)
const [r] = await sql("SELECT refrescar_precio_m2_manzanas() AS filas")
console.log(`Manzanas con precio: ${r.filas}`)
