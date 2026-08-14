// Carga los datos abiertos del gobierno porteño que alimentan la hoja "La propiedad y su
// entorno" del ACM. Se corre A MANO, no hay cron: estos datasets cambian cada varios meses.
//
//   node scripts/cargar-zona-pois.mjs             → todo
//   node scripts/cargar-zona-pois.mjs subte       → una categoría sola
//   node scripts/cargar-zona-pois.mjs --verificar → solo el control de calidad
//
// POR QUE SE RESUELVEN LAS URLS POR CATALOGO Y NO SE ESCRIBEN FIJAS
// El gobierno mueve los archivos de carpeta. Al escribir esto, 4 de las 7 URLs que teníamos
// anotadas daban 404 porque farmacias había pasado de "salud" a "ministerio-de-salud",
// espacios verdes a "secretaria-de-desarrollo-urbano" y comisarías había cambiado de nombre.
// El catálogo CKAN sobrevive a esas mudanzas; una URL fija no.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Papa from "papaparse"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)"

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
const REF = env.SUPABASE_PROJECT_REF || (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0]

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

/** Escapa una cadena para meterla literal en el SQL. Null/vacío → NULL. */
function lit(v) {
  if (v == null || v === "") return "NULL"
  return "'" + String(v).replace(/'/g, "''") + "'"
}

/**
 * Como lit(), pero el vacío queda como cadena vacía en vez de NULL. Es para `nombre`, que es
 * NOT NULL: hay escuelas del padrón sin nombre cargado, y ésas igual tienen que entrar porque
 * cuentan para el "12 escuelas en un kilómetro". Se filtran al mostrar, no al guardar.
 */
function litTexto(v) {
  return "'" + String(v ?? "").replace(/'/g, "''") + "'"
}

/** Resuelve la URL de un recurso del catálogo CKAN del gobierno porteño. */
async function urlDelCatalogo(dataset, formato, contiene) {
  const r = await fetch(`https://data.buenosaires.gob.ar/api/3/action/package_show?id=${dataset}`, {
    headers: { "User-Agent": UA },
  })
  const d = await r.json()
  if (!d.success) throw new Error(`Catálogo: no existe el dataset "${dataset}"`)
  const rec = d.result.resources.find(
    (x) => (x.format || "").toUpperCase() === formato.toUpperCase() && (x.url || "").includes(contiene)
  )
  if (!rec) throw new Error(`Catálogo: "${dataset}" no tiene un ${formato} con "${contiene}"`)
  return rec.url
}

async function bajarTexto(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return await r.text()
}

/** CSV → array de objetos. Los CSV del gobierno vienen con BOM: Papa lo saca solo. */
function csv(texto) {
  return Papa.parse(texto.trim(), { header: true, skipEmptyLines: true }).data
}

/** "POINT (-58.45 -34.56)" → [lon, lat]. null si no parsea. */
function puntoDeWkt(wkt) {
  const m = /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(wkt || "")
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Coordenada con coma decimal ("-58,3709946") → número. Ver la trampa de las paradas. */
function num(v) {
  if (v == null) return NaN
  return Number(String(v).replace(",", "."))
}

/** Mismo criterio que normalizeBarrio() de lib/acm/ficha.ts. */
function normalizar(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ── BARRIOS ─────────────────────────────────────────────────────────────────
// Van primero: sin ellos no hay control de calidad de los POIs ni forma de decir en qué barrio
// cae una propiedad.
async function cargarBarrios() {
  const url = await urlDelCatalogo("barrios", "CSV", "barrios.csv")
  const filas = csv(await bajarTexto(url))
  console.log(`  barrios: ${filas.length} filas bajadas`)

  const valores = []
  for (const f of filas) {
    const nombre = (f.nombre || "").trim()
    const geom = (f.geometry || "").trim()
    if (!nombre || !geom) continue
    const areaKm2 = Number(f.area_metro) / 1_000_000
    valores.push(
      `(${lit(nombre)}, ${lit(normalizar(nombre))}, ${Number(f.comuna) || "NULL"}, ` +
      `${Number.isFinite(areaKm2) ? areaKm2.toFixed(4) : "NULL"}, ` +
      // El CSV trae POLYGON y la columna es MultiPolygon: ST_Multi normaliza los dos casos.
      `ST_Multi(ST_GeomFromText(${lit(geom)}, 4326)))`
    )
  }

  await sql("DELETE FROM zona_barrios")
  await sql(
    `INSERT INTO zona_barrios (nombre, nombre_norm, comuna, area_km2, geom) VALUES ${valores.join(",")}`
  )
  const [n] = await sql("SELECT count(*)::int AS n FROM zona_barrios")
  console.log(`  barrios: ${n.n} cargados`)
}

// ── POIs ────────────────────────────────────────────────────────────────────
// Cada función devuelve filas {ext_id, nombre, subtipo, direccion, barrio, comuna, extra,
// lon, lat, wktForma, srid}. wktForma solo cuando la geometría no es un punto.

async function poisSubte() {
  const url = await urlDelCatalogo("subte-estaciones", "CSV", "estaciones_de_subte.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const p = puntoDeWkt(f.geometry)
    if (!p) return []
    const linea = (f.linea || "").trim()
    return [{
      ext_id: String(f.id), nombre: (f.estacion || "").trim(),
      subtipo: linea ? `Línea ${linea}` : null,
      direccion: null, barrio: null, comuna: null,
      extra: { linea }, lon: p[0], lat: p[1], wktForma: null,
    }]
  })
}

// HOSPITALES — igual que las escuelas, vienen en EPSG:9498.
// OJO: este dataset YA CAMBIO de estructura una vez. La versión vieja tenía columnas
// WKT/ID/NOMBRE/TIPO en lat/lon; la actual tiene nam/gna/dir/bar en coordenadas locales. Si
// alguna vez vuelve a cargar 0, mirar primero las columnas del CSV, no el código.
async function poisHospitales() {
  const url = await urlDelCatalogo("hospitales", "CSV", "hospitales.csv")
  return csv(await bajarTexto(url)).flatMap((f, i) => {
    const p = puntoDeWkt(f.geometry)
    if (!p) return []
    return [{
      ext_id: String(f.nam || i), nombre: (f.nam || f.fna || "").trim(),
      subtipo: (f.gna || "").trim() || null,
      direccion: (f.dir || "").trim() || null,
      barrio: (f.bar || "").trim() || null, comuna: Number(f.com) || null,
      extra: { especialidad: (f.esp || "").trim() || null },
      lon: null, lat: null, wktForma: `POINT(${p[0]} ${p[1]})`, srid: 9498,
    }]
  })
}

async function poisComisarias() {
  const url = await urlDelCatalogo("comisarias-policia-ciudad", "CSV", "comisarias_policia.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const p = puntoDeWkt(f.geometry)
    if (!p) return []
    return [{
      ext_id: String(f.id), nombre: (f.nombre || "").trim(), subtipo: null,
      direccion: (f.direccion || "").trim() || null,
      barrio: (f.barrio || "").trim() || null, comuna: Number(f.comuna) || null,
      extra: {}, lon: p[0], lat: p[1], wktForma: null,
    }]
  })
}

async function poisFarmacias() {
  const url = await urlDelCatalogo("farmacias", "JSON", "farmacias.geojson")
  const gj = JSON.parse(await bajarTexto(url))
  return (gj.features || []).flatMap((f, i) => {
    const c = f.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return []
    const p = f.properties || {}
    return [{
      ext_id: String(p.id ?? i), nombre: (p.nombre || p.NOMBRE || "Farmacia").trim(), subtipo: null,
      direccion: (p.direccion || p.DIRECCION || "").trim() || null,
      barrio: (p.barrio || p.BARRIO || "").trim() || null,
      comuna: Number(p.comuna || p.COMUNA) || null,
      extra: {}, lon: Number(c[0]), lat: Number(c[1]), wktForma: null,
    }]
  })
}

// PARADAS DE COLECTIVO — dos trampas medidas, las dos silenciosas:
//   1. Las coordenadas usan COMA decimal ("-58,3709946"). Con Number() directo dan NaN, y si
//      alguien "arregla" eso mal, todas las paradas de Buenos Aires aterrizan en el Golfo de
//      Guinea (0,0) sin que nada tire error.
//   2. Las líneas vienen repartidas en seis columnas L1..L6, casi todas vacías.
async function poisParadas() {
  const url = await urlDelCatalogo("colectivos-paradas", "CSV", "paradas-de-colectivo.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const lon = num(f.coord_X), lat = num(f.coord_Y)
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0 || lat === 0) return []
    const lineas = ["L1", "L2", "L3", "L4", "L5", "L6"]
      .map((k) => String(f[k] ?? "").trim())
      .filter(Boolean)
    return [{
      ext_id: String(f.fid), nombre: (f.DIRECCION || "").trim() || "Parada", subtipo: null,
      direccion: (f.DIRECCION || "").trim() || null,
      barrio: (f.BARRIO || "").trim() || null, comuna: Number(f.COMUNA) || null,
      extra: { lineas }, lon, lat, wktForma: null,
    }]
  })
}

// ESPACIOS VERDES — son polígonos. Se guarda un punto sobre la forma (para dibujar) y la forma
// entera (para medir contra el borde, no contra el centro).
async function poisEspaciosVerdes() {
  const url = await urlDelCatalogo("espacios-verdes", "CSV", "espacio_verde_publico.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const geom = (f.geometry || "").trim()
    if (!geom) return []
    return [{
      ext_id: String(f.id), nombre: (f.nombre || f.nom_mapa || "Espacio verde").trim(),
      subtipo: (f.clasificac || "").trim() || null,
      direccion: (f.ubicacion || "").trim() || null,
      barrio: (f.barrio || "").trim() || null, comuna: Number(f.comuna) || null,
      extra: { area_m2: Number(f.area) || null },
      lon: null, lat: null, wktForma: geom,
    }]
  })
}

// CICLOVIAS — son líneas. Mismo criterio que los parques.
async function poisCiclovias() {
  const url = await urlDelCatalogo("ciclovias", "CSV", "ciclovias.csv")
  return csv(await bajarTexto(url)).flatMap((f, i) => {
    const geom = (f.geometry || "").trim()
    if (!geom) return []
    return [{
      ext_id: String(f.id ?? i), nombre: (f.nombre || "Ciclovía").trim(),
      subtipo: (f.tipo || "").trim() || null,
      direccion: null,
      barrio: (f.barrio || "").trim() || null, comuna: Number(f.comuna) || null,
      extra: { longitud_m: Number(f.longitud_m) || null },
      lon: null, lat: null, wktForma: geom,
    }]
  })
}

// ECOBICI — única categoría que NO es un archivo: sale de API Transporte con las credenciales
// CLIENT_ID/CLIENT_SECRET del .env (verificadas: son de API Transporte, no de Google).
async function poisEcobici() {
  const u = new URL("https://apitransporte.buenosaires.gob.ar/ecobici/gbfs/stationInformation")
  u.searchParams.set("client_id", env.CLIENT_ID)
  u.searchParams.set("client_secret", env.CLIENT_SECRET)
  const d = JSON.parse(await bajarTexto(u.toString()))
  return (d.data?.stations || []).flatMap((s) => {
    const lon = Number(s.lon), lat = Number(s.lat)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return []
    return [{
      ext_id: String(s.station_id), nombre: (s.name || "").trim(), subtipo: null,
      direccion: (s.address || "").trim() || null, barrio: null, comuna: null,
      extra: { capacidad: s.capacity ?? null },
      lon, lat, wktForma: null,
    }]
  })
}

// ESCUELAS — vienen en EPSG:9498 (coordenadas locales de CABA), NO en lat/lon. Se reproyectan
// con ST_Transform EN LA BASE: PostGIS ya tiene la definición del sistema y no hay que acertarle
// a los parámetros a mano con proj4.
async function poisEscuelas() {
  const url = await urlDelCatalogo("establecimientos-educativos", "GeoJSON", "establecimientos_educativos.geojson")
  const gj = JSON.parse(await bajarTexto(url))
  return (gj.features || []).flatMap((f, i) => {
    const c = f.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return []
    const p = f.properties || {}
    return [{
      ext_id: String(p.id ?? i), nombre: (p.nam || "").trim(),
      subtipo: (p.ges || "").trim() || null,   // "Estatal" | "Privado"
      direccion: (p.dir || "").trim() || null,
      barrio: (p.bar || "").trim() || null, comuna: Number(p.com) || null,
      extra: { nivel: (p.nen_mde || "").trim() || null },
      lon: null, lat: null, wktForma: `POINT(${c[0]} ${c[1]})`, srid: 9498,
    }]
  })
}

// ── INSERCION ───────────────────────────────────────────────────────────────
// El SQL va por tandas porque la Management API tiene un tope de tamaño de pedido.
//
// Las tandas se cortan por PESO, no por cantidad de filas: una estación de subte son 200 bytes
// y un polígono de parque puede ser medio mega. Cortando de a N filas, las categorías con
// geometrías grandes tiran "request entity too large" y las chicas hacen diez veces más viajes
// de los necesarios.
const TOPE_BYTES = 900_000

async function guardar(categoria, filas, fuente) {
  await sql(`DELETE FROM zona_pois WHERE categoria = ${lit(categoria)}`)

  const tandas = []
  let actual = [], peso = 0
  for (const f of filas) {
    const v = valorSql(categoria, f, fuente)
    if (actual.length && peso + v.length > TOPE_BYTES) {
      tandas.push(actual)
      actual = []; peso = 0
    }
    actual.push(v); peso += v.length
  }
  if (actual.length) tandas.push(actual)

  for (const valores of tandas) {
    await sql(
      `INSERT INTO zona_pois (categoria, ext_id, nombre, subtipo, direccion, barrio, comuna, extra, geom, geom_forma, fuente)
       VALUES ${valores.join(",")}
       ON CONFLICT (categoria, ext_id) DO UPDATE SET
         nombre = EXCLUDED.nombre, subtipo = EXCLUDED.subtipo, direccion = EXCLUDED.direccion,
         barrio = EXCLUDED.barrio, comuna = EXCLUDED.comuna, extra = EXCLUDED.extra,
         geom = EXCLUDED.geom, geom_forma = EXCLUDED.geom_forma, actualizado_at = now()`
    )
  }

  // Una categoría que carga CERO es un error, no un resultado. Es la falla más peligrosa que
  // tiene este script: no rompe nada, la ficha sale igual, y simplemente esa categoría nunca
  // más aparece en ninguna hoja sin que nadie se entere. Pasó de verdad con hospitales, cuando
  // el gobierno le cambió las columnas al CSV.
  if (filas.length === 0) {
    console.error(`\n  X ${categoria}: 0 filas. El dataset probablemente cambió de columnas.`)
    console.error(`    Mirá el CSV/GeoJSON antes de tocar el código.\n`)
    process.exit(1)
  }
  console.log(`  ${categoria}: ${filas.length} cargados (${tandas.length} ${tandas.length === 1 ? "tanda" : "tandas"})`)
}

/** Una fila lista para el VALUES del INSERT. */
function valorSql(categoria, f, fuente) {
  // Tres formas de llegar al punto, por orden: lat/lon directas; forma en 9498 que se
  // reproyecta; forma en 4326 de la que se saca un punto sobre la superficie.
  let geom, geomForma
  if (f.srid === 9498) {
    geom = `ST_Transform(ST_GeomFromText(${lit(f.wktForma)}, 9498), 4326)`
    geomForma = "NULL"
  } else if (f.wktForma) {
    // ST_PointOnSurface y NO ST_Centroid: el centroide de un parque en "L" o de una
    // ciclovía curva puede caer FUERA de la propia forma, y ahí el marcador del mapa
    // queda en la vereda de enfrente o en el medio de otra manzana.
    geom = `ST_PointOnSurface(ST_GeomFromText(${lit(f.wktForma)}, 4326))`
    geomForma = `ST_GeomFromText(${lit(f.wktForma)}, 4326)`
  } else {
    geom = `ST_SetSRID(ST_MakePoint(${f.lon}, ${f.lat}), 4326)`
    geomForma = "NULL"
  }
  return `(${lit(categoria)}, ${lit(f.ext_id)}, ${litTexto(f.nombre)}, ${lit(f.subtipo)}, ` +
    `${lit(f.direccion)}, ${lit(f.barrio)}, ${f.comuna || "NULL"}, ` +
    `${lit(JSON.stringify(f.extra || {}))}::jsonb, ${geom}, ${geomForma}, ${lit(fuente)})`
}

const CATEGORIAS = {
  subte: poisSubte,
  escuela: poisEscuelas,
  hospital: poisHospitales,
  farmacia: poisFarmacias,
  comisaria: poisComisarias,
  espacio_verde: poisEspaciosVerdes,
  parada_colectivo: poisParadas,
  ecobici: poisEcobici,
  ciclovia: poisCiclovias,
}

// ── CONTROL DE CALIDAD ──────────────────────────────────────────────────────
// El único chequeo que detecta una reproyección silenciosamente torcida. Cada POI trae del
// dataset el barrio que él mismo declara; se cruza contra el polígono real. Si un punto no cae
// donde dice estar, las coordenadas están mal — y en escuelas eso es exactamente lo que pasa si
// la reproyección de EPSG:9498 falla, sin que nada tire un error.
async function verificar() {
  const filas = await sql(`
    SELECT p.categoria,
           count(*)::int AS con_barrio,
           count(*) FILTER (WHERE b.nombre_norm IS DISTINCT FROM lower_norm(p.barrio))::int AS fuera
    FROM zona_pois p
    LEFT JOIN zona_barrios b ON ST_Contains(b.geom, p.geom)
    WHERE p.barrio IS NOT NULL AND p.barrio <> ''
    GROUP BY 1 ORDER BY 1`)

  console.log("\n  Control de calidad (POIs cuyo punto NO cae en el barrio que declaran):")
  let hayProblema = false
  for (const f of filas) {
    const pct = f.con_barrio ? Math.round((f.fuera / f.con_barrio) * 100) : 0
    const mal = pct > 10
    if (mal) hayProblema = true
    console.log(`    ${mal ? "X" : "OK"} ${f.categoria}: ${f.fuera}/${f.con_barrio} (${pct}%)`)
  }
  const [tot] = await sql("SELECT count(*)::int AS n FROM zona_pois")
  console.log(`\n  Total de POIs en la base: ${tot.n}`)
  if (hayProblema) {
    console.error("\n  X CARGA NO VALIDA: hay una categoría con más del 10% de puntos fuera de lugar.")
    console.error("    En escuelas, esto significa que la reproyección de EPSG:9498 falló.")
    process.exit(1)
  }
  console.log("  OK carga válida\n")
}

// ── MAIN ────────────────────────────────────────────────────────────────────
const arg = (process.argv[2] || "").trim()

if (arg === "--verificar") {
  await verificar()
} else if (arg === "barrios") {
  await cargarBarrios()
} else if (arg && CATEGORIAS[arg]) {
  console.log(`Cargando ${arg}…`)
  await guardar(arg, await CATEGORIAS[arg](), "gcba")
  await verificar()
} else if (arg) {
  console.error(`Categoría desconocida: "${arg}". Opciones: barrios, ${Object.keys(CATEGORIAS).join(", ")}`)
  process.exit(1)
} else {
  console.log("Cargando todo…")
  await cargarBarrios()
  for (const [cat, fn] of Object.entries(CATEGORIAS)) {
    console.log(`Cargando ${cat}…`)
    await guardar(cat, await fn(), "gcba")
  }
  await verificar()
}
