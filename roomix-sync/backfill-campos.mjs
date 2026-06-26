#!/usr/bin/env node
// ============================================================================
// Backfill de campos completos — re-visita fichas YA existentes en la BD y llena
// las columnas nuevas (Junio 26): date_posted, country, region, city, antigüedad,
// expensas, m² cubierto, piso, h3, source_listing_url, etc. (ver TECNICO §11.2).
//
// Por qué hace falta: el crawler nuevo solo enriquece propiedades NUEVAS o MODIFICADAS.
// Las ~57.800 que ya estaban quedan con los campos nuevos en null hasta que se las
// re-procese. Este script las re-procesa de forma controlada.
//
// Orden pedido: PRIMERO ventas (operation='sale'), DESPUÉS alquileres ('rent').
//
// Uso:
//   node backfill-campos.mjs --operation sale            # solo ventas
//   node backfill-campos.mjs --operation rent            # solo alquileres
//   node backfill-campos.mjs --operation sale --limit 50 # prueba (50 fichas)
//   CONCURRENCY=3 node backfill-campos.mjs --operation sale
//
// Es REANUDABLE e IDEMPOTENTE: lleva un checkpoint por operación (backfill-checkpoint-<op>.json)
// y solo toca filas cuyo date_posted siga en null (las ya enriquecidas se saltean).
// NO regenera embeddings (solo campos escalares) y NO pisa `lastmod` (preserva el de la BD,
// clave para el diff del crawler). Si una ficha ya no tiene datos (baja), la saltea.
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonLd, parseInternal, parseAgent, mapToRow } from './crawler.mjs';

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
const OPERATION = (getArg('--operation') || 'sale').toLowerCase();   // 'sale' | 'rent'
if (!['sale', 'rent'].includes(OPERATION)) { console.error("❌ --operation debe ser 'sale' o 'rent'"); process.exit(1); }
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit'), 10) : 0; // 0 = todas
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 3;
const PAGE_TIMEOUT = 45_000;
const BATCH_DELAY_MS = 1500;
const CF_REFRESH_EVERY = 120; // refrescar sesión Cloudflare cada N fichas
const CHECKPOINT_FILE = resolve(__dirname, `backfill-checkpoint-${OPERATION}.json`);

// Columnas que el backfill ACTUALIZA (las que aporta el objeto interno + las corregibles).
// Deliberadamente NO incluye: embedding, lastmod (se preservan), id/slug/canonical_url (clave).
const BACKFILL_FIELDS = [
  'operation', 'category', 'neighborhood', 'region', 'city', 'country', 'address',
  'area_m2', 'covered_area_m2', 'property_age_years', 'floor',
  'expenses', 'expenses_currency', 'total_usd', 'date_posted', 'availability',
  'business_function', 'is_active', 'phone', 'whatsapp', 'h3_res6', 'h3_res8',
  'source_listing_url', 'updated_at',
];

const log = (e, ...a) => console.log(e, new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadCheckpoint() {
  try { if (existsSync(CHECKPOINT_FILE)) return new Set(JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8')).processed_ids || []); } catch {}
  return new Set();
}
function saveCheckpoint(set) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processed_ids: [...set], count: set.size, last_run: new Date().toISOString() }, null, 2));
}

// ─── Lee TODAS las filas a enriquecer (date_posted null) de una operación ───────
async function loadPending() {
  const rows = [];
  let from = 0; const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('roomix_properties')
      .select('id, slug, canonical_url, lastmod')
      .eq('operation', OPERATION)
      .is('date_posted', null)            // solo las que faltan
      .order('id', { ascending: true })
      .range(from, from + step - 1);
    if (error) { log('❌', 'Error leyendo pendientes:', error.message); break; }
    rows.push(...(data || []));
    if (!data || data.length < step) break;
    from += step;
  }
  return rows;
}

// ─── Procesa una ficha: visita, mapea, UPDATE (solo BACKFILL_FIELDS) ────────────
async function processOne(page, dbRow) {
  const entry = { id: dbRow.id, slug: dbRow.slug, loc: dbRow.canonical_url, lastmod: dbRow.lastmod };
  try {
    const res = await page.goto(entry.loc, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    const status = res?.status();
    if (status === 404 || status === 410) { log('🚫', `${entry.id} baja (HTTP ${status}), salteo`); return 'gone'; }
    if (status === 403 || status === 429 || status >= 500) { log('⏳', `${entry.id} HTTP ${status}, salteo`); return 'blocked'; }

    await sleep(1800);
    const html = await page.content();
    const jsonLd = parseJsonLd(html);
    if (!jsonLd) { log('⚠️', `${entry.id} sin JSON-LD, salteo`); return 'nojsonld'; }

    const internal = parseInternal(html, entry.slug);
    const full = mapToRow(jsonLd, parseAgent(html), entry, internal);

    // UPDATE solo de los campos del backfill (no toca embedding ni lastmod)
    const patch = {};
    for (const k of BACKFILL_FIELDS) patch[k] = full[k];

    const { error } = await supabase.from('roomix_properties').update(patch).eq('id', entry.id);
    if (error) { log('❌', `${entry.id} update: ${error.message}`); return 'dberr'; }
    return 'ok';
  } catch (err) {
    log('❌', `${entry.id}: ${err.message.substring(0, 60)}`);
    return 'err';
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  🔧 Backfill campos completos — operación: ${OPERATION.padEnd(18)} ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const checkpoint = loadCheckpoint();
  log('🔍', 'Leyendo filas pendientes (date_posted null)...');
  let pending = (await loadPending()).filter(r => !checkpoint.has(r.id));
  if (LIMIT > 0) pending = pending.slice(0, LIMIT);
  log('📦', `Pendientes a procesar: ${pending.length} (ya hechas en checkpoint: ${checkpoint.size})`);
  if (pending.length === 0) { log('✅', 'Nada pendiente. Listo.'); return; }

  log('🌐', 'Iniciando Chromium (stealth) + clearance Cloudflare...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });
  const warm = await ctx.newPage();
  try { await warm.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }); await sleep(5000); } catch {}
  await warm.close();

  const workers = await Promise.all(Array.from({ length: CONCURRENCY }, () => ctx.newPage()));
  const limit = pLimit(CONCURRENCY);
  const stats = { ok: 0, gone: 0, skip: 0, err: 0 };
  let done = 0;

  try {
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      // Refrescar Cloudflare cada tanto (mitiga throttling de la IP del server)
      if (i > 0 && i % CF_REFRESH_EVERY === 0) {
        try { await workers[0].goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }); await sleep(1500); } catch {}
        log('🔄', `Sesión CF refrescada (${i}/${pending.length})`);
      }
      const batch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((row, idx) => limit(async () => {
        const r = await processOne(workers[idx % workers.length], row);
        if (r === 'ok') stats.ok++;
        else if (r === 'gone') stats.gone++;
        else if (r === 'err' || r === 'dberr') stats.err++;
        else stats.skip++;
        checkpoint.add(row.id);
        done++;
      })));
      saveCheckpoint(checkpoint);
      if (done % 50 < CONCURRENCY) log('📊', `Avance ${done}/${pending.length} — ok:${stats.ok} bajas:${stats.gone} skip:${stats.skip} err:${stats.err}`);
      if (i + CONCURRENCY < pending.length) await sleep(BATCH_DELAY_MS);
    }
    await Promise.all(workers.map(p => p.close().catch(() => {})));
    log('✅', `FIN ${OPERATION} — ok:${stats.ok} bajas:${stats.gone} skip:${stats.skip} err:${stats.err} (total ${done})`);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
