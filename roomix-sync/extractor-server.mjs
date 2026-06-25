#!/usr/bin/env node
// ============================================================================
// ACM · Servicio extractor on-demand (Tier 2) — Playwright Stealth
// ============================================================================
// Reusa la MISMA estrategia del crawler (navegador disfrazado que resuelve
// Cloudflare) pero a pedido, para 1 URL puntual. La app PRISMA le pega a
// POST /extract { url } cuando un portal bloquea la lectura simple (ML, ZonaProp,
// Argenprop, etc.) y este servicio devuelve los datos de la propiedad.
//
// NO es masivo: 1 request por click en "Analizar". Pensado para correr como un
// servicio "siempre prendido" en EasyPanel (a diferencia del crawler, que es cron).
//
// Arranque:  node extractor-server.mjs
// Env:       PORT (default 80), EXTRACTOR_SECRET (opcional, valida x-extractor-secret),
//            GEMINI_API_KEY (opcional, fallback IA), EXTRACTOR_CONCURRENCY (default 2)
// ============================================================================

import http from 'node:http';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import pLimit from 'p-limit';

chromium.use(stealthPlugin());

const PORT = parseInt(process.env.PORT || '80', 10);
const SECRET = process.env.EXTRACTOR_SECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CONCURRENCY = parseInt(process.env.EXTRACTOR_CONCURRENCY || '2', 10);
const PAGE_TIMEOUT = 45_000;

const limit = pLimit(CONCURRENCY);
let browser = null;

// Proxy residencial (opcional). La clave para que portales como ZonaProp/ML/Argenprop
// dejen pasar: salir con un IP "de casa" en vez del IP de datacenter de EasyPanel.
// Se contrata aparte y se setean estas envs; el código no cambia.
const PROXY = process.env.EXTRACTOR_PROXY_SERVER
  ? {
      server: process.env.EXTRACTOR_PROXY_SERVER, // ej: http://gw.proveedor.com:7000
      username: process.env.EXTRACTOR_PROXY_USERNAME || undefined,
      password: process.env.EXTRACTOR_PROXY_PASSWORD || undefined,
    }
  : undefined;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  log('🌐 Iniciando Chromium (Stealth)...');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  return browser;
}

// ─── Parsers (mismos criterios schema.org que el crawler) ───
function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function mapMoneda(c) {
  const s = (c || '').toUpperCase();
  if (s.includes('USD') || s.includes('U$S') || s.includes('US$') || s.includes('DOLAR')) return 'USD';
  if (s.includes('ARS') || s === '$') return 'ARS';
  return 'USD';
}
function mapTipo(raw) {
  const t = (raw || '').toLowerCase();
  if (/\bph\b/.test(t)) return 'ph';
  if (/(office|oficina)/.test(t)) return 'oficina';
  if (/(local|store|commercial|premises|comercial)/.test(t)) return 'local';
  if (/(land|lote|terreno)/.test(t)) return 'terreno';
  if (/(house|casa|chalet|singlefamily|residence|quinta)/.test(t)) return 'casa';
  if (/(apart|depart|condo|flat|accommod|monoambiente|studio|loft)/.test(t)) return 'departamento';
  return 'departamento';
}
function parseJsonLdNodes(html) {
  const out = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1].trim());
      const arr = Array.isArray(j) ? j : (j['@graph'] && Array.isArray(j['@graph']) ? j['@graph'] : [j]);
      for (const n of arr) out.push(n);
    } catch {}
  }
  return out;
}
function typeOf(n) { return Array.isArray(n?.['@type']) ? n['@type'].join(' ') : (n?.['@type'] || ''); }

function fromJsonLd(html) {
  const nodes = parseJsonLdNodes(html);
  if (!nodes.length) return null;
  const ld =
    nodes.find((n) => /RealEstateListing/i.test(typeOf(n))) ||
    nodes.find((n) => /(Residence|Apartment|House|Place|Product|Offer)/i.test(typeOf(n)) && (n.offers || n.address || n.floorSize)) ||
    null;
  if (!ld) return null;
  const me = ld.mainEntity || ld.about || ld;
  const offers = (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) || (Array.isArray(me.offers) ? me.offers[0] : me.offers) || {};
  const addr = me.address || ld.address || {};
  const fs = me.floorSize || ld.floorSize || {};
  const bedrooms = toNum(ld.numberOfBedrooms ?? me.numberOfBedrooms);
  const rooms = toNum(ld.numberOfRooms ?? me.numberOfRooms);
  const seller = offers.seller || ld.provider || ld.author || me.broker || null;
  const responsable = typeof seller === 'string' ? seller : (seller?.name || null);
  const bf = String(offers.businessFunction || '').toLowerCase();
  return {
    sujeto: {
      tipo_propiedad: mapTipo(Array.isArray(me['@type']) ? me['@type'][0] : (me['@type'] || ld.name)),
      direccion: addr.streetAddress || ld.name || '',
      barrio: addr.addressLocality || addr.addressRegion || '',
      m2_cubiertos: toNum(fs.value ?? fs) ?? 0,
      dormitorios: bedrooms ?? (rooms ? Math.max(0, rooms - 1) : 0),
      banos: toNum(ld.numberOfBathroomsTotal ?? me.numberOfBathroomsTotal ?? me.numberOfBathrooms) ?? 0,
    },
    precio: toNum(offers.price),
    moneda: mapMoneda(offers.priceCurrency),
    operacion: bf.includes('lease') || bf.includes('rent') ? 'alquiler' : 'venta',
    responsable,
    fecha_publicacion: ld.datePosted || ld.datePublished || offers.validFrom || null,
    metodo: 'json-ld',
  };
}
function metaOf(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = html.match(re);
  return m ? m[1].trim() : null;
}
function fromOpenGraph(html) {
  const title = metaOf(html, 'og:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);
  return {
    sujeto: title ? { direccion: title, tipo_propiedad: mapTipo(title) } : {},
    precio: toNum(metaOf(html, 'product:price:amount') || metaOf(html, 'og:price:amount')),
    moneda: mapMoneda(metaOf(html, 'product:price:currency') || metaOf(html, 'og:price:currency')),
    metodo: 'opengraph',
  };
}

async function fromIA(text) {
  if (!GEMINI_API_KEY || text.length < 80) return null;
  const prompt = `Sos un extractor de datos inmobiliarios de Argentina. Del texto de un aviso, devolvé SOLO JSON válido:
{"tipo_propiedad":"departamento|casa|ph|local|oficina|terreno","direccion":"","barrio":"","m2_cubiertos":0,"dormitorios":0,"banos":0,"precio":0,"moneda":"USD|ARS","operacion":"venta|alquiler","responsable":null,"fecha_publicacion":null}
Si un dato no está usá null/0. "ambientes" no es "dormitorios": si solo hay ambientes, dormitorios = ambientes - 1.
TEXTO:"""${text.slice(0, 12000)}"""`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const j = JSON.parse(raw);
    return {
      sujeto: {
        tipo_propiedad: mapTipo(j.tipo_propiedad),
        direccion: j.direccion || '',
        barrio: j.barrio || '',
        m2_cubiertos: toNum(j.m2_cubiertos) ?? 0,
        dormitorios: toNum(j.dormitorios) ?? 0,
        banos: toNum(j.banos) ?? 0,
      },
      precio: toNum(j.precio),
      moneda: mapMoneda(j.moneda),
      operacion: j.operacion === 'alquiler' ? 'alquiler' : 'venta',
      responsable: j.responsable || null,
      fecha_publicacion: j.fecha_publicacion || null,
      metodo: 'ia',
    };
  } catch {
    return null;
  }
}

// Fallback: leer lo que se pueda del propio link (tipo, operación, ambientes) cuando
// el portal bloquea la página. No inventa: usa solo lo que está escrito en la URL.
function fromUrlSlug(url) {
  let path = '';
  try { path = decodeURIComponent(new URL(url).pathname).toLowerCase().replace(/[-_/]+/g, ' '); } catch { return null; }
  const s = { sujeto: {}, metodo: 'url-slug' };
  if (/\b(casa|chalet|quinta)\b/.test(path)) s.sujeto.tipo_propiedad = 'casa';
  else if (/\bph\b/.test(path)) s.sujeto.tipo_propiedad = 'ph';
  else if (/\b(oficina|office)\b/.test(path)) s.sujeto.tipo_propiedad = 'oficina';
  else if (/\b(local|fondo de comercio)\b/.test(path)) s.sujeto.tipo_propiedad = 'local';
  else if (/\b(terreno|lote)\b/.test(path)) s.sujeto.tipo_propiedad = 'terreno';
  else if (/\b(departamento|depto|monoambiente|ph|duplex)\b/.test(path)) s.sujeto.tipo_propiedad = 'departamento';
  if (/\b(alquiler|alquilar)\b/.test(path)) s.operacion = 'alquiler';
  else if (/\b(venta|comprar)\b/.test(path)) s.operacion = 'venta';
  const amb = path.match(/(\d+)\s*ambient/);
  if (amb) s.sujeto.dormitorios = Math.max(0, parseInt(amb[1], 10) - 1);
  const m2 = path.match(/(\d+)\s*m2\b/);
  if (m2) s.sujeto.m2_cubiertos = parseInt(m2[1], 10);
  return s;
}

async function extract(url) {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-AR',
    ...(PROXY ? { proxy: PROXY } : {}),
  });
  // Ahorro de datos (clave si se usa proxy pago por tráfico): no bajamos imágenes,
  // video ni fuentes — solo necesitamos el HTML/JSON-LD. Reduce muchísimo los MB por análisis.
  await context.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'media' || t === 'font') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    // Esperar a que pase el desafío de Cloudflare ("Un momento…"/"Just a moment…") y
    // aparezca el contenido real (JSON-LD). Reintenta hasta ~20s.
    for (let i = 0; i < 8; i++) {
      const title = await page.title().catch(() => '');
      const challenged = /just a moment|un momento|attention required|verifying you are human/i.test(title);
      const hasLd = await page.$('script[type="application/ld+json"]').then(Boolean).catch(() => false);
      if (hasLd || !challenged) break;
      await sleep(2500);
    }
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await sleep(1500);
    const html = await page.content();
    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

    const merged = { sujeto: {}, precio: null, moneda: 'USD', operacion: 'venta', responsable: null, fecha_publicacion: null, metodo: 'json-ld' };
    const apply = (p) => {
      if (!p) return;
      for (const [k, v] of Object.entries(p.sujeto || {})) {
        const empty = merged.sujeto[k] === undefined || merged.sujeto[k] === '' || merged.sujeto[k] === 0;
        if (empty && v !== undefined && v !== '' && v !== 0 && v !== null) merged.sujeto[k] = v;
      }
      for (const k of ['precio', 'moneda', 'operacion', 'responsable', 'fecha_publicacion', 'metodo']) {
        const empty = merged[k] === null || merged[k] === undefined;
        if (empty && p[k] !== undefined && p[k] !== null) merged[k] = p[k];
      }
    };
    apply(fromJsonLd(html));
    apply(fromOpenGraph(html));

    const thin = !(merged.sujeto.m2_cubiertos > 0 || merged.sujeto.dormitorios > 0);
    if (thin) apply(await fromIA(text || html.replace(/<[^>]+>/g, ' ')));

    // Último recurso: lo que diga el propio link (no pisa lo ya extraído).
    apply(fromUrlSlug(url));

    const ok = Boolean(merged.sujeto.m2_cubiertos > 0 || merged.sujeto.dormitorios > 0 || merged.precio || merged.sujeto.tipo_propiedad);
    return { ok, requiere_completar_manual: !ok, ...merged };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// ─── HTTP server ───
const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) return send(200, { ok: true, service: 'acm-extractor' });

  if (req.method === 'POST' && req.url === '/extract') {
    if (SECRET && req.headers['x-extractor-secret'] !== SECRET) return send(401, { error: 'unauthorized' });
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      let url;
      try { url = JSON.parse(body).url; } catch { return send(400, { error: 'bad json' }); }
      if (!url || !/^https?:\/\//i.test(url)) return send(400, { error: 'invalid url' });
      log('▶️  extract', url);
      limit(() => extract(url))
        .then((r) => { log('✅', url, r.ok ? 'ok' : 'thin'); send(200, r); })
        .catch((e) => { log('❌', url, e.message); send(500, { error: e.message, ok: false, requiere_completar_manual: true, sujeto: {} }); });
    });
    return;
  }

  send(404, { error: 'not found' });
});

server.listen(PORT, () => log(`🚀 ACM extractor escuchando en :${PORT} (concurrencia ${CONCURRENCY})`));

process.on('SIGTERM', async () => { try { await browser?.close(); } catch {} process.exit(0); });
