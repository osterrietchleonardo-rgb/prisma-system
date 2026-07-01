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
  return 'USD';
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
  let precio = null, moneda = 'USD';
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

  if (!Object.keys(sujeto).length && precio == null) return null;
  return { sujeto, precio, moneda, metodo: 'texto-visible' };
}

// ─── Direccion + barrio desde el bloque de ubicacion del aviso ───
// Formato tipico en el texto: "Calle Numero, Barrio, Ciudad, Provincia" (ej "Montevideo al 200,
// Monserrat, Capital Federal"). ML NO pone streetAddress en el JSON-LD (deja el titulo del aviso),
// asi que de aca sacamos la CALLE real y el BARRIO. Determinista, aditivo y VALIDADO: solo devuelve
// lo que parezca una direccion/barrio de verdad (no rompe ACM: si no matchea, no completa nada).
function fromLocationText(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ');
  const re = /([A-Za-zÁÉÍÓÚÑáéíóúñ0-9.º°'\- ]{4,45}?),\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .'\-]{2,35}?),\s*(capital federal|ciudad de buenos aires|c\.?a\.?b\.?a|buenos aires|gran buenos aires)\b/i;
  const m = t.match(re);
  if (!m) return null;
  let dir = m[1].trim().replace(/^(ubicaci[oó]n|ver en el mapa|mapa|direcci[oó]n)\s*/i, '').trim();
  const barrio = m[2].trim();
  const out = { barrio };
  // La dirección SOLO si quedó una calle+altura LIMPIA ("Montevideo al 200"): sin palabras de
  // ficha (superficie/m2/ambientes/etc), sin "!", y con forma calle + número al final. Si no,
  // no se toca (queda lo que había = no empeora ACM).
  if (dir.length <= 45 && !/[!¡]/.test(dir)
      && !/superficie|caracter|m2|m²|ubicaci|precio|ambiente|dormitor|ba[ñn]o|expensa|piso/i.test(dir)
      && /^[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.'\- ]*\s+(?:al\s+)?\d{1,5}$/.test(dir)) {
    out.direccion = dir;
  }
  return { sujeto: out, metodo: 'ubicacion-texto' };
}

async function fromIA(text) {
  if (!GEMINI_API_KEY || text.length < 80) return null;
  const prompt = `Sos un extractor de datos inmobiliarios de Argentina. Del texto de un aviso, devolvé SOLO JSON válido (sin texto extra), MUY meticuloso:
{"tipo_propiedad":"departamento|casa|ph|local|oficina|terreno","direccion":"calle y altura si aparece; si no, la zona. NUNCA el título del aviso","barrio":"","m2_cubiertos":0,"m2_descubiertos":0,"antiguedad_anios":0,"dormitorios":0,"banos":0,"precio":0,"moneda":"USD|ARS","operacion":"venta|alquiler","responsable":"inmobiliaria o agente que publica, o null","fecha_publicacion":null,"amenities":["TODOS los servicios/amenities concretos que SÍ tenga: cochera, baulera, pileta, gimnasio, sum, seguridad, jardin, terraza, balcon, parrilla, etc."]}
Reglas: si un dato no está usá null/0/[]. "ambientes" NO es "dormitorios": si solo hay ambientes, dormitorios = ambientes - 1. En amenities NO incluyas cosas que el aviso diga que NO tiene. m2_cubiertos = superficie cubierta; si solo dan superficie total, poné ese número en m2_cubiertos.
TEXTO:"""${text.slice(0, 12000)}"""`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
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
        m2_descubiertos: toNum(j.m2_descubiertos) ?? 0,
        antiguedad_anios: toNum(j.antiguedad_anios) ?? 0,
        dormitorios: toNum(j.dormitorios) ?? 0,
        banos: toNum(j.banos) ?? 0,
      },
      precio: toNum(j.precio),
      moneda: mapMoneda(j.moneda),
      operacion: j.operacion === 'alquiler' ? 'alquiler' : 'venta',
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
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await sleep(1200);
    const html = await page.content();
    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const title = await page.title().catch(() => '');
    return { html, text, title };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function extract(url, maxAttempts = 3, debug = false) {
  let best = { html: '', text: '', title: '' };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let r;
    try {
      r = await fetchOnce(url);
    } catch (e) {
      log('⚠️ intento', attempt, 'falló:', e.message);
      r = { html: '', text: '', title: '' };
    }
    best = r;
    if (!looksBadPage(r.title, r.html)) break; // página buena → salimos
    log('↻ IP mala (', (r.title || '').slice(0, 40), ') reintento', attempt, '/', maxAttempts);
    await sleep(700);
  }

  const { html, text } = best;
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
  // Rescate determinista de lo que el aviso MUESTRA (precio/ambientes/m²), típico de ML que
  // no lo pone en el JSON-LD. Aditivo. Corre ANTES del gate `thin`: si ya completó m²/dormitorios,
  // ni siquiera hace falta gastar la IA abajo.
  apply(fromVisibleText(text));

  let iaRes = null;
  const thin = !(merged.sujeto.m2_cubiertos > 0 || merged.sujeto.dormitorios > 0);
  if (thin) { iaRes = await fromIA(text || html.replace(/<[^>]+>/g, ' ')); apply(iaRes); }

  // Último recurso: lo que diga el propio link (no pisa lo ya extraído).
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

  const ok = Boolean(merged.sujeto.m2_cubiertos > 0 || merged.sujeto.dormitorios > 0 || merged.precio);
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
      limit(() => extract(url, 3, debug))
        .then((r) => { log('✅', url, r.ok ? 'ok' : 'thin'); send(200, r); })
        .catch((e) => { log('❌', url, e.message); send(500, { error: e.message, ok: false, requiere_completar_manual: true, sujeto: {} }); });
    });
    return;
  }

  send(404, { error: 'not found' });
});

server.listen(PORT, () => log(`🚀 ACM extractor escuchando en :${PORT} (concurrencia ${CONCURRENCY})`));

process.on('SIGTERM', async () => { try { await browser?.close(); } catch {} process.exit(0); });
