import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse-fork')
const XLSX = require('xlsx')
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
async function tryFetch(u, ms = 8000) { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(ms) }); if (!r.ok) return null; return await r.arrayBuffer() } catch { return null } }
async function firstHit(urls, c = 10) { for (let i = 0; i < urls.length; i += c) { const chunk = urls.slice(i, i + c); const s = await Promise.all(chunk.map(async u => ({ u, b: await tryFetch(u) }))); const h = s.find(r => r.b); if (h) return { url: h.u, buffer: h.b } } return null }
function periodoURLs(slug, back) { const now = new Date(); const out = []; for (let i = 0; i <= back; i++) { const dato = new Date(now.getFullYear(), now.getMonth() - i, 1); const pub = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); out.push({ periodo: `${dato.getFullYear()}-${String(dato.getMonth() + 1).padStart(2, '0')}`, url: `https://www.zonaprop.com.ar/blog/wp-content/uploads/${pub.getFullYear()}/${String(pub.getMonth() + 1).padStart(2, '0')}/${slug}_${dato.getFullYear()}-${String(dato.getMonth() + 1).padStart(2, '0')}.pdf` }) } return out }

async function icc() {
  const now = new Date(); const urls = []
  for (let i = 0; i <= 5; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); urls.push(`https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/EE_ICC_01-16.xlsx`) }
  const bufs = await Promise.all(urls.map(u => tryFetch(u)))
  for (const b of bufs) { if (!b) continue; XLSX.read(Buffer.from(b), { type: 'buffer' }) }
  return 'icc done'
}
async function zonaStd(slug) { const ps = periodoURLs(slug, 3); const h = await firstHit(ps.map(p => p.url)); if (h) await pdfParse(Buffer.from(h.buffer)); return slug }
async function gbaSur() { const slug = 'INDEX_GBA_SUR_REPORTE'; for (const { url } of periodoURLs(slug, 3)) { const base = url.replace(/\.pdf$/, ''); const cands = [url, ...Array.from({ length: 28 }, (_, k) => `${base}-${k + 1}.pdf`)]; const h = await firstHit(cands); if (h) { await pdfParse(Buffer.from(h.buffer)); return 'sur' } } return 'sur-none' }
async function mudafy() { await tryFetch('https://mudafy.com.ar/d/valor-metro-cuadrado-en-caba-por-barrio', 12000); return 'mudafy' }

const t = Date.now()
await Promise.all([
  icc(),
  Promise.all([zonaStd('INDEX_CABA_REPORTE'), zonaStd('INDEX_GBA_NORTE_REPORTE'), zonaStd('INDEX_GBA_OESTE_REPORTE'), gbaSur()]),
  mudafy(),
])
console.log(`\n>>> WALL TIME (parallel, prod-like, sin writes): ${((Date.now() - t) / 1000).toFixed(1)}s`)
