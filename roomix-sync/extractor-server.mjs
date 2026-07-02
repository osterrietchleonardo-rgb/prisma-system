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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
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
  return null; // sin señal clara NO se inventa moneda (mejor vacío → completar manual)
}
function mapTipo(raw) {
  const t = (raw || '').toLowerCase();
  if (/\bph\b|\bp\.h\.?|propiedad horizontal/.test(t)) return 'ph';
  if (/(office|oficina)/.test(t)) return 'oficina';
  if (/(local|store|commercial|premises|comercial)/.test(t)) return 'local';
  if (/(land|lote|terreno)/.test(t)) return 'terreno';
  if (/(house|casa|chalet|singlefamily|residence|quinta)/.test(t)) return 'casa';
  if (/(apart|depart|condo|flat|accommod|monoambiente|studio|loft)/.test(t)) return 'departamento';
  return 'departamento';
}

// Amenities (ES+EN) desde texto/lista → las 9 banderas del Sujeto. Solo devuelve las true.
const AMEN_RE = {
  cochera_cubierta: /cocher|garage|garaje|estacionamiento|parking/i,
  cochera_descubierta: /cochera descub|uncovered parking/i,
  baulera: /bauler|storage room|\battic\b/i,
  pileta: /\bpileta\b|piscina|\bpool\b|swimming/i,
  gimnasio: /gimnas|\bgym\b|fitness/i,
  sum: /\bs\.?u\.?m\.?\b|salon de usos|salón de usos|clubhouse/i,
  seguridad_24hs: /seguridad 24|vigilanc|24 ?hs|24 hour|porter[ií]a|portero/i,
  jardin_privado: /jard[ií]n|\bgarden\b|backyard|fondo verde/i,
  terraza_privada: /terraza|\bterrace\b|solarium|sol[áa]rium/i,
};
function mapAmenidades(text) {
  const out = {};
  const hay = (text || '').toString();
  for (const [k, re] of Object.entries(AMEN_RE)) if (re.test(hay)) out[k] = true;
  return out;
}

// Limpia la dirección: saca el sufijo del portal y el prefijo comercial "Venta/Alquiler …".
function cleanDireccion(d) {
  if (!d) return d;
  return d
    .replace(/\s*[-|]\s*(zonaprop|argenprop|mercado\s?libre|properati|inmuebles24).*$/i, '')
    .replace(/\s*\|\s*capital federal.*$/i, '')
    .replace(/^\s*(venta|alquiler|venta de|alquiler de)\s+/i, '')
    .trim();
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
    // Solo afirmamos la operación si el JSON-LD la declara (businessFunction). ML NO la trae:
    // en ese caso queda null y la decide la IA / el slug de la URL. NO se asume "venta".
    operacion: bf.includes('lease') || bf.includes('rent') ? 'alquiler'
             : (bf.includes('sell') || bf.includes('sale') ? 'venta' : null),
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

// ─── Datos "a la vista" del texto renderizado (precio/ambientes/dormitorios/baños/m²) ──
// Mismo espíritu que `parseInternal` del crawler (leer MÁS que el JSON-LD) pero PORTAL-AGNÓSTICO:
// no depende de selectores CSS que cada portal cambia, sino de lo que el aviso MUESTRA en texto.
// ML mete el precio/ambientes en el DOM (no en su JSON-LD), así que esto los rescata. Es
// DETERMINISTA (sin IA, sin costo) y en `extract()` corre de forma ADITIVA: `apply()` solo
// completa los campos que quedaron vacíos → nunca pisa lo que JSON-LD/OpenGraph ya trajeron.
function fromVisibleText(text) {
  if (!text || text.length < 40) return null;
  const t = text.replace(/\s+/g, ' ');
  const sujeto = {};

  // Ambientes/dormitorios: si el aviso no da dormitorios explícitos, dormitorios = ambientes - 1
  // (regla del proyecto: "monoambiente"/"1 ambiente" = 0 dormitorios).
  const dorm = t.match(/(\d{1,2})\s*(?:dormitorio|habitaci[oó]n|cuarto)/i);
  const amb = t.match(/(\d{1,2})\s*ambiente/i);
  if (dorm) sujeto.dormitorios = parseInt(dorm[1], 10);
  else if (/monoambiente/i.test(t)) sujeto.dormitorios = 0;
  else if (amb) sujeto.dormitorios = Math.max(0, parseInt(amb[1], 10) - 1);

  const ban = t.match(/(\d{1,2})\s*ba[ñn]o/i);
  if (ban) sujeto.banos = parseInt(ban[1], 10);

  const m2 = t.match(/(\d{2,4})\s*m(?:²|2\b|ts?2?\b)/i);
  if (m2) sujeto.m2_cubiertos = parseInt(m2[1], 10);

  // Precio: primer monto con símbolo de moneda que NO sea de expensas y sea >= 1000
  // (evita agarrar "expensas $50.000", teléfonos o números sueltos). Formato AR con puntos
  // de miles lo normaliza `toNum`. En venta AR el precio suele venir en USD ("US$"/"U$S").
  let precio = null, moneda = null;
  const priceRe = /(u\$s|us\$|usd|d[óo]lares?|ar\$|\$|pesos)\s*([0-9][0-9.\, ]{3,})/ig;
  let pm;
  while ((pm = priceRe.exec(t))) {
    const ctx = t.slice(Math.max(0, pm.index - 25), pm.index).toLowerCase();
    if (/expensa/.test(ctx)) continue;
    const val = toNum(pm[2]);
    if (val && val >= 1000) {
      precio = val;
      moneda = /u\$s|us\$|usd|d[óo]lar/i.test(pm[1]) ? 'USD' : 'ARS';
      break;
    }
  }

  // Expensas: monto que aparece etiquetado como "expensas" (parte del costo mensual).
  let expensas = null;
  const em = t.match(/expensas?\s*[:\-]?\s*(?:\$|ar\$|pesos)?\s*([0-9][0-9.\, ]{3,})/i);
  if (em) { const v = toNum(em[1]); if (v && v >= 1000) expensas = v; }

  if (!Object.keys(sujeto).length && precio == null && expensas == null) return null;
  return { sujeto, precio, moneda, expensas, metodo: 'texto-visible' };
}

// ─── Direccion + barrio desde el bloque de ubicacion del aviso ───
// Formato tipico en el texto: "Calle Numero, Barrio, Ciudad, Provincia" (ej "Montevideo al 200,
// Monserrat, Capital Federal"). ML NO pone streetAddress en el JSON-LD (deja el titulo del aviso),
// asi que de aca sacamos la CALLE real y el BARRIO. Determinista, aditivo y VALIDADO: solo devuelve
// lo que parezca una direccion/barrio de verdad (no rompe ACM: si no matchea, no completa nada).
function fromLocationText(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ');
  const out = {};
  // Barrio: "..., <Barrio>, Capital Federal" o "barrio de <Barrio>". No debe ser "Capital Federal" ni traer números.
  const bm = t.match(/,\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .'\-]{2,30}?),\s*(?:capital federal|ciudad de buenos aires|c\.?a\.?b\.?a)\b/i)
          || t.match(/barrio de ([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .'\-]{2,30}?)[.,!]/i);
  if (bm) { const b = bm[1].trim(); if (!/capital federal|buenos aires|\d/i.test(b)) out.barrio = b; }
  // Dirección: "<Calle> [al] <altura>" con la calle en palabras CAPITALIZADAS (así corta la frase en
  // minúscula previa, ej "...de la zona Montevideo al 200" → "Montevideo al 200"). Validada: rechaza
  // palabras de ficha. Si no sale limpia, no se toca (queda lo que había = no empeora ACM).
  const sm = t.match(/\b((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+\s+){0,3}[A-ZÁÉÍÓÚÑ][a-záéíóúñ.]+\s+(?:al\s+)?\d{1,5})\s*,\s*(?:[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .'\-]{2,30}?,\s*)?(?:capital federal|ciudad de buenos aires|c\.?a\.?b\.?a|buenos aires)\b/i);
  if (sm) {
    const dir = sm[1].trim();
    if (dir.length <= 45 && !/superficie|caracter|m2|m²|precio|ambiente|dormitor|ba[ñn]o|expensa|piso|informaci|zona/i.test(dir)) out.direccion = dir;
  }
  return Object.keys(out).length ? { sujeto: out, metodo: 'ubicacion-texto' } : null;
}

// La IA es el CEREBRO del extractor: recibe TODO lo que trae la página (título, URL,
// descripción, datos estructurados del portal y el texto visible) e INTERPRETA las
// variables razonando sobre el conjunto — no por listas de palabras clave. Nunca inventa:
// lo que no puede determinar lo devuelve null (moneda/operación incluidas).
async function fromIA(ctx) {
  const { text = '', title = '', url = '', jsonld = '', metaDesc = '' } = ctx || {};
  const contenido = [
    title && `TÍTULO DEL AVISO: ${title}`,
    url && `URL DE LA PUBLICACIÓN: ${url}`,
    metaDesc && `DESCRIPCIÓN (meta): ${metaDesc}`,
    jsonld && `DATOS ESTRUCTURADOS DEL PORTAL (JSON-LD): ${jsonld}`,
    text && `TEXTO VISIBLE DEL AVISO (lo que ve el usuario): ${text}`,
  ].filter(Boolean).join('\n\n').slice(0, 14000);
  if (!GEMINI_API_KEY || contenido.length < 60) return null;

  const prompt = `Sos un analista inmobiliario experto de Argentina. Te paso TODO el contenido de la página de un aviso. Leé y RAZONÁ sobre el conjunto (título, URL, descripción, datos del portal y texto), y devolvé SOLO un JSON válido (sin texto extra):
{"tipo_propiedad":"departamento|casa|ph|local|oficina|terreno","direccion":"calle y altura si aparece; si no, la zona/barrio. NUNCA el título del aviso","barrio":"","m2_cubiertos":0,"m2_semicubiertos":0,"m2_descubiertos":0,"m2_terreno":0,"antiguedad_anios":0,"dormitorios":0,"banos":0,"piso":null,"orientacion":"norte|sur|este|oeste|ne|no|se|so|null","precio":0,"moneda":"USD|ARS|null","operacion":"venta|alquiler|null","expensas":0,"responsable":"inmobiliaria o agente que publica, o null","fecha_publicacion":null,"amenities":["todos los amenities concretos que SÍ tenga: cochera, baulera, pileta, gimnasio, sum, seguridad, jardin, terraza, balcon, parrilla, etc."]}
Traé el MÁXIMO de variables que ENCUENTRES en el aviso (no dejes vacío lo que sí está escrito). Cómo razonar (interpretá lo que dice la página, NO adivines ni pongas valores por defecto):
- operacion: mirá la URL, el título y el texto. "alquiler"/"alquilar"/"renta"/"$ ... por mes" -> alquiler. "venta"/"en venta"/"comprar" -> venta. Si de verdad no se puede determinar, poné null. PROHIBIDO asumir "venta" cuando no hay señal.
- moneda: mirá CÓMO se muestra el precio. "US$"/"U$S"/"USD"/"dólares" -> USD. "$"/"ARS"/"pesos" sin símbolo de dólar -> ARS. Usá la coherencia (un alquiler mensual suele ser en ARS; una venta suele ser en USD) para desambiguar, pero mandá lo que la página realmente indica. Si no hay ninguna señal, null.
- precio: el valor de la propiedad, NUNCA las expensas ni un teléfono.
- expensas: el monto MENSUAL de expensas si el aviso lo muestra (número), en ARS. Si no aparece, 0.
- superficies: m2_cubiertos = cubierta; m2_semicubiertos = balcón/terraza semicubierta; m2_descubiertos = patio/jardín descubierto; m2_terreno = lote (casas/PH/terreno). Si solo dan superficie total, ponela en m2_cubiertos.
- piso: número de piso si aplica (PB = 0); si no corresponde/no está, null. orientacion: solo si el aviso la indica; si no, null.
- antiguedad_anios: años de antigüedad; "a estrenar"/"nuevo" = 0.
- "ambientes" NO es "dormitorios": si solo hay ambientes, dormitorios = ambientes - 1 (monoambiente/1 ambiente = 0 dormitorios).
- amenities: solo los que el aviso dice que SÍ tiene (no los que dice que NO).
- Si un dato no está: null (0 en numéricos, [] en amenities).
CONTENIDO:
"""${contenido}"""`;
  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const j = JSON.parse(raw);
    const op = j.operacion === 'alquiler' ? 'alquiler' : (j.operacion === 'venta' ? 'venta' : null);
    const ORIENT = ['norte', 'sur', 'este', 'oeste', 'ne', 'no', 'se', 'so'];
    const orient = ORIENT.includes(String(j.orientacion || '').toLowerCase()) ? String(j.orientacion).toLowerCase() : undefined;
    const piso = toNum(j.piso);
    const sujeto = {
      tipo_propiedad: mapTipo(j.tipo_propiedad),
      direccion: j.direccion || '',
      barrio: j.barrio || '',
      m2_cubiertos: toNum(j.m2_cubiertos) ?? 0,
      m2_semicubiertos: toNum(j.m2_semicubiertos) ?? 0,
      m2_descubiertos: toNum(j.m2_descubiertos) ?? 0,
      m2_terreno: toNum(j.m2_terreno) ?? 0,
      antiguedad_anios: toNum(j.antiguedad_anios) ?? 0,
      dormitorios: toNum(j.dormitorios) ?? 0,
      banos: toNum(j.banos) ?? 0,
    };
    if (piso !== null) sujeto.piso = piso;
    if (orient) sujeto.orientacion = orient;
    return {
      sujeto,
      precio: toNum(j.precio),
      moneda: mapMoneda(j.moneda), // null si la IA no la determinó
      operacion: op,               // null si la IA no la determinó
      expensas: toNum(j.expensas),
      responsable: j.responsable || null,
      fecha_publicacion: j.fecha_publicacion || null,
      metodo: 'ia',
      _amen: Array.isArray(j.amenities) ? j.amenities.join(' ') : '',
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

// ¿La página es un error/bloqueo? (algunas IPs del proxy rotativo vienen "quemadas"
// y el portal devuelve 404 / "Un momento…" / acceso denegado). Si es así, reintentamos
// con OTRA IP (cada newContext sale por una IP distinta del proxy).
function looksBadPage(title, html) {
  const t = (title || '').toLowerCase();
  if (/error 404|404 not found|p[aá]gina no encontrada|just a moment|un momento|attention required|verifying you are human|access denied|forbidden|robot/i.test(t)) return true;
  if (!html || html.length < 1500) return true;
  return false;
}

async function fetchOnce(url) {
  const context = await (await getBrowser()).newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-AR',
    ...(PROXY ? { proxy: PROXY } : {}),
  });
  // Ahorro de datos (clave con proxy por tráfico): no bajamos imágenes, video ni fuentes.
  await context.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'media' || t === 'font') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    // Esperar a que pase el desafío de Cloudflare y aparezca el contenido real.
    for (let i = 0; i < 8; i++) {
      const ttl = await page.title().catch(() => '');
      const challenged = /just a moment|un momento|attention required|verifying you are human/i.test(ttl);
      const hasLd = await page.$('script[type="application/ld+json"]').then(Boolean).catch(() => false);
      if (hasLd || !challenged) break;
      await sleep(2500);
    }
    // Si la IP trajo contenido (JSON-LD o cuerpo con texto) esperamos a que termine de pintar.
    // Si NO hay nada (IP quemada: solo el <head>), no perdemos ~7s: devolvemos ya para reintentar
    // con otra IP del proxy rotativo (cada newContext sale por un IP distinto).
    const hasLd = await page.$('script[type="application/ld+json"]').then(Boolean).catch(() => false);
    const bodyLen = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
    if (hasLd || bodyLen > 500) {
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      await sleep(1200);
    }
    const html = await page.content();
    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const title = await page.title().catch(() => '');
    return { html, text, title };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// Puntaje de contenido REAL de una página: prioriza JSON-LD y, si no, la cantidad de texto
// renderizado. Una IP quemada devuelve el <head> (título/OpenGraph) pero 0 texto y 0 JSON-LD →
// puntaje 0. Sirve para (a) decidir si vale la pena reintentar con otra IP y (b) quedarnos con
// el MEJOR intento si al final ninguna IP trae la página completa.
function pageScore(r) {
  const ld = parseJsonLdNodes(r.html || '').length;
  const txt = (r.text || '').length;
  return ld * 100000 + txt;
}

async function extract(url, maxAttempts = 5, debug = false) {
  let best = { html: '', text: '', title: '' };
  let bestScore = -1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let r;
    try {
      r = await fetchOnce(url);
    } catch (e) {
      log('⚠️ intento', attempt, 'falló:', e.message);
      r = { html: '', text: '', title: '' };
    }
    const score = pageScore(r);
    if (score > bestScore) { best = r; bestScore = score; } // nos quedamos con el más completo
    // Página buena Y con contenido real (JSON-LD o texto sustancioso) → listo. Si NO trajo
    // contenido (IP quemada que igual "parece" válida: título ok, algo de HTML), REINTENTAMOS
    // con otra IP en vez de aceptar datos vagos. Este era el bug: aceptaba la página vacía.
    const conContenido = parseJsonLdNodes(r.html || '').length > 0 || (r.text || '').length > 300;
    if (!looksBadPage(r.title, r.html) && conContenido) break;
    log('↻ IP sin contenido (', (r.title || '').slice(0, 40), '| score', score, ') reintento', attempt, '/', maxAttempts);
    await sleep(700);
  }

  const { html, text, title } = best;
  // SIN valores por defecto: lo que no se determine queda null → se completa a mano.
  const merged = { sujeto: {}, precio: null, moneda: null, operacion: null, expensas: null, responsable: null, fecha_publicacion: null, metodo: null };
  const apply = (p) => {
    if (!p) return;
    for (const [k, v] of Object.entries(p.sujeto || {})) {
      const empty = merged.sujeto[k] === undefined || merged.sujeto[k] === '' || merged.sujeto[k] === 0;
      if (empty && v !== undefined && v !== '' && v !== 0 && v !== null) merged.sujeto[k] = v;
    }
    for (const k of ['precio', 'moneda', 'operacion', 'expensas', 'responsable', 'fecha_publicacion', 'metodo']) {
      const empty = merged[k] === null || merged[k] === undefined;
      if (empty && p[k] !== undefined && p[k] !== null) merged[k] = p[k];
    }
  };

  // 1) Deterministas: NÚMEROS duros y datos estructurados exactos del portal (precio, m², ambientes).
  //    No inventan moneda/operación: solo las ponen si el portal las declara explícitamente.
  apply(fromJsonLd(html));
  apply(fromOpenGraph(html));
  apply(fromVisibleText(text));

  // 2) IA = CEREBRO. Recibe TODO el contenido de la página (título, URL, descripción, JSON-LD y
  //    texto) y razona. Tiene PRIORIDAD en la interpretación (operación, moneda, tipo, responsable),
  //    y completa cualquier número que faltara. Corre SIEMPRE (no solo cuando faltan datos).
  const metaDesc = metaOf(html, 'og:description') || metaOf(html, 'description') || '';
  const ldNodes = parseJsonLdNodes(html);
  const jsonldStr = ldNodes.length ? JSON.stringify(ldNodes).slice(0, 4000) : '';
  const iaRes = await fromIA({ text, title, url, jsonld: jsonldStr, metaDesc });
  if (iaRes) {
    apply(iaRes); // completa lo que falte (números, dirección/barrio si vinieron vacíos)
    // La interpretación de la IA pisa a los deterministas: razona sobre toda la página, no por keywords.
    if (iaRes.operacion) merged.operacion = iaRes.operacion;
    if (iaRes.moneda) merged.moneda = iaRes.moneda;
    if (iaRes.sujeto && iaRes.sujeto.tipo_propiedad) merged.sujeto.tipo_propiedad = iaRes.sujeto.tipo_propiedad;
    if (iaRes.responsable) merged.responsable = iaRes.responsable;
  }

  // 3) Último recurso para la operación: lo que diga el propio link (solo si sigue sin definirse).
  apply(fromUrlSlug(url));

  // Dirección/barrio reales del bloque de ubicación (ML deja el TÍTULO en dirección).
  const loc = fromLocationText(text);
  if (loc && loc.sujeto) {
    if (!merged.sujeto.barrio && loc.sujeto.barrio) merged.sujeto.barrio = loc.sujeto.barrio;
    // Si la dirección actual parece un título (larga o con "!") y hay una calle real, la reemplazamos.
    const cur = merged.sujeto.direccion || '';
    const curEsTitulo = !cur || cur.length > 45 || /[!¡]/.test(cur);
    if (loc.sujeto.direccion && curEsTitulo) merged.sujeto.direccion = loc.sujeto.direccion;
  }

  // Amenities: usamos la lista curada de la IA si la hay (precisa); si no, el texto del aviso.
  const amenSource = iaRes && iaRes._amen && iaRes._amen.length > 3 ? iaRes._amen : text;
  const amen = mapAmenidades(amenSource);
  if (Object.keys(amen).length) merged.sujeto.amenidades = amen;

  // Limpiar la dirección (sacar título/portal/error).
  merged.sujeto.direccion = cleanDireccion(merged.sujeto.direccion);
  if (/error 404|404|just a moment|un momento|access denied|forbidden/i.test(merged.sujeto.direccion || '')) merged.sujeto.direccion = '';
  // Si quedó sin dirección, al menos dejamos el barrio como referencia.
  if (!merged.sujeto.direccion && merged.sujeto.barrio) merged.sujeto.direccion = merged.sujeto.barrio;

  // "ok" solo si trajimos datos SUSTANCIOSOS de la página (precio o m²). Los datos de slug
  // (tipo/operación/dormitorios de la URL) NO alcanzan para darlo por bueno: si la IP quedó
  // quemada y solo tenemos eso, marcamos requiere_completar_manual para que el asesor/agente
  // sepa que la lectura fue parcial (en vez de mostrar datos vagos como si fueran completos).
  const ok = Boolean(merged.precio > 0 || merged.sujeto.m2_cubiertos > 0);
  const result = { ok, requiere_completar_manual: !ok, ...merged };
  // Modo debug (temporal): devuelve un pedazo del texto renderizado y los @type del JSON-LD,
  // para verificar/afinar los parsers contra la página real sin adivinar. NO afecta la salida normal.
  if (debug) {
    result._text = (text || '').slice(0, 3500);
    result._jsonld = parseJsonLdNodes(html).slice(0, 4).map((n) => ({ '@type': n['@type'], name: n.name, address: n.address }));
  }
  return result;
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
      let url, debug = false;
      try { const b = JSON.parse(body); url = b.url; debug = !!b.debug; } catch { return send(400, { error: 'bad json' }); }
      if (!url || !/^https?:\/\//i.test(url)) return send(400, { error: 'invalid url' });
      log('▶️  extract', url);
      limit(() => extract(url, 5, debug))
        .then((r) => { log('✅', url, r.ok ? 'ok' : 'thin'); send(200, r); })
        .catch((e) => { log('❌', url, e.message); send(500, { error: e.message, ok: false, requiere_completar_manual: true, sujeto: {} }); });
    });
    return;
  }

  send(404, { error: 'not found' });
});

server.listen(PORT, () => log(`🚀 ACM extractor escuchando en :${PORT} (concurrencia ${CONCURRENCY})`));

process.on('SIGTERM', async () => { try { await browser?.close(); } catch {} process.exit(0); });
