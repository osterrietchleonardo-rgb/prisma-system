/**
 * Graba la ficha del cliente de arriba a abajo, con un desplazamiento parejo.
 * Un scroll continuo se lee mucho mejor que saltos de rueda.
 */
import { renameSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
const r = createRequire(import.meta.url)
const { chromium } = r("C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright")

const URL_FICHA = process.argv[2]
const SEGUNDOS = Number(process.argv[3] || 34)
if (!URL_FICHA) { console.error("falta la url"); process.exit(1) }
if (!existsSync("videos")) mkdirSync("videos")

const nav = await chromium.launch({ headless: true })
const ctx = await nav.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: "videos", size: { width: 1920, height: 1080 } },
})
const pg = await ctx.newPage()
await pg.goto(URL_FICHA, { waitUntil: "networkidle", timeout: 90000 })

// Esperar a que TODAS las fotos esten cargadas: si no, el scroll pasa por huecos.
await pg.evaluate(async () => {
  const imgs = [...document.querySelectorAll("img")]
  imgs.forEach((i) => { i.loading = "eager" })
  await Promise.all(imgs.map((i) => i.complete ? null : new Promise((res) => {
    i.addEventListener("load", res, { once: true })
    i.addEventListener("error", res, { once: true })
    setTimeout(res, 8000)
  })))
})
await pg.waitForTimeout(3500)   // la carátula se ve quieta un momento

// Desplazamiento continuo, calculado para tardar SEGUNDOS de punta a punta.
// OJO: esta ficha NO se desplaza con la ventana, sino con un contenedor interno.
// window.scrollTo no la mueve un pixel. Hay que encontrar quien scrollea de verdad.
const info = await pg.evaluate((segs) => new Promise((listo) => {
  function buscarScroller() {
    const doc = document.scrollingElement || document.documentElement
    if (doc.scrollHeight > doc.clientHeight + 50) return doc
    let mejor = null, max = 0
    for (const el of document.querySelectorAll("div, main, section")) {
      const sobra = el.scrollHeight - el.clientHeight
      const est = getComputedStyle(el).overflowY
      if (sobra > 50 && (est === "auto" || est === "scroll") && sobra > max) { max = sobra; mejor = el }
    }
    return mejor || doc
  }
  const sc = buscarScroller()
  // La ficha trae scroll-behavior: smooth de CSS. Eso ANIMA cada asignacion de
  // scrollTop y pelea con la animacion cuadro a cuadro: el recorrido queda a
  // menos de la mitad. Hay que apagarlo antes de mover nada.
  sc.style.scrollBehavior = "auto"
  document.documentElement.style.scrollBehavior = "auto"
  document.body.style.scrollBehavior = "auto"
  const alto = sc.scrollHeight - sc.clientHeight
  const t0 = performance.now()
  const suave = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
  function paso(t) {
    const p = Math.min(1, (t - t0) / (segs * 1000))
    sc.scrollTop = alto * suave(p)
    if (p < 1) requestAnimationFrame(paso)
    else listo({ etiqueta: sc.tagName + "." + (sc.className || "").toString().slice(0, 30), recorrido: alto, final: sc.scrollTop })
  }
  requestAnimationFrame(paso)
}), SEGUNDOS)
console.log("scroller:", info.etiqueta, "| recorrido:", Math.round(info.recorrido), "px | quedó en:", Math.round(info.final))
if (info.recorrido < 400) console.log("AVISO: la pagina casi no tenia scroll")

await pg.waitForTimeout(2500)   // el cierre queda a la vista
const rotas = await pg.evaluate(() =>
  [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length)
console.log("fotos rotas:", rotas)
const v = pg.video()
await ctx.close()
if (v) renameSync(await v.path(), join("videos", "ficha.webm"))
await nav.close()
