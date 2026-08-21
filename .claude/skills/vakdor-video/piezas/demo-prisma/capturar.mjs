/**
 * Captura las 5 pantallas del demo de PRISMA.
 *
 * Entra como director de PRISMAIA - VAKDOR (credenciales de .env.local) y graba
 * un video por pantalla. Cada video sale a videos/<tramo>.webm.
 *
 * Uso:  node capturar.mjs [tramo]
 *       sin argumento hace los 5.
 */
import { readFileSync, mkdirSync, existsSync, readdirSync, renameSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"

// Playwright vive en el npm global (viene con @playwright/cli), no acá.
const requerir = createRequire(import.meta.url)
const { chromium } = requerir(
  "C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
)

const RAIZ = "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM"
const BASE = "http://localhost:3010"
const SALIDA = "videos"
const ANCHO = 1920
const ALTO = 1080

// --- credenciales desde .env.local, sin imprimirlas nunca -------------------
function leerEnv() {
  const txt = readFileSync(join(RAIZ, ".env.local"), "utf8")
  const val = (clave) => {
    const m = txt.match(new RegExp("^" + clave + "=(.*)$", "m"))
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null
  }
  return { email: val("EMAIL"), password: val("PASSWORD") }
}

// --- los 5 tramos ----------------------------------------------------------
const TRAMOS = [
  {
    id: "1-dashboard",
    titulo: "El lunes a la mañana, todo en una pantalla",
    ruta: "/director/dashboard",
    espera: 6000,
  },
  {
    id: "2-tracking",
    titulo: "Quién trabaja y quién no, medido",
    ruta: "/director/tracking-performance",
    espera: 7000,
  },
  {
    id: "3-whatsapp",
    titulo: "Contestó a las 2 AM sin que nadie estuviera",
    ruta: "/director/leads-whatsapp",
    espera: 5000,
    // La lista sola no dice nada: hay que ABRIR la conversación.
    async accion(pg) {
      const ojo = pg.locator("table tbody tr").first().locator("button, a").first()
      if (await ojo.count()) {
        await ojo.click({ timeout: 8000 }).catch(() => {})
        await pg.waitForTimeout(4000)
      }
    },
  },
  {
    id: "4-acm",
    titulo: "Tasar en minutos, no en días",
    ruta: "/director/acm",
    espera: 5000,
    // El formulario vacío no vende. "Mis ACM" muestra análisis YA hechos.
    async accion(pg) {
      const tab = pg.getByText("Mis ACM", { exact: false }).first()
      if (await tab.count()) {
        await tab.click({ timeout: 8000 }).catch(() => {})
        await pg.waitForTimeout(4500)
        // Y si hay alguno guardado, abrirlo para que se vean los comparables.
        const primero = pg.locator('[class*="card"], table tbody tr').first()
        if (await primero.count()) {
          await primero.click({ timeout: 6000 }).catch(() => {})
          await pg.waitForTimeout(5000)
        }
      }
    },
  },
  {
    id: "5-tutor",
    titulo: "El asesor nuevo se forma solo",
    ruta: "/director/tutor",
    espera: 4000,
    // Que se vea RESPONDIENDO, no solo saludando. Gasta 1 crédito de IA.
    async accion(pg) {
      const caja = pg.locator('textarea, input[type="text"]').last()
      if (await caja.count()) {
        await caja.click().catch(() => {})
        await caja.type("¿Cómo le explico a un propietario por qué su precio está alto?", {
          delay: 45,
        })
        await pg.waitForTimeout(600)
        await pg.keyboard.press("Enter")
        // La respuesta de la IA tarda; se le da aire para que se vea escribiendo.
        await pg.waitForTimeout(16000)
      }
    },
  },
]

/**
 * Espera a que se vayan los esqueletos de carga (las cajas grises).
 * Sin esto se graba la pantalla vacía: los datos llegan por fetch DESPUES
 * de que la página dice estar lista, asi que networkidle no alcanza.
 */
async function esperarContenido(page, maxMs = 30000) {
  const SEL = '[class*="animate-pulse"], [class*="skeleton"], [class*="Skeleton"]'
  const limite = Date.now() + maxMs
  let quietos = 0
  while (Date.now() < limite) {
    const n = await page.locator(SEL).count().catch(() => 0)
    if (n === 0) {
      quietos++
      if (quietos >= 3) return true // tres lecturas seguidas en cero
    } else {
      quietos = 0
    }
    await page.waitForTimeout(500)
  }
  console.log("    (aviso: seguían cargando datos al cumplirse el tiempo)")
  return false
}

// --- un paseo suave por la pantalla, para que no quede estática ------------
async function pasear(page, ms) {
  const pasos = Math.max(3, Math.floor(ms / 1200))
  for (let i = 0; i < pasos; i++) {
    await page.mouse.move(300 + i * 190, 260 + (i % 3) * 130, { steps: 22 })
    await page.waitForTimeout(260)
    // Bajar de a poco, como lee una persona.
    await page.evaluate(() => window.scrollBy({ top: 190, behavior: "smooth" }))
    await page.waitForTimeout(620)
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }))
  await page.waitForTimeout(700)
}

async function main() {
  const { email, password } = leerEnv()
  if (!email || !password) {
    console.error("Faltan EMAIL o PASSWORD en .env.local")
    process.exit(1)
  }
  console.log(`Entrando como ${email.replace(/(.{2}).*(@.*)/, "$1***$2")}`)

  if (!existsSync(SALIDA)) mkdirSync(SALIDA, { recursive: true })

  const pedidos = process.argv[2]
    ? TRAMOS.filter((t) => t.id.startsWith(process.argv[2]))
    : TRAMOS

  const navegador = await chromium.launch({ headless: true })

  // --- login una sola vez, y se reusa la sesión para los 5 tramos ----------
  const ctxLogin = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO } })
  const p = await ctxLogin.newPage()
  await p.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded" })
  await p.fill('input[type="email"], input[name="email"]', email)
  await p.fill('input[type="password"], input[name="password"]', password)
  await Promise.all([
    p.waitForURL(/\/(director|asesor)\//, { timeout: 45000 }).catch(() => {}),
    p.click('button[type="submit"]'),
  ])
  await p.waitForTimeout(3000)
  const urlPost = p.url()
  console.log("Después del login estoy en:", urlPost.replace(BASE, ""))
  if (!/\/(director|asesor)\//.test(urlPost)) {
    const err = await p.locator("text=/incorrect|inválid|error/i").first().textContent().catch(() => null)
    console.error("No entré. La página dice:", err ?? "(sin mensaje)")
    await p.screenshot({ path: "videos/_login-fallido.png" })
    await navegador.close()
    process.exit(2)
  }
  const sesion = await ctxLogin.storageState()
  await ctxLogin.close()

  // --- un contexto con video por tramo ------------------------------------
  for (const t of pedidos) {
    console.log(`\n▶ ${t.id} — ${t.titulo}`)
    const inicioContexto = Date.now()
    const ctx = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      storageState: sesion,
      recordVideo: { dir: SALIDA, size: { width: ANCHO, height: ALTO } },
    })
    const pg = await ctx.newPage()
    try {
      await pg.goto(BASE + t.ruta, { waitUntil: "networkidle", timeout: 60000 })
    } catch {
      await pg.goto(BASE + t.ruta, { waitUntil: "domcontentloaded", timeout: 60000 })
    }
    const listo = await esperarContenido(pg)
    console.log(`    datos cargados: ${listo ? "si" : "no (se graba igual)"}`)
    await pg.waitForTimeout(1200)
    // Marca el momento en que empieza lo bueno, para recortar despues.
    const arranque = Date.now()
    await pasear(pg, t.espera)
    if (t.accion) {
      console.log("    entrando adentro…")
      await t.accion(pg).catch((e) => console.log("    (la acción falló: " + e.message + ")"))
      await pg.waitForTimeout(1500)
    }
    t.recorteSegundos = (arranque - inicioContexto) / 1000
    const video = pg.video()
    await ctx.close()
    if (video) {
      const tmp = await video.path()
      const destino = join(SALIDA, `${t.id}.webm`)
      renameSync(tmp, destino)
      console.log(`  guardado: ${destino}`)
    }
  }

  await navegador.close()
  console.log("\nListo. Videos en " + SALIDA)
  for (const f of readdirSync(SALIDA)) console.log("  -", f)
}

main().catch((e) => {
  console.error("Falló:", e.message)
  process.exit(1)
})
