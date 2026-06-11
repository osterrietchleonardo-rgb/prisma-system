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

const SITEMAP_URLS = Array.from({ length: 6 }, (_, i) =>
  `https://roomix.ai/properties/sitemap/${i}`
);

const CONCURRENCY = 2; // Menos concurrencia para evitar flags
const BATCH_DELAY_MS = 1500;
const PAGE_TIMEOUT = 45_000;
const CHECKPOINT_FILE = resolve(__dirname, 'checkpoint.json');
const xmlParser = new XMLParser({ ignoreAttributes: false });

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

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: SITEMAPS (Via Browser)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchSitemaps(context) {
  log('📡', `Descargando ${SITEMAP_URLS.length} sitemaps...`);
  const allEntries = [];
  const page = await context.newPage();

  for (const url of SITEMAP_URLS) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      const status = res?.status();

      if (status === 403 || status >= 500) {
        log('⚠️', `Sitemap ${url.split('/').pop()} → ${status}, saltando`);
        continue;
      }

      await sleep(1000); // Esperar que el navegador renderice el XML
      const content = await page.content();
      const xmlMatch = content.match(/<urlset[\s\S]*<\/urlset>/);
      if (!xmlMatch) {
        log('⚠️', `Sitemap ${url.split('/').pop()} sin XML válido`);
        continue;
      }

      const parsed = xmlParser.parse(xmlMatch[0]);
      const urlSet = parsed?.urlset?.url;
      if (!urlSet) continue;

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
      log('✅', `Sitemap ${url.split('/').pop()}: ${entries.length} entradas`);
    } catch (err) {
      log('❌', `Error sitemap ${url.split('/').pop()}:`, err.message);
    }
  }

  await page.close();
  log('📊', `Total entradas: ${allEntries.length}`);
  return allEntries;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: INCREMENTAL DIFF
// ═══════════════════════════════════════════════════════════════════════════════

async function diffWithSupabase(sitemapEntries) {
  log('🔍', 'Comparando con Supabase...');
  const { data: existing, error } = await supabase.from('roomix_properties').select('id, lastmod');
  if (error) { log('❌', 'Error DB:', error.message); return { toExtract: sitemapEntries, toDelete: [] }; }

  const exMap = new Map((existing || []).map(r => [r.id, r.lastmod]));
  const sMap = new Set(sitemapEntries.map(e => e.id));

  const newE = sitemapEntries.filter(e => !exMap.has(e.id));
  const modE = sitemapEntries.filter(e => e.lastmod && exMap.get(e.id) && new Date(e.lastmod) > new Date(exMap.get(e.id)));
  const delIds = [...exMap.keys()].filter(id => !sMap.has(id));

  log('📊', `Nuevas: ${newE.length} | Mod.: ${modE.length} | Elim.: ${delIds.length}`);
  return { toExtract: [...newE, ...modE], toDelete: delIds };
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

function mapToRow(jsonLd, agent, entry) {
  const off = jsonLd.offers || {}, me = jsonLd.mainEntity || {}, add = me.address || {};
  const geo = jsonLd.geo || me.geo || {}, fs = me.floorSize || jsonLd.floorSize || {};
  const bf = off.businessFunction || '', op = bf.includes('Lease') ? 'rent' : bf.includes('Sell') ? 'sale' : bf || null;

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

    const row = mapToRow(jsonLd, parseAgent(html), entry);
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
    const entries = await fetchSitemaps(context);
    if (entries.length === 0) { log('❌', 'Sin sitemaps'); process.exit(1); }

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
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
