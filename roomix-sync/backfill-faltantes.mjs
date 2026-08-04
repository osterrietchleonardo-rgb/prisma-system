#!/usr/bin/env node
// ============================================================================
// Backfill de faltantes — crawlea propiedades que están en los sitemaps vivos de
// Roomix pero TODAVÍA NO están en roomix_properties (~27.400 medido ago-2026:
// sitemaps 168.389 URLs vs 141.010 filas en la BD). No es un rango de sitemap mal
// configurado (0..6 sigue siendo correcto, el 6 en adelante ya viene vacío): es que
// el throughput nunca llegó a completar el catálogo. Detalle en TECNICO §11.4.
//
// Reusa extractProperty() de crawler.mjs (mismo parseInternal ya arreglado, mismo
// JSON-LD, misma generación de embedding) — INSERTA filas nuevas, no toca las que
// ya existen.
//
// Uso:
//   node backfill-faltantes.mjs --dry-run --limit 20   # solo lista qué falta, NO escribe
//   node backfill-faltantes.mjs --limit 200            # prueba real (200 fichas)
//   node backfill-faltantes.mjs                        # todas las faltantes
//   CONCURRENCY=16 node backfill-faltantes.mjs
//
// Reanudable (checkpoint backfill-checkpoint-faltantes.json) — propio, NO comparte
// archivo con el checkpoint.json de main() para no pisarse con una corrida real del
// crawler. Genera embeddings nuevos (costo Gemini chico, ~centavos por miles).
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
import { extractProperty } from './crawler.mjs';

chromium.use(stealthPlugin());

// ─── Env (carga .env de la raíz, igual que el crawler) ─────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');
if (existsSync(ENV_PATH)) for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i === -1) continue;
  const k = t.slice(0, i).trim(); if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ─── Args / config ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN = args.includes('--dry-run');
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit'), 10) : 0; // 0 = todas
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 8;
const PAGE_TIMEOUT = 45_000;
const BATCH_DELAY_MS = 1500;
const CF_REFRESH_EVERY = 100;
const SITEMAP_COUNT = process.env.SITEMAP_COUNT ? parseInt(process.env.SITEMAP_COUNT) : 7;
const SITEMAP_URLS = Array.from({ length: SITEMAP_COUNT }, (_, i) => `https://roomix.ai/properties/sitemap/${i}`);
const CHECKPOINT_FILE = resolve(__dirname, 'backfill-checkpoint-faltantes.json');
const xmlParser = new XMLParser({ ignoreAttributes: false });

const log = (e, ...a) => console.log(e, new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const extractIdFromUrl = (url) => { const seg = url.split('/').pop() || ''; return seg.lastIndexOf('-') !== -1 ? seg.slice(seg.lastIndexOf('-') + 1) : seg; };
const extractSlugFromUrl = (url) => url.split('/').pop() || '';

function loadCheckpoint() {
  try { if (existsSync(CHECKPOINT_FILE)) return new Set(JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8')).processed_ids || []); } catch {}
  return new Set();
}
function saveCheckpoint(set) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processed_ids: [...set], count: set.size, last_run: new Date().toISOString() }, null, 2));
}

// ─── Sitemaps vivos: mismo patrón del crawler (fetch DENTRO del browser, hereda
// el fingerprint TLS + cf_clearance) ─────────────────────────────────────────
async function fetchSitemapEntries(page) {
  const allEntries = [];
  await page.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  await sleep(3000);
  for (const url of SITEMAP_URLS) {
    const idx = url.split('/').pop();
    let ok = false;
    for (let intento = 1; intento <= 4; intento++) {
      try {
        if (intento > 1) await sleep(intento * 10_000);
        const result = await page.evaluate(async (u) => {
          try {
            const res = await fetch(u, { credentials: 'include' });
            if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };
            return { text: await res.text() };
          } catch (e) { return { error: e.message }; }
        }, url);
        if (result.error) { log('⚠️', `Sitemap ${idx} → ${result.error}, reintento...`); continue; }
        const xmlMatch = result.text.match(/<urlset[\s\S]*<\/urlset>/);
        if (!xmlMatch) { log('⚠️', `Sitemap ${idx} sin XML válido`); continue; }
        const parsed = xmlParser.parse(xmlMatch[0]);
        const urlSet = parsed?.urlset?.url;
        const entries = urlSet ? (Array.isArray(urlSet) ? urlSet : [urlSet]) : [];
        for (const e of entries) {
          if (e.loc && e.loc.includes('/propiedad/')) {
            allEntries.push({ loc: e.loc, lastmod: e.lastmod || null, id: extractIdFromUrl(e.loc), slug: extractSlugFromUrl(e.loc) });
          }
        }
        log('✅', `Sitemap ${idx}: ${entries.length} entradas`);
        ok = true;
        break;
      } catch (err) { log('❌', `Sitemap ${idx} intento ${intento}: ${err.message}`); }
    }
    if (!ok) log('💀', `Sitemap ${idx} fallido tras reintentos`);
    await sleep(1500);
  }
  return allEntries;
}

// ─── IDs ya en la BD: paginado POR CLAVE (no por offset — con 141k filas el
// offset grande hace "canceling statement due to statement timeout" en Postgres) ─
async function loadExistingIds() {
  const ids = new Set();
  let ultimoId = '';
  const step = 1000;
  while (true) {
    let data, error;
    for (let intento = 1; intento <= 3; intento++) {
      const q = supabase.from('roomix_properties').select('id').order('id', { ascending: true }).limit(step);
      ({ data, error } = ultimoId ? await q.gt('id', ultimoId) : await q);
      if (!error) break;
      log('⏳', `Lectura fallida (${intento}/3): ${error.message}`);
      await sleep(2000 * intento);
    }
    if (error) { log('❌', 'No se pudo leer el catálogo completo:', error.message); process.exit(1); }
    for (const r of (data || [])) ids.add(r.id);
    if (!data || data.length < step) break;
    ultimoId = data[data.length - 1].id;
    if (ids.size % 40000 < step) log('…', `IDs leídos: ${ids.size}`);
  }
  return ids;
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  🆕 Backfill faltantes ${(DRY_RUN ? '(DRY-RUN, no escribe)' : '(escribe en la BD)').padEnd(39)} ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const checkpoint = DRY_RUN ? new Set() : loadCheckpoint();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });

  try {
    log('📡', `Descargando ${SITEMAP_URLS.length} sitemaps...`);
    const sitemapPage = await ctx.newPage();
    const entries = await fetchSitemapEntries(sitemapPage);
    await sitemapPage.close();
    log('📊', `Total en sitemaps: ${entries.length}`);

    log('🔍', 'Leyendo IDs existentes en la BD...');
    const existing = await loadExistingIds();
    log('📦', `IDs en BD: ${existing.size}`);

    // Dedup por id (el mismo id puede repetirse entre sitemaps si Roomix lo listó dos veces).
    const seen = new Set();
    let queue = entries.filter((e) => e.id && !existing.has(e.id) && !seen.has(e.id) && (seen.add(e.id), true));
    queue = queue.filter((e) => !checkpoint.has(e.id));
    log('🆕', `Faltantes a crawlear: ${queue.length}`);
    if (LIMIT > 0) queue = queue.slice(0, LIMIT);

    if (DRY_RUN) {
      console.log(`\nMuestra de ${Math.min(20, queue.length)} faltantes:`);
      for (const e of queue.slice(0, 20)) console.log(' ', e.id, e.loc);
      await browser.close();
      return;
    }
    if (queue.length === 0) { log('✅', 'Nada pendiente. Listo.'); await browser.close(); return; }

    const workers = await Promise.all(Array.from({ length: CONCURRENCY }, () => ctx.newPage()));
    const limit = pLimit(CONCURRENCY);
    const stats = { ok: 0, err: 0 };
    let done = 0;

    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      if (i > 0 && i % CF_REFRESH_EVERY === 0) {
        try { await workers[0].goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }); await sleep(1500); } catch {}
        log('🔄', `Sesión CF refrescada (${i}/${queue.length})`);
      }
      const batch = queue.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((entry, idx) => limit(async () => {
        const row = await extractProperty(workers[idx % workers.length], entry);
        if (!row) { stats.err++; done++; return; }
        const { error } = await supabase.from('roomix_properties').upsert(row, { onConflict: 'id' });
        if (error) { log('❌', `DB ${entry.id}: ${error.message}`); stats.err++; done++; return; }
        checkpoint.add(entry.id);
        stats.ok++;
        done++;
      })));
      saveCheckpoint(checkpoint);
      if (done % 50 < CONCURRENCY) log('📊', `Avance ${done}/${queue.length} — ok:${stats.ok} err:${stats.err}`);
      if (i + CONCURRENCY < queue.length) await sleep(BATCH_DELAY_MS);
    }
    await Promise.all(workers.map((p) => p.close().catch(() => {})));
    log('✅', `FIN — ok:${stats.ok} err:${stats.err} (total ${done})`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('💥 Fatal:', err); process.exit(1); });
