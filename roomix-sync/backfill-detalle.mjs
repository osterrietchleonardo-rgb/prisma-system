#!/usr/bin/env node
// ============================================================================
// Backfill de detalle — re-visita fichas YA existentes con covered_area_m2 y
// property_age_years en null y les completa el objeto de detalle (parseInternal).
//
// Por qué hace falta: Roomix reordenó su payload interno y parseInternal dejó de
// capturar ese objeto desde jul-2026 (0% de captura en ago-2026). El fix ya está
// en producción (crawler.mjs, "characteristics-section"), pero el crawler diario
// solo re-visita propiedades NUEVAS o con lastmod MODIFICADO: las ~96.000 filas
// que quedaron en null con el bug viejo no se autocorrigen solas. Detalle completo
// en docs/interno/TECNICO-PRISMA.md §11.4.
//
// Uso:
//   node backfill-detalle.mjs --dry-run --limit 20   # ver antes/después, NO escribe
//   node backfill-detalle.mjs --limit 200            # prueba real (200 fichas)
//   node backfill-detalle.mjs                        # todas las pendientes
//   CONCURRENCY=4 node backfill-detalle.mjs
//
// Es REANUDABLE (checkpoint backfill-checkpoint-detalle.json) e IDEMPOTENTE: solo
// escribe los campos que vinieron con dato (nunca pisa un valor existente con null).
// NO toca city/neighborhood/address/area_m2/operation/category (ya bien cubiertos,
// con su propia lógica de fallback) ni `lastmod`/`embedding` (clave para el diff
// del crawler y para no gastar embeddings de nuevo).
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInternal } from './crawler.mjs';

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
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 4;
const PAGE_TIMEOUT = 45_000;
const BATCH_DELAY_MS = 1500;
const CF_REFRESH_EVERY = 120;
const CHECKPOINT_FILE = resolve(__dirname, 'backfill-checkpoint-detalle.json');

const log = (e, ...a) => console.log(e, new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCheckpoint() {
  try { if (existsSync(CHECKPOINT_FILE)) return new Set(JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8')).processed_ids || []); } catch {}
  return new Set();
}
function saveCheckpoint(set) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processed_ids: [...set], count: set.size, last_run: new Date().toISOString() }, null, 2));
}

// ─── Filas a reescribir: covered_area_m2 y property_age_years en null a la vez ─
// (si tuvieran solo UNO en null, es la fuente la que no trae ese dato puntual, no
// el bug de la ventana — no hace falta re-visitarlas).
async function loadPending() {
  const rows = [];
  let ultimoId = '';
  let leidas = 0;
  const step = 1000;
  while (true) {
    let data, error;
    for (let intento = 1; intento <= 3; intento++) {
      const q = supabase
        .from('roomix_properties')
        .select('id, slug, canonical_url')
        .is('covered_area_m2', null)
        .is('property_age_years', null)
        .order('id', { ascending: true })
        .limit(step);
      ({ data, error } = ultimoId ? await q.gt('id', ultimoId) : await q);
      if (!error) break;
      log('⏳', `Lectura fallida (${intento}/3): ${error.message}`);
      await sleep(2000 * intento);
    }
    if (error) { log('❌', 'No se pudo leer el catálogo completo:', error.message); process.exit(1); }

    for (const r of (data || [])) rows.push(r);
    leidas += (data || []).length;
    if (!data || data.length < step) break;
    ultimoId = data[data.length - 1].id;
    if (LIMIT > 0 && rows.length >= LIMIT * 3) break;
    if (leidas % 20000 === 0) log('…', `leídas ${leidas} filas, candidatas ${rows.length}`);
  }
  log('🔎', `Barrido completo: ${leidas} filas pendientes encontradas`);
  return rows;
}

// ─── Filas con fotos vacías (images = '{}') ────────────────────────────────────
// Bug distinto (ago-2026): el JSON-LD trae "image" undefined en fichas reales aunque
// SÍ tienen galería — el fix vive en parseInternal (blob "images":[...]). Es un universo
// aparte del de covered_area_m2/property_age_years (verificado: solo 449 de 1.765 se
// solapan), así que se barre por separado. OJO: NO se filtra por checkpoint acá — una
// fila puede estar "hecha" en el checkpoint viejo (visitada antes de que este fix
// existiera) y seguir con la foto vacía.
async function loadPendingImages() {
  const rows = [];
  let ultimoId = '';
  let leidas = 0;
  const step = 1000;
  while (true) {
    let data, error;
    for (let intento = 1; intento <= 3; intento++) {
      const q = supabase
        .from('roomix_properties')
        .select('id, slug, canonical_url')
        .eq('images', '{}')
        .order('id', { ascending: true })
        .limit(step);
      ({ data, error } = ultimoId ? await q.gt('id', ultimoId) : await q);
      if (!error) break;
      log('⏳', `Lectura fallida imágenes (${intento}/3): ${error.message}`);
      await sleep(2000 * intento);
    }
    if (error) { log('❌', 'No se pudo leer las filas sin fotos:', error.message); process.exit(1); }

    for (const r of (data || [])) rows.push(r);
    leidas += (data || []).length;
    if (!data || data.length < step) break;
    ultimoId = data[data.length - 1].id;
  }
  log('🔎', `Barrido de fotos completo: ${leidas} filas sin imágenes encontradas`);
  return rows;
}

// ─── Procesa una ficha: visita, re-parsea el detalle, UPDATE solo lo que vino ──
async function processOne(page, dbRow) {
  const url = dbRow.canonical_url || `https://roomix.ai/propiedad/${dbRow.slug}`;
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    const status = res?.status();
    if (status === 404 || status === 410) { log('🚫', `${dbRow.id} baja (HTTP ${status}), salteo`); return 'gone'; }
    if (status === 403 || status === 429 || status >= 500) { log('⏳', `${dbRow.id} HTTP ${status}, salteo`); return 'blocked'; }

    await sleep(2000);
    const html = await page.content();
    const internal = parseInternal(html, dbRow.slug);
    if (!internal) { log('⚠️', `${dbRow.id} sin ancla, salteo`); return 'sinancla'; }

    const patch = {};
    if (internal.covered_area_m2 != null) patch.covered_area_m2 = internal.covered_area_m2;
    if (internal.property_age_years != null) patch.property_age_years = internal.property_age_years;
    if (internal.floor != null) patch.floor = internal.floor;
    if (internal.expenses != null) patch.expenses = internal.expenses;
    if (internal.expenses_currency != null) patch.expenses_currency = internal.expenses_currency;
    if (internal.total_usd != null) patch.total_usd = internal.total_usd;
    if (internal.region != null) patch.region = internal.region;
    if (internal.publication_date) patch.date_posted = new Date(internal.publication_date).toISOString();
    if (internal.status != null) patch.is_active = internal.status;
    if (internal.phone) patch.phone = internal.phone;
    if (internal.whatsapp) patch.whatsapp = internal.whatsapp;
    if (internal.h3_res6) patch.h3_res6 = internal.h3_res6;
    if (internal.h3_res8) patch.h3_res8 = internal.h3_res8;
    if (internal.images && internal.images.length > 0) patch.images = internal.images;
    if (internal.source_listing_url) patch.source_listing_url = internal.source_listing_url;

    if (Object.keys(patch).length === 0) { log('ℹ️', `${dbRow.id} fuente sin dato real (confirmado), salteo`); return 'sindato'; }

    if (DRY_RUN) {
      console.log(`\n── ${dbRow.id}`);
      console.log('  ', patch);
      return 'ok';
    }

    const { error } = await supabase.from('roomix_properties').update(patch).eq('id', dbRow.id);
    if (error) { log('❌', `${dbRow.id} update: ${error.message}`); return 'dberr'; }
    return 'ok';
  } catch (err) {
    log('❌', `${dbRow.id}: ${err.message.substring(0, 60)}`);
    return 'err';
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  🔧 Backfill detalle ${(DRY_RUN ? '(DRY-RUN, no escribe)' : '(escribe en la BD)').padEnd(41)} ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const checkpoint = DRY_RUN ? new Set() : loadCheckpoint();
  log('🔍', 'Buscando filas con covered_area_m2 y property_age_years en null...');
  const core = (await loadPending()).filter((r) => !checkpoint.has(r.id));
  log('🔍', 'Buscando filas con fotos vacías...');
  const imagenes = await loadPendingImages();
  const vistos = new Set(core.map((r) => r.id));
  let extras = 0;
  for (const r of imagenes) { if (!vistos.has(r.id)) { core.push(r); vistos.add(r.id); extras++; } }
  if (extras > 0) log('🖼️', `+${extras} filas sumadas solo por fotos vacías (ya estaban "hechas" para m²/antigüedad)`);
  let pending = core;
  if (LIMIT > 0) pending = pending.slice(0, LIMIT);
  log('📦', `A procesar: ${pending.length} (ya hechas en checkpoint: ${checkpoint.size})`);
  if (pending.length === 0) { log('✅', 'Nada pendiente. Listo.'); return; }

  log('🌐', 'Iniciando Chromium (stealth) + clearance Cloudflare...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
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
        if (r === 'ok' || r === 'gone' || r === 'sindato') checkpoint.add(row.id);
        done++;
      })));
      if (!DRY_RUN) saveCheckpoint(checkpoint);
      if (done % 50 < CONCURRENCY) log('📊', `Avance ${done}/${pending.length} — ok:${stats.ok} bajas:${stats.gone} skip:${stats.skip} err:${stats.err}`);
      if (i + CONCURRENCY < pending.length) await sleep(BATCH_DELAY_MS);
    }
    await Promise.all(workers.map((p) => p.close().catch(() => {})));
    log('✅', `FIN — ok:${stats.ok} bajas:${stats.gone} skip:${stats.skip} err:${stats.err} (total ${done})`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('💥 Fatal:', err); process.exit(1); });
