/**
 * ACM de punta a punta, con los selectores YA APRENDIDOS. Sin pausas de tanteo.
 *
 * Flujo:
 *   entrar -> formulario -> 4 fotos -> "Analizar fotos con IA" -> descripcion
 *   -> buscar comparables -> checklist -> elegir 3 CON FOTO -> revisar -> crear ficha
 *   -> abrir la ficha publica
 *
 * OJO: crea un ACM real en la cuenta de Leonardo y gasta creditos de IA.
 */
import { readFileSync, mkdirSync, existsSync, renameSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
const requerir = createRequire(import.meta.url)
const { chromium } = requerir(
  "C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
)

const RAIZ = "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM"
const BASE = "http://localhost:3010"
const SALIDA = "videos"
const FOTOS_DIR = join(RAIZ, "scratch/photos/cartera_1f23e6c9-6fd7-4c56-a395-abd4a6f6dbbc")
const FOTOS = ["0.jpg", "1.jpg", "2.jpg", "3.jpg"].map((f) => join(FOTOS_DIR, f))

const env = readFileSync(join(RAIZ, ".env.local"), "utf8")
const val = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim()

const PROP = {
  direccion: "Av. Cabildo 2200, Piso 5 Dpto A",
  barrio: "Belgrano",
  // cubiertos, semicubiertos, descubiertos, terreno, antiguedad, dormitorios, banos, piso
  numeros: ["78", "8", "", "", "15", "2", "1", "5"],
}

const paso = (n, t) => console.log(`\n[${n}] ${t}`)

/** Espera a que no queden esqueletos de carga. */
async function esperarCarga(pg, maxMs = 90000) {
  const limite = Date.now() + maxMs
  let quietos = 0
  while (Date.now() < limite) {
    const n = await pg.locator('[class*="animate-pulse"]').count().catch(() => 0)
    if (n === 0 && ++quietos >= 3) return true
    if (n > 0) quietos = 0
    await pg.waitForTimeout(600)
  }
  return false
}

const nav = await chromium.launch({ headless: true })
if (!existsSync(SALIDA)) mkdirSync(SALIDA, { recursive: true })
const ctx = await nav.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: SALIDA, size: { width: 1920, height: 1080 } },
})
const pg = await ctx.newPage()

// ─── 1. entrar ──────────────────────────────────────────────────────────────
paso(1, "entrando")
await pg.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded" })
await pg.fill('input[type="email"], input[name="email"]', val("EMAIL"))
await pg.fill('input[type="password"], input[name="password"]', val("PASSWORD"))
await pg.click('button[type="submit"]')
await pg.waitForURL(/\/director\//, { timeout: 45000 })

// ─── 2. el formulario ───────────────────────────────────────────────────────
paso(2, "cargando la propiedad")
await pg.goto(BASE + "/director/acm", { waitUntil: "networkidle" })
// El barrio arranca diciendo "Cargando barrios…" y recien despues acepta texto.
await pg.waitForSelector('input[placeholder*="Escribí para buscar" i]', { timeout: 40000 })
await pg.waitForTimeout(800)

await pg.locator('input[placeholder*="Av. Libertador" i]').fill(PROP.direccion)
await pg.waitForTimeout(500)

const barrio = pg.locator('input[placeholder*="Escribí para buscar" i]').first()
await barrio.click()
await barrio.type(PROP.barrio, { delay: 75 })
await pg.waitForTimeout(1500)
// Las opciones del desplegable son <button>, no <li>. Y hay varias que contienen
// "Belgrano" (Belgrano R, Belgrano C, Villa Belgrano...): hay que elegir la exacta,
// que es la que tiene la primera linea igual al barrio buscado.
const elegido = await pg.evaluate((b) => {
  const btns = [...document.querySelectorAll("button")]
  const exacto = btns.find((x) => (x.innerText || "").trim().split("\n")[0].trim() === b)
  const destino = exacto || btns.find((x) => (x.innerText || "").includes(b))
  if (!destino) return null
  destino.click()
  return (destino.innerText || "").replace(/\s+/g, " ").trim()
}, PROP.barrio)
console.log("    barrio elegido:", elegido ?? "(no apareció la lista)")
if (!elegido) throw new Error("no se pudo elegir el barrio")
await pg.waitForTimeout(900)

const num = pg.locator('input[type="number"]')
for (let i = 0; i < PROP.numeros.length; i++) {
  if (!PROP.numeros[i]) continue
  await num.nth(i).fill(PROP.numeros[i])
  await pg.waitForTimeout(200)
}

// ─── 3. las 4 fotos + la IA que las mira ────────────────────────────────────
paso(3, "subiendo 4 fotos para que las lea la IA")
const inputFotos = pg.locator('input[type="file"]').first()
await inputFotos.setInputFiles(FOTOS)
await pg.waitForTimeout(2500)

const btnAnalizar = pg.getByRole("button", { name: /analizar fotos con ia/i }).first()
await btnAnalizar.scrollIntoViewIfNeeded()
await pg.waitForTimeout(800)
await btnAnalizar.click()
console.log("    analizando… (gasta crédito)")
await pg.waitForFunction(
  () => !/Analizando fotos/i.test(document.body.innerText),
  { timeout: 120000 },
).catch(() => console.log("    (tardó más de lo previsto)"))
await pg.waitForTimeout(2500)

const desc = await pg.evaluate(() => {
  const t = [...document.querySelectorAll("textarea")].map((x) => x.value).filter(Boolean)
  return t.sort((a, b) => b.length - a.length)[0] || ""
})
console.log("    descripción IA:", desc ? `${desc.length} caracteres` : "(vacía)")
if (desc) console.log("    «" + desc.slice(0, 150).replace(/\s+/g, " ") + "…»")
await pg.screenshot({ path: "L-3-descripcion-ia.png" })
// Que se lea en el video.
await pg.waitForTimeout(3500)

// ─── 4. comparables ─────────────────────────────────────────────────────────
paso(4, "buscando comparables")
await pg.getByRole("button", { name: /buscar comparables/i }).click()
await pg.waitForTimeout(5000)
await esperarCarga(pg)
await pg.waitForTimeout(2000)
await esperarCarga(pg)
const cuantos = await pg.locator('button[aria-label="Agregar a la ficha"]').count()
console.log(`    ${cuantos} comparables`)
await pg.screenshot({ path: "L-4-comparables.png" })

// ─── 5. el checklist, que explica el % ──────────────────────────────────────
paso(5, "abriendo un checklist de comparabilidad")
const chk = pg.getByRole("button", { name: /ver checklist/i }).first()
await chk.click().catch(() => {})
await pg.waitForTimeout(4000)
await pg.screenshot({ path: "L-5-checklist.png" })
await chk.click().catch(() => {})
await pg.waitForTimeout(1200)

// ─── 6. elegir 3 comparables QUE TENGAN FOTO ────────────────────────────────
paso(6, "eligiendo 3 comparables con foto")
await pg.getByRole("button", { name: /crear ficha/i }).first().click()
await pg.waitForTimeout(3000)

// Una foto rota tiene naturalWidth 0. Se recorren las tarjetas y se queda con
// las que SI cargaron su imagen: en la ficha del cliente una foto rota se ve pesimo.
// Dos filtros, no uno:
//  a) que la FOTO haya cargado (naturalWidth 0 = rota; en la ficha se ve pesimo).
//  b) que el USD/m2 tenga sentido. Entre los comparables se cuelan alquileres
//     publicados como venta (US$ 1.200 por 76 m2 = US$ 16/m2). Uno solo de esos
//     descalabra las conclusiones: la ficha llego a decir "amplitud del 28850%".
const MIN_M2 = 800
const MAX_M2 = 12000
const buenos = await pg.evaluate(
  ({ min, max }) => {
    const btns = [...document.querySelectorAll('button[aria-label="Agregar a la ficha"]')]
    const ok = []
    const descartados = []
    btns.forEach((b, i) => {
      const tarjeta = b.closest("div")?.parentElement
      if (!tarjeta) return
      const img = tarjeta.querySelector("img")
      const conFoto = img && img.complete && img.naturalWidth > 0
      const m = (tarjeta.innerText || "").match(/US\$\s*([\d.]+)\s*\/m/)
      const m2 = m ? Number(m[1].replace(/\./g, "")) : null
      const precioSano = m2 !== null && m2 >= min && m2 <= max
      if (conFoto && precioSano) ok.push(i)
      else if (m2 !== null && !precioSano) descartados.push(`${m2}/m²`)
    })
    return { ok, descartados: descartados.slice(0, 6) }
  },
  { min: MIN_M2, max: MAX_M2 },
).then((r) => {
  if (r.descartados.length)
    console.log(`    descarto por precio irreal: ${r.descartados.join(", ")}`)
  return r.ok
})
console.log(`    con foto y precio sano: ${buenos.length}`)
const elegidos = buenos.slice(0, 3)
console.log(`    elijo los índices ${elegidos.join(", ")}`)

const casillas = pg.locator('button[aria-label="Agregar a la ficha"]')
for (const i of elegidos) {
  await casillas.nth(i).scrollIntoViewIfNeeded().catch(() => {})
  await pg.waitForTimeout(500)
  await casillas.nth(i).click().catch(() => {})
  await pg.waitForTimeout(800)
}
await pg.waitForTimeout(1200)
await pg.screenshot({ path: "L-6-elegidos.png" })

// ─── 7. la revision (entorno escrito por IA + conclusiones) ─────────────────
paso(7, "revisando la ficha antes de crearla")
await pg.getByRole("button", { name: /^continuar$/i }).first().click()
await pg.waitForTimeout(5000)
await esperarCarga(pg, 60000)
await pg.waitForTimeout(2000)
await pg.screenshot({ path: "L-7-revision.png" })
// Bajar despacio para que se lea el texto del entorno y las conclusiones.
for (let i = 0; i < 3; i++) {
  await pg.mouse.wheel(0, 300)
  await pg.waitForTimeout(2200)
}
await pg.mouse.wheel(0, -900)
await pg.waitForTimeout(1500)

// ─── 8. crear y abrir la ficha publica ──────────────────────────────────────
paso(8, "creando la ficha")
await pg.getByRole("button", { name: /crear ficha/i }).last().click()
await pg.waitForTimeout(5000)
await esperarCarga(pg, 60000)
await pg.waitForTimeout(2500)

let enlace = await pg.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) => /\/ficha-acm\//.test(x.href))
  return a ? a.href : null
})
if (!enlace) {
  await pg.getByRole("button", { name: /mis acm/i }).first().click().catch(() => {})
  await pg.waitForTimeout(5000)
  enlace = await pg.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) => /\/ficha-acm\//.test(x.href))
    return a ? a.href : null
  })
}
console.log("    ficha pública:", enlace ?? "(no la encontré)")

if (enlace) {
  paso(9, "recorriendo la ficha del cliente")
  await pg.goto(enlace, { waitUntil: "networkidle", timeout: 60000 })
  await pg.waitForTimeout(3500)
  // Bajar parejo, que es lo que se va a acelerar despues.
  for (let i = 0; i < 14; i++) {
    await pg.mouse.wheel(0, 620)
    await pg.waitForTimeout(1100)
  }
  await pg.waitForTimeout(2000)
  await pg.screenshot({ path: "L-9-ficha-publica.png", fullPage: false })
  // Comprobar que en la ficha del cliente no quedaron fotos rotas.
  const rotas = await pg.evaluate(
    () => [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length,
  )
  console.log(`    fotos rotas en la ficha: ${rotas}`)
}

const v = pg.video()
await ctx.close()
if (v) renameSync(await v.path(), join(SALIDA, "acm-limpio.webm"))
await nav.close()
console.log("\nvideo: videos/acm-limpio.webm")
console.log("enlace:", enlace ?? "-")
