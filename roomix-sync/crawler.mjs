#!/usr/bin/env node
// ============================================================================
// Roomix Property Crawler v4 — Playwright Stealth Mode Completo
// ============================================================================
// Estrategia:
//   - Usa playwright-extra + stealth plugin
//   - Navega a la home de Roomix para obtener clearance de Cloudflare.
//   - Usa el browser context autorizado para leer Sitemaps y Propiedades.
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import pLimit from 'p-limit';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

chromium.use(stealthPlugin());

// ─── Config ──────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

if (existsSync(ENV_PATH)) {
  const envContent = readFileSync(ENV_PATH, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error('❌ Faltan variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ─── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const PROPERTY_LIMIT = process.env.PROPERTY_LIMIT !== undefined ? parseInt(process.env.PROPERTY_LIMIT) : (limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0);

// ─── Constants ───────────────────────────────────────────────────────────────

// Roomix expone sitemaps de propiedades numerados 0..N. Antes leíamos 0..5 y
// nos salteábamos el 6 (≈30k URLs). Configurable por si crece el catálogo.
// OJO: blindado. Si la variable SITEMAP_COUNT está VACÍA, negativa o con basura →
// caemos al default de 7. Una vez la dejaron vacía en EasyPanel y el crawler leyó
// 0 sitemaps (catálogo completo apagado) sin avisar. Nunca más. El 0 EXPLÍCITO sí
// se respeta (útil para pruebas: desactiva sitemaps a propósito); el accidente real
// era la cadena vacía ('' → parseInt = NaN → Array.from({length:NaN}) = []).
const _sitemapCountRaw = parseInt(process.env.SITEMAP_COUNT ?? '', 10);
const SITEMAP_COUNT = Number.isFinite(_sitemapCountRaw) && _sitemapCountRaw >= 0 ? _sitemapCountRaw : 7;
const SITEMAP_URLS = Array.from({ length: SITEMAP_COUNT }, (_, i) =>
  `https://roomix.ai/properties/sitemap/${i}`
);

// Concurrencia de extracción de fichas. 4 = buen balance velocidad/riesgo de Cloudflare.
// Configurable por env: si en los logs aparecen muchos ⏳ (403/429), bajarla.
const CONCURRENCY = process.env.CRAWLER_CONCURRENCY !== undefined ? parseInt(process.env.CRAWLER_CONCURRENCY) : 4;
const BATCH_DELAY_MS = 1500;
const PAGE_TIMEOUT = 45_000;
const SITEMAP_TIMEOUT = 90_000; // Los sitemaps son XML pesados, necesitan más tiempo
const SITEMAP_RETRIES = 4;
const CHECKPOINT_FILE = resolve(__dirname, 'checkpoint.json');
const xmlParser = new XMLParser({ ignoreAttributes: false });

// ─── Prioridad: Ventas + AMBA primero ─────────────────────────────────────────
// Roomix tiene páginas de listado ya filtradas por operación+zona en /buscar/comprar/<seed>.
// Las usamos como fuente prioritaria de propiedades EN VENTA (paginadas con ?page=N).
// Grupos de listados de venta en orden de prioridad (tier). El tier de una propiedad
// = el del PRIMER grupo donde aparece (por eso AMBA captura primero, luego país).
//   tier 0 = Venta AMBA (CABA + los 29 partidos del conurbano)
//   tier 2 = Venta resto de Argentina
//
// IMPORTANTE — seeds verificados contra Roomix real (Junio 24). Los slugs viejos eran
// engañosos: `en-buenos-aires` devolvía el listado GENÉRICO idéntico a `en-capital-federal`
// (99/99 props repetidas → +0 siempre); `en-zona-norte`/`en-zona-sur` filtraban por la
// COSTA atlántica (Villa Gesell), NO por el conurbano AMBA. Por eso en producción esos
// grupos daban +0. La forma correcta y comprobada de cubrir AMBA es CABA + cada partido
// del conurbano por su slug propio (`en-<partido>`): los 29 filtran bien (overlap ~0 con
// capital, ~50 props/página). El resto del país lo barre `en-argentina` (tier 2).
const CONURBANO_SEEDS = [
  // Norte
  'en-vicente-lopez', 'en-san-isidro', 'en-san-fernando', 'en-tigre', 'en-escobar',
  'en-pilar', 'en-malvinas-argentinas', 'en-jose-c-paz', 'en-san-miguel',
  'en-general-san-martin', 'en-san-martin',
  // Oeste
  'en-tres-de-febrero', 'en-hurlingham', 'en-ituzaingo', 'en-moron', 'en-merlo',
  'en-moreno', 'en-la-matanza',
  // Sur
  'en-avellaneda', 'en-lanus', 'en-lomas-de-zamora', 'en-almirante-brown', 'en-quilmes',
  'en-berazategui', 'en-florencio-varela', 'en-esteban-echeverria', 'en-ezeiza',
  'en-presidente-peron', 'en-san-vicente',
];

// Barrios de CABA por su slug propio (`en-<barrio>`). Extraídos del `sitemap-barrios.xml`
// de Roomix (loc `/barrios/<slug>-caba`) y VERIFICADOS contra `/buscar/comprar/en-<barrio>`
// (Junio 26): cada uno devuelve ~48-50 props/página, overlap ~0 entre barrios (filtran bien)
// y tienen profundidad real (Palermo trae props hasta la p90). Antes la fase de ventas usaba
// un solo seed `en-capital-federal` (combinado) a 15 págs → muestreaba el ~15% de CABA. Ahora
// barre barrio por barrio en profundidad. Los alias/sub-zonas (once, congreso, microcentro…)
// solapan con barrios oficiales pero el diff en memoria los deduplica (no hay doble descarga).
const CABA_SEEDS = [
  'en-belgrano',  // ← arranca por Belgrano (pedido de Leonardo)
  'en-palermo', 'en-recoleta', 'en-caballito', 'en-villa-crespo', 'en-almagro',
  'en-nunez', 'en-colegiales', 'en-villa-urquiza', 'en-devoto', 'en-flores', 'en-floresta',
  'en-balvanera', 'en-san-telmo', 'en-la-boca', 'en-barracas', 'en-boedo', 'en-parque-patricios',
  'en-mataderos', 'en-liniers', 'en-paternal', 'en-villa-del-parque', 'en-villa-luro',
  'en-monte-castro', 'en-versalles', 'en-villa-real', 'en-velez-sarsfield', 'en-villa-lugano',
  'en-villa-soldati', 'en-villa-riachuelo', 'en-parque-avellaneda', 'en-parque-chacabuco',
  'en-nueva-pompeya', 'en-san-cristobal', 'en-monserrat', 'en-san-nicolas', 'en-puerto-madero',
  'en-retiro', 'en-constitucion', 'en-chacarita', 'en-villa-ortuzar', 'en-agronomia',
  'en-villa-pueyrredon', 'en-saavedra', 'en-coghlan', 'en-villa-santa-rita', 'en-abasto',
  'en-barrio-norte', 'en-catalinas', 'en-centro-microcentro', 'en-congreso', 'en-once',
  'en-parque-centenario', 'en-pompeya', 'en-tribunales', 'en-villa-general-mitre',
];

// Tope de páginas para `en-argentina` (tier 2). Es el listado "todo el país": tiene
// CIENTOS de páginas y casi siempre trae +1 nueva, así que el corte por "2 páginas
// vacías" no se gatilla nunca → la recolección se colgaba ahí durante horas y la tubería
// NUNCA llegaba a guardar. Configurable.
const VENTA_AR_MAX_PAGES = process.env.VENTA_AR_MAX_PAGES !== undefined ? parseInt(process.env.VENTA_AR_MAX_PAGES) : 60;

// Tope de páginas por seed de AMBA (CABA + cada partido del conurbano). CLAVE:
// medido en producción (Junio 25), Roomix permite pedir hasta ~100 páginas por
// búsqueda y SOLO devuelve vacío en la p101 — de la p1 a la p100 siempre trae
// propiedades (de la zona, ~50/página). O sea el autocorte por "2 páginas vacías"
// recién salta a las 100 páginas EN CADA seed.
// Default **90** (desde Junio 26): se barre cada barrio/partido EN PROFUNDIDAD (Palermo solo
// tiene props hasta la p90). OJO: desde la IP del servidor (Easypanel) Cloudflare frena fuerte
// tras ~150-200 páginas seguidas (medido: 5 min POR página). Mitigaciones: (a) guardado zona por
// zona —si CF corta, lo hecho queda—; (b) refresco de sesión CF **antes de cada zona** y, dentro
// de una zona larga, **cada `VENTA_CHUNK_PAGES` páginas** (re-navega a la home → renueva
// `cf_clearance`). Subir el tope junta más por zona pero acelera el throttling; bajarlo, al revés.
const VENTA_AMBA_MAX_PAGES = process.env.VENTA_AMBA_MAX_PAGES !== undefined ? parseInt(process.env.VENTA_AMBA_MAX_PAGES) : 90;
// Cada cuántas páginas, dentro de una misma zona, refrescar la cookie de Cloudflare (volver a
// la home). Pedido de Leonardo: 15 págs → refresco → 15 más → … hasta el tope de la zona.
const VENTA_CHUNK_PAGES = process.env.VENTA_CHUNK_PAGES !== undefined ? parseInt(process.env.VENTA_CHUNK_PAGES) : 15;
// Cada cuántas FICHAS bajadas refrescar la cookie de Cloudflare en la FASE DE BAJADA (processBatch).
// CLAVE (medido en producción Jun 28): collectSeed —juntar links de las páginas de listado— sí
// refrescaba cada VENTA_CHUNK_PAGES, pero la bajada ficha-por-ficha (page.goto a /propiedad/…) NO
// refrescaba NUNCA. Tras unos cientos de navegaciones seguidas Cloudflare frena la IP de EasyPanel
// y TODO empieza a dar `Timeout 45000ms` (death spiral: el log se llena de errores y deja de guardar).
// Aplicamos la misma lógica que en la recolección: cada EXTRACT_CHUNK fichas, re-navegar al home →
// renovar cf_clearance → seguir. OJO: el throttle de CF es en parte por IP (no solo cookie), así que
// esto MITIGA pero conviene combinarlo con CRAWLER_CONCURRENCY más baja si sigue frenando.
const EXTRACT_CHUNK = process.env.EXTRACT_CHUNK !== undefined ? parseInt(process.env.EXTRACT_CHUNK) : 40;

const VENTA_SEED_GROUPS = [
  // AMBA = barrios de CABA + partidos del conurbano, cada uno en profundidad (hasta 90 págs).
  // Se quitó el seed combinado `en-capital-federal`: los barrios cubren CABA y las contadas
  // propiedades sin barrio asignado las recoge igual la fase de sitemaps (backstop de completitud).
  { tier: 0, label: 'AMBA', maxPages: VENTA_AMBA_MAX_PAGES, seeds: [...CABA_SEEDS, ...CONURBANO_SEEDS] },
  { tier: 2, label: 'Argentina', maxPages: VENTA_AR_MAX_PAGES, seeds: ['en-argentina'] },
];
// Override global para pruebas (aplica a TODOS los grupos): VENTA_MAX_PAGES=2
const VENTA_MAX_PAGES = process.env.VENTA_MAX_PAGES !== undefined ? parseInt(process.env.VENTA_MAX_PAGES) : 0;

// Nota: la prioridad de AMBA ya no se calcula por barrio. El flujo procesa las zonas
// de venta en orden (AMBA primero, por VENTA_SEED_GROUPS) y guarda cada una al toque.

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(emoji, ...args) { console.log(`${emoji}`, new Date().toISOString().slice(11, 19), ...args); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function extractIdFromUrl(url) {
  const seg = url.split('/').pop() || '';
  return seg.lastIndexOf('-') !== -1 ? seg.slice(seg.lastIndexOf('-') + 1) : seg;
}
function extractSlugFromUrl(url) { return url.split('/').pop() || ''; }

// ─── Checkpoint ──────────────────────────────────────────────────────────────

function loadCheckpoint() {
  try {
    if (existsSync(CHECKPOINT_FILE)) {
      const d = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
      return { processedIds: new Set(d.processed_ids || []), lastRun: d.last_run || null };
    }
  } catch (e) { log('⚠️', 'Checkpoint corrupto'); }
  return { processedIds: new Set(), lastRun: null };
}

function saveCheckpoint(processedIds) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({
    processed_ids: [...processedIds],
    last_run: new Date().toISOString(),
    count: processedIds.size
  }, null, 2), 'utf-8');
}

// El checkpoint sirve para REANUDAR una corrida que se cortó a la mitad. Si la corrida
// terminó bien, lo vaciamos: así la próxima vez NO bloquea las propiedades que cambiaron
// (el diff por lastmod las vuelve a bajar y actualizar).
function clearCheckpoint() {
  try {
    writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processed_ids: [], last_run: new Date().toISOString(), count: 0 }, null, 2), 'utf-8');
  } catch (e) { log('⚠️', 'No se pudo limpiar checkpoint:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: INITIALIZE BROWSER & CF CLEARANCE
// ═══════════════════════════════════════════════════════════════════════════════

async function initBrowser() {
  log('🌐', 'Iniciando Chromium (Stealth)...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }
  });

  log('🛡️', 'Navegando a Roomix para resolver Cloudflare...');
  const page = await context.newPage();
  try {
    await page.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await sleep(4000); // Dar tiempo al challenge para completarse
    const title = await page.title();
    log('✅', `Clearance CF posible — Title: "${title}"`);
  } catch (e) {
    log('⚠️', 'Error en warmup:', e.message);
  }
  await page.close();

  return { browser, context };
}

// fetch DENTRO del browser (mantiene el fingerprint TLS de Chromium y el clearance de CF)
async function browserFetch(page, url) {
  return page.evaluate(async (u) => {
    try {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };
      return { text: await res.text(), status: res.status };
    } catch (e) {
      return { error: e.message, status: 0 };
    }
  }, url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1.5: VENTAS (fuente prioritaria desde /buscar/comprar/<seed>?page=N)
// ═══════════════════════════════════════════════════════════════════════════════

// Recolecta los links de UNA zona (seed). Devuelve sus entries de venta (solo links,
// no baja fichas). Corta por tope de páginas o por autocorte (2 páginas sin nuevas).
// El guardado en Supabase lo hace main(), zona por zona, para no perder lo recolectado
// si Cloudflare frena a mitad de camino.
async function collectSeed(page, label, tier, seed, pageCap) {
  const out = new Map();
  let pageNum = 1, emptyStreak = 0;
  while (true) {
    if (pageCap > 0 && pageNum > pageCap) {
      log('🏁', `venta[${label}]/${seed} alcanzó el tope de ${pageCap} páginas`);
      break;
    }
    // Refresco de cookie CF cada VENTA_CHUNK_PAGES páginas DENTRO de la zona (antes de p16, p31, …):
    // re-navega a la home → re-resuelve el challenge y renueva `cf_clearance`, que usa browserFetch.
    if (VENTA_CHUNK_PAGES > 0 && pageNum > 1 && (pageNum - 1) % VENTA_CHUNK_PAGES === 0) {
      try {
        await page.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
        await sleep(1500);
        log('🔄', `venta[${label}]/${seed}: refresco cookie CF (antes de p${pageNum})`);
      } catch (e) { log('⚠️', `venta/${seed} no pudo refrescar CF: ${e.message}`); }
    }
    const url = `https://roomix.ai/buscar/comprar/${seed}?page=${pageNum}`;
    let res = await browserFetch(page, url);
    if (res.error) {
      if (res.status === 403 || res.status >= 500) { await sleep(8000); res = await browserFetch(page, url); }
      if (res.error) { log('⚠️', `venta/${seed} p${pageNum} → ${res.error}, corto seed`); break; }
    }

    // Los slugs de propiedad terminan en "-<8 hex>"; ese sufijo es el id.
    const found = new Set();
    const re = /\\?"slug\\?":\\?"([a-z0-9-]+-[0-9a-f]{8})(?=\\?")/gi;
    let m;
    while ((m = re.exec(res.text))) found.add(m[1]);

    let added = 0;
    for (const slug of found) {
      const id = slug.slice(slug.lastIndexOf('-') + 1);
      if (out.has(id)) continue;
      out.set(id, { loc: `https://roomix.ai/propiedad/${slug}`, slug, id, lastmod: null, _venta: true, _vtier: tier });
      added++;
    }
    log('🏷️', `venta[${label}]/${seed} p${pageNum}: +${added} (acum zona ${out.size})`);

    if (added === 0) { if (++emptyStreak >= 2) break; } else emptyStreak = 0;
    pageNum++;
    await sleep(1200);
  }
  return [...out.values()];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: SITEMAPS (Via fetch DENTRO del browser para mantener fingerprint CF)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchSitemaps(context) {
  log('📡', `Descargando ${SITEMAP_URLS.length} sitemaps via browser fetch...`);
  const allEntries = [];
  let allOk = true; // si algún sitemap falla, NO habilitamos el borrado (catálogo incompleto)
  const page = await context.newPage();
  
  // Navegar a roomix.ai para tener el origin correcto (evita CORS/Failed to fetch)
  await page.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  await sleep(2000);

  for (const url of SITEMAP_URLS) {
    const sitemapIdx = url.split('/').pop();
    let success = false;

    for (let attempt = 1; attempt <= SITEMAP_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          const backoff = attempt * 10_000;
          log('🔄', `Reintentando sitemap ${sitemapIdx} (intento ${attempt}/${SITEMAP_RETRIES}, espera ${backoff/1000}s)...`);
          await sleep(backoff);
        }

        // Ejecutar fetch DENTRO del browser para mantener el fingerprint TLS de Chromium
        const result = await page.evaluate(async (fetchUrl) => {
          try {
            const res = await fetch(fetchUrl, { credentials: 'include' });
            if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };
            const text = await res.text();
            return { text, status: res.status };
          } catch (e) {
            return { error: e.message, status: 0 };
          }
        }, url);

        if (result.error) {
          if (result.status === 403 || result.status >= 500) {
            log('⚠️', `Sitemap ${sitemapIdx} → ${result.error}, reintentando...`);
            if (attempt < SITEMAP_RETRIES) continue;
            log('💀', `Sitemap ${sitemapIdx} fallido (${result.error})`);
            break;
          }
          throw new Error(result.error);
        }

        const xmlMatch = result.text.match(/<urlset[\s\S]*<\/urlset>/);
        if (!xmlMatch) {
          log('⚠️', `Sitemap ${sitemapIdx} sin XML válido (intento ${attempt}, ${result.text.length} chars)`);
          if (attempt < SITEMAP_RETRIES) continue;
          break;
        }

        const parsed = xmlParser.parse(xmlMatch[0]);
        const urlSet = parsed?.urlset?.url;
        if (!urlSet) { break; }

        const entries = Array.isArray(urlSet) ? urlSet : [urlSet];
        for (const entry of entries) {
          const loc = entry.loc;
          if (loc && loc.includes('/propiedad/')) {
            allEntries.push({
              loc,
              lastmod: entry.lastmod ? new Date(entry.lastmod).toISOString() : null,
              id: extractIdFromUrl(loc),
              slug: extractSlugFromUrl(loc)
            });
          }
        }
        log('✅', `Sitemap ${sitemapIdx}: ${entries.length} entradas`);
        success = true;
        break;
      } catch (err) {
        log('❌', `Error sitemap ${sitemapIdx} (intento ${attempt}/${SITEMAP_RETRIES}):`, err.message);
        if (attempt === SITEMAP_RETRIES) {
          log('💀', `Sitemap ${sitemapIdx} fallido después de ${SITEMAP_RETRIES} intentos`);
        }
      }
    }

    if (!success) allOk = false;
    if (success) await sleep(2000);
  }

  await page.close();
  log('📊', `Total entradas: ${allEntries.length} (sitemaps completos: ${allOk ? 'sí' : 'NO'})`);
  return { entries: allEntries, ok: allOk };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: INCREMENTAL DIFF
// ═══════════════════════════════════════════════════════════════════════════════

// Lee id+lastmod de TODA la BD una sola vez (Map id→lastmod). Sirve para el diff
// EN MEMORIA zona por zona, sin re-leer las 54k filas en cada zona.
async function loadExistingMap() {
  const map = new Map();
  let from = 0; const step = 1000;
  while (true) {
    const { data, error } = await supabase.from('roomix_properties').select('id, lastmod').order('id', { ascending: true }).range(from, from + step - 1);
    if (error) { log('❌', 'Error leyendo catálogo:', error.message); break; }
    for (const r of (data || [])) map.set(r.id, r.lastmod);
    if (!data || data.length < step) break;
    from += step;
  }
  return map;
}

// Borra de la BD las propiedades que ya no están en Roomix (salieron del catálogo).
// La SEÑAL fiable de baja es la AUSENCIA del id en los sitemaps vivos (la página de detalle
// de una propiedad dada de baja sigue respondiendo 200, así que el 404 NO sirve).
//
// Antes el borrado solo corría si los 7 sitemaps cargaban PERFECTOS (sitemapsOk). Con 6
// archivos de ~10MB sobre Cloudflare casi siempre fallaba uno → el borrado NUNCA corría y se
// acumulaban fantasmas. Ahora el gate es MEDIDO en vez de todo-o-nada:
//   1) Solo borra si el catálogo vivo cargó bien: liveIds ≥ 90% de la BD (el sitemap de
//      Roomix es mucho más grande que la BD, así que si cargó OK esto sobra; si la mayoría
//      de sitemaps falló, liveIds queda chico y NO se borra).
//   2) Tope de seguridad ajustado: aborta si borraría más de max(1500, 5% de la BD). Las
//      bajas reales por corrida son chicas (decenas/cientos); un número grande = carga
//      parcial → se aborta. (Una baja errónea no es catastrófica: la propiedad sigue viva en
//      Roomix y la próxima corrida la vuelve a bajar e insertar.)
async function deleteMissing(entries, dbCountHint = 0) {
  const liveIds = new Set(entries.map(e => e.id));

  let dbIds = [], from = 0;
  const step = 1000;
  while (true) {
    // .order('id') OBLIGATORIO: sin orden, .range() pagina inconsistente (filas
    // repetidas/salteadas entre páginas) y el cálculo de qué borrar queda mal.
    const { data, error } = await supabase.from('roomix_properties').select('id').order('id', { ascending: true }).range(from, from + step - 1);
    if (error) { log('❌', 'Error leyendo IDs para borrar:', error.message); return; }
    dbIds = dbIds.concat((data || []).map(r => r.id));
    if (!data || data.length < step) break;
    from += step;
  }

  // GATE 1 — ¿cargamos suficiente catálogo vivo para confiar en el diff?
  if (liveIds.size < dbIds.length * 0.9) {
    log('⚠️', `Catálogo vivo (${liveIds.size}) < 90% de la BD (${dbIds.length}) → NO se borra (carga incompleta)`);
    return;
  }

  const toDelete = dbIds.filter(id => !liveIds.has(id));
  if (toDelete.length === 0) { log('🗑️', 'Nada para eliminar'); return; }

  // GATE 2 — tope medido. Bajas reales por corrida = chicas. Un número grande huele a carga parcial.
  const cap = Math.max(1500, Math.floor(dbIds.length * 0.05));
  if (toDelete.length > cap) {
    log('⚠️', `Eliminaría ${toDelete.length} (> tope ${cap}) → ABORTADO por seguridad (posible carga incompleta)`);
    return;
  }

  log('🗑️', `Eliminando ${toDelete.length} propiedades que ya no están en Roomix...`);
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 500) {
    const chunk = toDelete.slice(i, i + 500);
    const { error } = await supabase.from('roomix_properties').delete().in('id', chunk);
    if (error) { log('❌', `Error borrando lote: ${error.message}`); continue; }
    deleted += chunk.length;
  }
  log('🗑️', `Eliminadas ${deleted}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4: EXTRACTION & PARSING
// ═══════════════════════════════════════════════════════════════════════════════

function parseJsonLd(html) {
  let m;
  const regex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = regex.exec(html))) {
    try {
      const j = JSON.parse(m[1]);
      if (j['@type'] === 'RealEstateListing') return j;
      if (Array.isArray(j)) {
        const l = j.find(i => i['@type'] === 'RealEstateListing');
        if (l) return l;
      }
    } catch {}
  }
  return null;
}

function parseAgent(html) {
  const m1 = html.match(/\\"agent\\":\{([\s\S]*?)\}(?=,\\"|}\s)/);
  if (m1) try { return JSON.parse(`{${m1[1]}}`.replace(/\\"/g, '"')); } catch {}
  const m2 = html.match(/"agent"\s*:\s*(\{[^}]+\})/);
  if (m2) try { return JSON.parse(m2[1]); } catch {}
  return null;
}

// ─── Objeto interno de Roomix (payload Next.js / RSC) ──────────────────────────
// Cada ficha /propiedad/ trae, además del JSON-LD, un objeto MUCHO más rico embebido
// en los <script>self.__next_f.push([1,"..."])</script>. Ese objeto tiene barrio/ciudad/
// región estructurados, antigüedad, expensas, m² total y cubierto, piso, fecha de
// publicación, teléfono, índices geo H3, el LINK ORIGINAL del portal (ZonaProp/ML), etc.
// El JSON-LD se queda como respaldo. Anclamos la extracción al slug de la propiedad para
// no confundirnos con objetos de "propiedades similares" que la página también embebe.
function buildRscBlob(html) {
  const pushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(m => m[1]);
  return pushes.join('')
    .replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseInternal(html, slug) {
  try {
    const blob = buildRscBlob(html);
    // Ventana del objeto principal: anclada al slug (id único de la ficha). operation_type
    // viene ~1500 chars antes del slug; phone/h3 vienen después. Tomamos un margen amplio.
    let win = blob;
    const slugIdx = slug ? blob.indexOf(`"slug":"${slug}"`) : -1;
    if (slugIdx !== -1) {
      win = blob.slice(Math.max(0, slugIdx - 2200), slugIdx + 900);
    } else {
      const opIdx = blob.indexOf('"operation_type"');
      if (opIdx === -1) return null;
      win = blob.slice(Math.max(0, opIdx - 400), opIdx + 2000);
    }
    const str = (re) => { const m = win.match(re); return m && m[1] != null ? m[1] : null; };
    const num = (re) => { const m = win.match(re); return m && m[1] != null ? parseFloat(m[1]) : null; };
    const int = (re) => { const m = win.match(re); return m && m[1] != null ? parseInt(m[1], 10) : null; };
    return {
      operation_type: str(/"operation_type":"(venta|alquiler|temporal)"/),
      property_type_es: str(/"property_type":"([^"]*)"/),
      expenses: num(/"expenses":(\d+(?:\.\d+)?)/),
      expenses_currency: str(/"expenses_currency":"([^"]*)"/),
      total_usd: num(/"total_usd":(\d+(?:\.\d+)?)/),
      location_address: str(/"location_address":"([^"]*)"/),
      region: str(/"location_region":"([^"]*)"/),
      city: str(/"location_city":"([^"]*)"/),
      neighborhood: str(/"location_neighborhood":"([^"]*)"/),
      total_area_m2: num(/"total_area_m2":(\d+(?:\.\d+)?)/),
      covered_area_m2: num(/"covered_area_m2":(\d+(?:\.\d+)?)/),
      property_age_years: int(/"property_age_years":(\d+)/),
      floor: int(/"floor":(\d+)/),
      publication_date: str(/"publication_date":"([^"]*)"/),
      status: /"status":true/.test(win) ? true : (/"status":false/.test(win) ? false : null),
      phone: str(/"phone":"(\+?[0-9]+)"/),
      whatsapp: str(/"whatsapp":"(\+?[0-9]+)"/),
      h3_res6: str(/"h3_res6":"([^"]*)"/),
      h3_res8: str(/"h3_res8":"([^"]*)"/),
      // El primer "url" no-roomix dentro de la ventana = ficha original del portal.
      source_listing_url: str(/"url":"(https?:\/\/(?!roomix\.ai)[^"]+)"/),
    };
  } catch { return null; }
}

// País: Roomix pone addressCountry "AR" hasta para Uruguay (no sirve). Lo derivamos del
// prefijo telefónico (fiable), de palabras clave de la región/dirección y, en última
// instancia, de coordenadas. Default 'AR' (el catálogo es casi todo argentino).
function deriveCountry(internal, lat, lng) {
  const ph = internal?.phone || '';
  if (ph.startsWith('+598')) return 'UY';
  if (ph.startsWith('+595')) return 'PY';
  if (ph.startsWith('+56')) return 'CL';
  if (ph.startsWith('+54')) return 'AR';
  const txt = `${internal?.region || ''} ${internal?.location_address || ''}`.toLowerCase();
  if (/\b(maldonado|punta del este|montevideo|canelones|colonia|rocha|piri[aá]polis|jos[eé] ignacio|la barra|uruguay)\b/.test(txt)) return 'UY';
  // Uruguay está al este del Río de la Plata: a latitud rioplatense, lng > -57.6 ya es UY.
  if (lat != null && lng != null && lat < -30 && lat > -35.2 && lng > -57.6 && lng < -53) return 'UY';
  return 'AR';
}

// Operación final. REGLA pedida por Leonardo: si el TÍTULO dice VENTA/ALQUILER explícito,
// MANDA EL TÍTULO por encima de operation_type (Roomix a veces clasifica mal: vimos una
// "Oportunidad en VENTA U$S 269.000" marcada como alquiler en el payload). Si el título no
// es explícito, usamos operation_type del payload y, como último respaldo, businessFunction.
function resolveOperation(internal, jsonLd, title) {
  const t = (title || '').toUpperCase();
  let titleOp = null;
  if (t.startsWith('VENTA') || /(^|\s|")VENTA(\s|:|")/.test(t) || /EN VENTA/.test(t)) titleOp = 'sale';
  else if (t.startsWith('ALQUILER') || /(^|\s|")ALQUILER(\s|:|")/.test(t) || /EN ALQUILER/.test(t)) titleOp = 'rent';

  const ot = internal?.operation_type;
  const internalOp = ot === 'venta' ? 'sale' : (ot === 'alquiler' || ot === 'temporal') ? 'rent' : null;

  const bf = (jsonLd?.offers?.businessFunction) || '';
  const bfOp = bf.includes('Lease') ? 'rent' : bf.includes('Sell') ? 'sale' : null;

  return titleOp || internalOp || bfOp;
}

function mapToRow(jsonLd, agent, entry, internal) {
  const off = jsonLd.offers || {}, me = jsonLd.mainEntity || {}, add = me.address || {};
  const geo = jsonLd.geo || me.geo || {}, fs = me.floorSize || jsonLd.floorSize || {};

  const lat = geo.latitude ? parseFloat(geo.latitude) : null;
  const lng = geo.longitude ? parseFloat(geo.longitude) : null;
  // Barrio: el interno (location_neighborhood) es más fiable que el JSON-LD addressLocality
  // (que muchas veces viene null). Caemos al JSON-LD solo si el interno no lo trae.
  const neighborhood = internal?.neighborhood || add.addressLocality || null;
  // m²: priorizamos total_area_m2 del interno; respaldo floorSize del JSON-LD.
  const areaM2 = internal?.total_area_m2 ?? (fs.value ? parseFloat(fs.value) : null);

  return {
    id: entry.id, slug: entry.slug, canonical_url: entry.loc,
    title: jsonLd.name || null, description: jsonLd.description || null,
    operation: resolveOperation(internal, jsonLd, jsonLd.name),
    price: off.price ? parseFloat(off.price) : null, currency: off.priceCurrency || null,
    property_type: me['@type'] || null,                 // se mantiene el valor JSON-LD (no romper ACM)
    category: internal?.property_type_es || null,       // tipo en español (Departamento/Casa/PH/Local…)
    rooms: (jsonLd.numberOfRooms || me.numberOfRooms) ? parseInt(jsonLd.numberOfRooms || me.numberOfRooms) : null,
    bedrooms: (jsonLd.numberOfBedrooms || me.numberOfBedrooms) ? parseInt(jsonLd.numberOfBedrooms || me.numberOfBedrooms) : null,
    bathrooms: (jsonLd.numberOfBathroomsTotal || me.numberOfBathroomsTotal) ? parseInt(jsonLd.numberOfBathroomsTotal || me.numberOfBathroomsTotal) : null,
    area_m2: areaM2,
    covered_area_m2: internal?.covered_area_m2 ?? null,
    address: internal?.location_address || add.streetAddress || null,
    neighborhood, region: internal?.region || null, city: internal?.city || null,
    country: deriveCountry(internal, lat, lng),
    lat, lng,
    property_age_years: internal?.property_age_years ?? null,
    floor: internal?.floor ?? null,
    expenses: internal?.expenses ?? null, expenses_currency: internal?.expenses_currency || null,
    total_usd: internal?.total_usd ?? null,
    date_posted: internal?.publication_date ? new Date(internal.publication_date).toISOString() : null,
    availability: off.availability ? String(off.availability).split('/').pop() : null,  // InStock / SoldOut…
    business_function: bf_short(off.businessFunction),
    is_active: internal?.status ?? null,
    phone: internal?.phone || null, whatsapp: internal?.whatsapp || null,
    h3_res6: internal?.h3_res6 || null, h3_res8: internal?.h3_res8 || null,
    amenities: (Array.isArray(me.amenityFeature || jsonLd.amenityFeature) ? (me.amenityFeature || jsonLd.amenityFeature) : []).map(a => typeof a === 'string' ? a : a.name || '').filter(Boolean),
    images: (Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]).filter(Boolean),
    roomix_agency_name: agent?.name || null, roomix_agency_logo: agent?.image || null,
    roomix_agency_source_url: agent?.seller_url || null,
    source_listing_url: internal?.source_listing_url || null,   // ficha ORIGINAL del portal (ZonaProp/ML/Argenprop)
    lastmod: entry.lastmod, updated_at: new Date().toISOString()
  };
}

function bf_short(bf) {
  if (!bf) return null;
  if (String(bf).includes('Lease')) return 'rent';
  if (String(bf).includes('Sell')) return 'sale';
  return null;
}

async function generateEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { parts: [{ text: text.substring(0, 10000) }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 }) });
  if (!res.ok) throw new Error(`Embedding ${res.status}`);
  return (await res.json()).embedding.values;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5: PAGE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

async function extractProperty(page, entry, retries = 0) {
  try {
    const res = await page.goto(entry.loc, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    const status = res?.status();

    if (status === 403 || status === 429 || status >= 500) {
      if (retries < 2) {
        log('⏳', `${status} en ${entry.id}, reintentando (${retries+1}/2)...`);
        await sleep(5000 * (retries + 1));
        return extractProperty(page, entry, retries + 1);
      }
      throw new Error(`HTTP ${status}`);
    }

    await sleep(2000); // JS Render
    const html = await page.content();
    const jsonLd = parseJsonLd(html);
    if (!jsonLd) { log('⚠️', `Sin JSON-LD: ${entry.id}`); return null; }

    const internal = parseInternal(html, entry.slug);
    const row = mapToRow(jsonLd, parseAgent(html), entry, internal);
    const txt = [row.title, row.description, row.neighborhood, (row.amenities || []).join(', ')].filter(Boolean).join(' ').trim();
    if (txt) row.embedding = await generateEmbedding(txt);

    log('✅', `${entry.id} → ${(row.title || '').substring(0, 40)}...`);
    return row;
  } catch (err) {
    // Timeout de navegación = Cloudflare frenando. Reintentamos UNA vez tras una pausa: el refresco
    // periódico de cookie en processBatch mantiene cf_clearance fresca, así que el reintento tiene
    // chance real. A propósito NO navegamos al home acá adentro: con CONCURRENCY workers en paralelo
    // sería una estampida de gotos al home (otros 45s cada uno). El refresco lo coordina processBatch.
    if (/Timeout .* exceeded/i.test(err.message) && retries < 1) {
      log('⏳', `Timeout en ${entry.id}, reintento (${retries+1}/1)...`);
      await sleep(3000);
      return extractProperty(page, entry, retries + 1);
    }
    log('❌', `Error ${entry.id}: ${err.message.substring(0,60)}`);
    return null;
  }
}

// Baja y guarda una tanda de propiedades, de a CONCURRENCY a la vez, reusando las
// páginas ya abiertas. El guardado (upsert) es inmediato por propiedad. Va anotando
// el checkpoint para poder reanudar si la corrida se corta.
async function processBatch(queue, checkpoint, pages) {
  const limit = pLimit(CONCURRENCY);
  let processed = 0, errors = 0, sinceRefresh = 0;
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const batch = queue.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((entry, idx) => limit(async () => {
      if (checkpoint.processedIds.has(entry.id)) { processed++; return; }
      const page = pages[idx % pages.length];
      const row = await extractProperty(page, entry);
      if (!row) { errors++; return; }
      const { error } = await supabase.from('roomix_properties').upsert(row, { onConflict: 'id' });
      if (error) { log('❌', `DB Error ${entry.id}: ${error.message}`); errors++; return; }
      checkpoint.processedIds.add(entry.id);
      processed++;
    })));
    saveCheckpoint(checkpoint.processedIds);

    // Refresco de cookie CF cada EXTRACT_CHUNK fichas (la misma lógica que collectSeed, pero para la
    // bajada). cf_clearance vive en el context y la comparten las páginas worker → con re-navegar UNA
    // al home alcanza para renovarla en todas. Solo si quedan fichas por bajar (no al final del lote).
    sinceRefresh += batch.length;
    const hayMas = i + CONCURRENCY < queue.length;
    if (EXTRACT_CHUNK > 0 && hayMas && sinceRefresh >= EXTRACT_CHUNK) {
      try {
        await pages[0].goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
        await sleep(1500);
        log('🔄', `bajada: refresco cookie CF (tras ${sinceRefresh} fichas)`);
      } catch (e) { log('⚠️', `bajada: no pudo refrescar CF: ${e.message}`); }
      sinceRefresh = 0;
    }

    if (hayMas) await sleep(BATCH_DELAY_MS);
  }
  return { processed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const t0 = Date.now();
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  🏠 Roomix Crawler v4 — Playwright Stealth Completado         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  log('⚙️', `Límite: ${PROPERTY_LIMIT === 0 ? 'TODO' : PROPERTY_LIMIT}`);

  const checkpoint = loadCheckpoint();
  const { browser, context } = await initBrowser();

  try {
    // Leemos el catálogo actual UNA vez (id→lastmod) para el diff en memoria por zona.
    log('🔍', 'Leyendo catálogo actual de Supabase...');
    const existing = await loadExistingMap();
    log('📦', `Propiedades en BD: ${existing.size}`);

    // Páginas reusables: 1 para recolectar listados, CONCURRENCY para bajar fichas.
    const collector = await context.newPage();
    const workers = await Promise.all(Array.from({ length: CONCURRENCY }, () => context.newPage()));

    // Acumulador de TODOS los ids vivos vistos (ventas + sitemap) para el borrado final.
    const liveIds = new Set();
    let totNew = 0, totErr = 0, totSeen = 0;

    // ── VENTAS: zona por zona, GUARDANDO al terminar cada una ──────────────────────
    // Si Cloudflare frena/EasyPanel se traba a mitad, lo de las zonas anteriores YA
    // quedó en Supabase. Antes se juntaba TODO primero → un corte = 0 guardado.
    for (const group of VENTA_SEED_GROUPS) {
      const pageCap = VENTA_MAX_PAGES > 0 ? VENTA_MAX_PAGES : (group.maxPages || 0);
      for (const seed of group.seeds) {
        // Refrescar la sesión de Cloudflare antes de cada zona (mitiga el throttling
        // acumulado: re-resuelve el challenge y renueva la cookie cf_clearance).
        try { await collector.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }); await sleep(1500); } catch {}

        const zona = await collectSeed(collector, group.label, group.tier, seed, pageCap);
        for (const e of zona) liveIds.add(e.id);
        totSeen += zona.length;

        // Diff EN MEMORIA: nuevas (no están en la BD) y no procesadas ya en esta corrida.
        // Las de venta vienen con lastmod null, así que el "modificada" lo resuelven los sitemaps.
        let pending = zona.filter(e => !checkpoint.processedIds.has(e.id) && !existing.has(e.id));
        if (PROPERTY_LIMIT > 0) pending = pending.slice(0, Math.max(0, PROPERTY_LIMIT - totNew));
        if (pending.length === 0) { log('✅', `${seed}: 0 nuevas para guardar (acum corrida ${totNew})`); continue; }

        log('🚀', `${seed}: guardando ${pending.length} nuevas...`);
        const { processed, errors } = await processBatch(pending, checkpoint, workers);
        for (const e of pending) existing.set(e.id, e.lastmod); // ya están en BD → no re-procesar en otra zona
        totNew += processed; totErr += errors;
        log('💾', `${seed}: +${processed} guardadas (${errors} err) | total ventas corrida: ${totNew}`);

        if (PROPERTY_LIMIT > 0 && totNew >= PROPERTY_LIMIT) { log('ℹ️', `Alcanzado --limit ${PROPERTY_LIMIT}`); break; }
      }
      if (PROPERTY_LIMIT > 0 && totNew >= PROPERTY_LIMIT) break;
    }
    log('🏁', `VENTAS: ${totNew} guardadas de ${totSeen} vistas (${totErr} errores)`);

    // ── SITEMAPS: catálogo completo (mayormente alquileres), al final ──────────────
    // Las ventas (prioridad) ya están guardadas; si esto se corta, no se pierde lo de arriba.
    let sitemapsOk = false;
    if (PROPERTY_LIMIT === 0 && SITEMAP_COUNT > 0) {
      const { entries: sitemapEntries, ok } = await fetchSitemaps(context);
      sitemapsOk = ok;
      for (const e of sitemapEntries) liveIds.add(e.id);

      const pend = sitemapEntries.filter(e => {
        if (checkpoint.processedIds.has(e.id)) return false;
        if (!existing.has(e.id)) return true;                                  // nueva
        const old = existing.get(e.id);
        return e.lastmod && old && new Date(e.lastmod) > new Date(old);        // modificada
      });
      if (pend.length > 0) {
        log('🚀', `Sitemaps: ${pend.length} nuevas/modificadas...`);
        const { processed, errors } = await processBatch(pend, checkpoint, workers);
        log('💾', `Sitemaps: +${processed} guardadas (${errors} err)`);
      } else {
        log('✅', 'Sitemaps: nada nuevo para guardar');
      }
    } else if (SITEMAP_COUNT === 0) {
      log('ℹ️', 'SITEMAP_COUNT=0 → se omiten sitemaps');
    }

    // ── BORRADO: las que salieron de Roomix (ausentes del sitemap vivo) ─────────────
    // Ya NO exige sitemaps perfectos (eso bloqueaba el borrado siempre). deleteMissing
    // tiene gate medido: solo borra si el catálogo vivo cargó ≥90% de la BD, y aborta si
    // el número a borrar supera el tope de seguridad.
    if (PROPERTY_LIMIT === 0 && SITEMAP_COUNT > 0) {
      if (!sitemapsOk) log('⚠️', 'Aviso: algún sitemap no cargó perfecto; deleteMissing decidirá por volumen de catálogo vivo.');
      await deleteMissing([...liveIds].map(id => ({ id })), existing.size);
    }

    await Promise.all([collector, ...workers].map(p => p.close().catch(() => {})));
    log('✅', `Final: ${totNew} ventas nuevas, ${totErr} errores`);

    // Corrida terminada OK → vaciar checkpoint para no bloquear futuras modificaciones.
    clearCheckpoint();
  } finally {
    await browser.close();
  }
}

// Solo corre el crawler cuando se ejecuta directo (node crawler.mjs / spawn del cron).
// Si se importa el módulo (p.ej. en un test), NO dispara la corrida — solo expone funciones.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
}

export { parseInternal, parseJsonLd, parseAgent, mapToRow, resolveOperation, deriveCountry, buildRscBlob, collectSeed, initBrowser, extractProperty, processBatch };
