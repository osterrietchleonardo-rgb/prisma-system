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
const SITEMAP_RETRIES = 3;
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

// Tope de páginas para `en-argentina` (tier 2). Es el listado "todo el país": tiene
// CIENTOS de páginas y casi siempre trae +1 nueva, así que el corte por "2 páginas
// vacías" no se gatilla nunca → la recolección se colgaba ahí durante horas y la tubería
// NUNCA llegaba a guardar. AMBA (la prioridad) se recolecta completo igual. Configurable.
const VENTA_AR_MAX_PAGES = process.env.VENTA_AR_MAX_PAGES !== undefined ? parseInt(process.env.VENTA_AR_MAX_PAGES) : 60;

const VENTA_SEED_GROUPS = [
  // maxPages 0 = sin tope: estos listados se autocortan solos (2 páginas seguidas sin nuevas).
  { tier: 0, label: 'AMBA', maxPages: 0, seeds: ['en-capital-federal', ...CONURBANO_SEEDS] },
  { tier: 2, label: 'Argentina', maxPages: VENTA_AR_MAX_PAGES, seeds: ['en-argentina'] },
];
// Override global para pruebas (aplica a TODOS los grupos): VENTA_MAX_PAGES=2
const VENTA_MAX_PAGES = process.env.VENTA_MAX_PAGES !== undefined ? parseInt(process.env.VENTA_MAX_PAGES) : 0;

// Barrios de CABA + partidos del conurbano (AMBA), en forma "slug" (sin acentos, con guiones).
// Se usa solo para ORDENAR la cola (best-effort): si no matchea, no afecta la corrección de datos.
const AMBA_TOKENS = new Set([
  // CABA
  'palermo','recoleta','belgrano','caballito','almagro','flores','floresta','balvanera','barracas',
  'saavedra','nunez','colegiales','chacarita','boedo','san-telmo','monserrat','retiro','constitucion',
  'puerto-madero','parque-patricios','paternal','agronomia','coghlan','liniers','mataderos',
  'parque-chacabuco','parque-chas','velez-sarsfield','versalles','villa-crespo','villa-urquiza',
  'villa-lugano','villa-devoto','villa-del-parque','villa-general-mitre','villa-ortuzar',
  'villa-pueyrredon','villa-real','villa-riachuelo','villa-santa-rita','villa-soldati','monte-castro',
  'nueva-pompeya','pompeya','once','barrio-norte','microcentro','centro','distrito-centro','congreso',
  'abasto','las-canitas','las-caitas','caitas','san-cristobal','san-nicolas',
  // GBA / conurbano (AMBA)
  'vicente-lopez','san-isidro','tigre','san-fernando','pilar','escobar','malvinas-argentinas',
  'jose-c-paz','san-miguel','moreno','merlo','moron','ituzaingo','hurlingham','tres-de-febrero',
  'san-martin','general-san-martin','la-matanza','ramos-mejia','lomas-de-zamora','lanus','avellaneda',
  'quilmes','berazategui','florencio-varela','almirante-brown','esteban-echeverria','ezeiza',
  'presidente-peron','san-vicente','adrogue','banfield','temperley','bernal','wilde','sarandi',
  'olivos','martinez','beccar','boulogne','victoria','munro','florida','villa-ballester','caseros',
  'ciudadela','castelar','haedo','palomar','el-palomar','don-torcuato','benavidez','nordelta','garin',
  'del-viso','villa-rosa'
]);

function isAmba(slug) {
  if (!slug) return false;
  const s = `-${slug}-`;
  for (const t of AMBA_TOKENS) if (s.includes(`-${t}-`)) return true;
  return false;
}

// Prioridad (menor = se procesa antes):
//   0 = Venta AMBA | 1 = Venta resto prov. BsAs | 2 = Venta resto Argentina
//   3 = Alquiler AMBA | 4 = Alquiler resto
// Todas las VENTAS bajan antes que cualquier ALQUILER.
function priorityRank(entry) {
  if (entry._venta) return entry._vtier ?? 2;
  return isAmba(entry.slug) ? 3 : 4;
}

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

async function fetchVentaSeeds(context) {
  log('🏷️', 'Recolectando propiedades EN VENTA (prioridad por zona)...');
  const byId = new Map();
  const page = await context.newPage();
  try {
    await page.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await sleep(1500);

    for (const group of VENTA_SEED_GROUPS) {
      const before = byId.size;
      // Tope efectivo: el override global de pruebas gana; si no, el del grupo (0 = sin tope).
      const pageCap = VENTA_MAX_PAGES > 0 ? VENTA_MAX_PAGES : (group.maxPages || 0);
      for (const seed of group.seeds) {
        let pageNum = 1, emptyStreak = 0;
        while (true) {
          if (pageCap > 0 && pageNum > pageCap) {
            log('🏁', `venta[${group.label}]/${seed} alcanzó el tope de ${pageCap} páginas, corto seed`);
            break;
          }
          const url = `https://roomix.ai/buscar/comprar/${seed}?page=${pageNum}`;

          let res = await browserFetch(page, url);
          if (res.error) {
            if (res.status === 403 || res.status >= 500) {
              await sleep(8000);
              res = await browserFetch(page, url); // un reintento
            }
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
            if (byId.has(id)) continue; // ya visto en un grupo de mayor prioridad → conserva su tier
            byId.set(id, { loc: `https://roomix.ai/propiedad/${slug}`, slug, id, lastmod: null, _venta: true, _vtier: group.tier });
            added++;
          }
          log('🏷️', `venta[${group.label}]/${seed} p${pageNum}: +${added} nuevas (acum ${byId.size})`);

          if (added === 0) { if (++emptyStreak >= 2) break; } else emptyStreak = 0;
          pageNum++;
          await sleep(1200);
        }
      }
      log('🏷️', `Grupo ${group.label} (tier ${group.tier}): +${byId.size - before} ventas`);
    }
  } catch (e) {
    log('⚠️', `fetchVentaSeeds falló (sigo con sitemaps): ${e.message}`);
  } finally {
    await page.close();
  }
  log('🏷️', `Total propiedades en venta recolectadas: ${byId.size}`);
  return [...byId.values()];
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

async function diffWithSupabase(sitemapEntries) {
  log('🔍', 'Comparando con Supabase...');
  
  let existing = [];
  let from = 0;
  const step = 1000;
  while (true) {
    // .order('id') OBLIGATORIO: sin orden explícito, Postgres no garantiza el mismo
    // orden entre páginas de .range() → filas repetidas y otras salteadas, y los
    // conteos de nuevas/eliminar salen mal (en una corrida: 32976 vs 54581 sobre la
    // MISMA tabla con segundos de diferencia).
    const { data, error } = await supabase.from('roomix_properties').select('id, lastmod').order('id', { ascending: true }).range(from, from + step - 1);
    if (error) { log('❌', 'Error DB:', error.message); return { toExtract: sitemapEntries, toDelete: [] }; }
    existing = existing.concat(data || []);
    if (!data || data.length < step) break;
    from += step;
  }
  
  log('📦', `Propiedades en BD: ${existing.length}`);

  const exMap = new Map((existing || []).map(r => [r.id, r.lastmod]));
  const sMap = new Set(sitemapEntries.map(e => e.id));

  const newE = sitemapEntries.filter(e => !exMap.has(e.id));
  const modE = sitemapEntries.filter(e => e.lastmod && exMap.get(e.id) && new Date(e.lastmod) > new Date(exMap.get(e.id)));
  const delIds = [...exMap.keys()].filter(id => !sMap.has(id));

  log('📊', `Nuevas: ${newE.length} | Mod.: ${modE.length} | Elim. (potencial): ${delIds.length}`);
  return { toExtract: [...newE, ...modE], toDelete: delIds };
}

// Borra de la BD las propiedades que ya no están en Roomix (salieron del catálogo).
// Frenos de seguridad: solo si los sitemaps cargaron completos, y aborta si borraría >40% de la BD.
async function deleteMissing(entries) {
  const liveIds = new Set(entries.map(e => e.id));

  let dbIds = [], from = 0;
  const step = 1000;
  while (true) {
    // .order('id') OBLIGATORIO (mismo motivo que en diffWithSupabase): sin orden,
    // .range() pagina inconsistente y el cálculo de qué borrar queda mal.
    const { data, error } = await supabase.from('roomix_properties').select('id').order('id', { ascending: true }).range(from, from + step - 1);
    if (error) { log('❌', 'Error leyendo IDs para borrar:', error.message); return; }
    dbIds = dbIds.concat((data || []).map(r => r.id));
    if (!data || data.length < step) break;
    from += step;
  }

  const toDelete = dbIds.filter(id => !liveIds.has(id));
  if (toDelete.length === 0) { log('🗑️', 'Nada para eliminar'); return; }

  if (toDelete.length > dbIds.length * 0.4) {
    log('⚠️', `Eliminaría ${toDelete.length}/${dbIds.length} (>40%) → ABORTADO por seguridad (posible catálogo incompleto)`);
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

// Operación REAL de Roomix. Ojo: el JSON-LD `businessFunction` NO sirve —
// las VENTAS no lo traen y los ALQUILERES siempre dicen "LeaseOut", así que todo
// terminaba como 'rent' o null. El dato fiable es `operation_type` (venta/alquiler/temporal)
// del payload de Next.js; como respaldo, el título arranca con "VENTA"/"ALQUILER".
function parseOperationType(html, title) {
  const m = html.match(/operation_type["\\]*\s*:\s*["\\]*(venta|alquiler|temporal)\b/i);
  if (m) return m[1].toLowerCase() === 'venta' ? 'sale' : 'rent';
  const t = (title || '').trim().toUpperCase();
  if (t.startsWith('VENTA')) return 'sale';
  if (t.startsWith('ALQUILER')) return 'rent';
  return null;
}

function mapToRow(jsonLd, agent, entry, operationType) {
  const off = jsonLd.offers || {}, me = jsonLd.mainEntity || {}, add = me.address || {};
  const geo = jsonLd.geo || me.geo || {}, fs = me.floorSize || jsonLd.floorSize || {};
  // Fallback heredado (businessFunction) solo si operationType no se pudo determinar.
  const bf = off.businessFunction || '', bfOp = bf.includes('Lease') ? 'rent' : bf.includes('Sell') ? 'sale' : null;
  const op = operationType || bfOp;

  return {
    id: entry.id, slug: entry.slug, canonical_url: entry.loc,
    title: jsonLd.name || null, description: jsonLd.description || null, operation: op,
    price: off.price ? parseFloat(off.price) : null, currency: off.priceCurrency || null,
    property_type: me['@type'] || null,
    rooms: (jsonLd.numberOfRooms || me.numberOfRooms) ? parseInt(jsonLd.numberOfRooms || me.numberOfRooms) : null,
    bedrooms: (jsonLd.numberOfBedrooms || me.numberOfBedrooms) ? parseInt(jsonLd.numberOfBedrooms || me.numberOfBedrooms) : null,
    bathrooms: (jsonLd.numberOfBathroomsTotal || me.numberOfBathroomsTotal) ? parseInt(jsonLd.numberOfBathroomsTotal || me.numberOfBathroomsTotal) : null,
    area_m2: fs.value ? parseFloat(fs.value) : null,
    address: add.streetAddress || null, neighborhood: add.addressLocality || null,
    lat: geo.latitude ? parseFloat(geo.latitude) : null, lng: geo.longitude ? parseFloat(geo.longitude) : null,
    amenities: (Array.isArray(me.amenityFeature || jsonLd.amenityFeature) ? (me.amenityFeature || jsonLd.amenityFeature) : []).map(a => typeof a === 'string' ? a : a.name || '').filter(Boolean),
    images: (Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]).filter(Boolean),
    roomix_agency_name: agent?.name || null, roomix_agency_logo: agent?.image || null, roomix_agency_source_url: agent?.seller_url || null,
    lastmod: entry.lastmod, updated_at: new Date().toISOString()
  };
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

    const operationType = parseOperationType(html, jsonLd.name);
    const row = mapToRow(jsonLd, parseAgent(html), entry, operationType);
    const txt = [row.title, row.description, row.neighborhood, (row.amenities || []).join(', ')].filter(Boolean).join(' ').trim();
    if (txt) row.embedding = await generateEmbedding(txt);

    log('✅', `${entry.id} → ${(row.title || '').substring(0, 40)}...`);
    return row;
  } catch (err) {
    log('❌', `Error ${entry.id}: ${err.message.substring(0,60)}`);
    return null;
  }
}

async function processQueue(queue, checkpoint, context) {
  const limit = pLimit(CONCURRENCY);
  let processed = 0, errors = 0;
  const pages = await Promise.all(Array.from({ length: CONCURRENCY }, () => context.newPage()));

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
    if (i + CONCURRENCY < queue.length) await sleep(BATCH_DELAY_MS);
  }

  await Promise.all(pages.map(p => p.close()));
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
    // 1) Ventas (fuente prioritaria, por zona) + 2) Sitemaps (todo el catálogo)
    const ventaEntries = await fetchVentaSeeds(context);
    const { entries: sitemapEntries, ok: sitemapsOk } = await fetchSitemaps(context);
    if (sitemapEntries.length === 0 && ventaEntries.length === 0) { log('❌', 'Sin entradas'); process.exit(1); }

    // Merge: base = sitemap (tiene lastmod, clave para detectar modificaciones).
    // Las de venta enriquecen con su flag/tier sin pisar el lastmod del sitemap.
    const byId = new Map();
    for (const e of sitemapEntries) byId.set(e.id, e);
    for (const e of ventaEntries) {
      const ex = byId.get(e.id);
      if (ex) { ex._venta = true; ex._vtier = e._vtier; }   // ya estaba en sitemap → conserva lastmod
      else byId.set(e.id, e);                                 // venta que no está en sitemap → la agrego
    }
    let entries = [...byId.values()];

    // Orden: Venta AMBA > Venta prov. BsAs > Venta Argentina > Alquiler AMBA > Alquiler resto
    entries.sort((a, b) => priorityRank(a) - priorityRank(b));
    log('🎯', `Cola priorizada → en venta: ${ventaEntries.length} | total únicas: ${entries.length}`);

    // Borrado de propiedades que salieron de Roomix (solo en corrida completa y con sitemaps OK).
    if (PROPERTY_LIMIT === 0) {
      if (sitemapsOk) await deleteMissing(entries);
      else log('⚠️', 'Algún sitemap falló → NO se eliminan propiedades (freno de seguridad)');
    } else {
      log('ℹ️', 'Corrida con --limit → se omite el borrado');
    }

    const work = PROPERTY_LIMIT > 0 ? entries.slice(0, PROPERTY_LIMIT) : entries;
    const { toExtract } = await diffWithSupabase(work);
    const pending = toExtract.filter(e => !checkpoint.processedIds.has(e.id));

    if (pending.length > 0) {
      log('🚀', `Procesando ${pending.length} propiedades...`);
      const { processed, errors } = await processQueue(pending, checkpoint, context);
      log('✅', `Final: ${processed} OK, ${errors} Errores`);
    } else {
      log('✅', 'Nada para extraer');
    }

    // Corrida terminada OK → vaciar checkpoint para no bloquear futuras modificaciones.
    clearCheckpoint();
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
