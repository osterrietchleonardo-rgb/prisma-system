#!/usr/bin/env node
// ============================================================================
// Backfill de descripciones — re-visita fichas YA existentes y reescribe la
// descripción completa condensada a ≤500 caracteres ordenados.
//
// Por qué hace falta: Roomix publica en su JSON-LD la descripción cortada a 500
// caracteres, a mitad de palabra ("...- 2 dormitorios - El pri"). Eso es lo que
// quedó guardado en las ~129.000 filas y lo que veía el cliente en la ficha
// compartida y en el ACM (queja de un asesor, 27/07/2026). El crawler nuevo ya
// baja el texto completo del cuerpo de la ficha y lo condensa, pero solo toca
// propiedades NUEVAS o MODIFICADAS: las viejas necesitan esta pasada.
//
// Uso:
//   node backfill-descripcion.mjs --dry-run --limit 20   # ver antes/después, NO escribe
//   node backfill-descripcion.mjs --limit 200            # prueba real (200 fichas)
//   node backfill-descripcion.mjs                        # todas las cortadas
//   node backfill-descripcion.mjs --todas                # también las que no estaban cortadas
//   CONCURRENCY=3 node backfill-descripcion.mjs
//
// Es REANUDABLE (checkpoint backfill-checkpoint-descripcion.json) e IDEMPOTENTE:
// siempre reescribe a partir del texto que publica Roomix, no de lo que hay en la BD.
// Solo toca la columna `description`. NO regenera embeddings y NO pisa `lastmod`
// (clave para el diff del crawler).
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDescripcionCompleta } from './crawler.mjs';
import { condensarDescripcion } from './condensar-descripcion.mjs';

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
const TODAS = args.includes('--todas');
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit'), 10) : 0; // 0 = todas
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 3;
const PAGE_TIMEOUT = 45_000;
const BATCH_DELAY_MS = 1500;
const CF_REFRESH_EVERY = 120;
const CORTE_SOSPECHOSO = 495; // ≥ este largo = descripción cortada por Roomix
const CHECKPOINT_FILE = resolve(__dirname, 'backfill-checkpoint-descripcion.json');

const log = (e, ...a) => console.log(e, new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadCheckpoint() {
  try { if (existsSync(CHECKPOINT_FILE)) return new Set(JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8')).processed_ids || []); } catch {}
  return new Set();
}
function saveCheckpoint(set) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processed_ids: [...set], count: set.size, last_run: new Date().toISOString() }, null, 2));
}

// ─── Filas a reescribir: por defecto, solo las que quedaron cortadas ───────────
async function loadPending() {
  const rows = [];
  // Paginado POR CLAVE (`id > último`), no por `.range(offset)`. Con offsets grandes Postgres tiene
  // que recorrer y descartar todas las filas anteriores en cada página, y pasadas las ~100.000 filas
  // la consulta moría con "canceling statement due to statement timeout": el catch cortaba el barrido
  // y devolvía una lista PARCIAL, así que las propiedades del final del orden por id no entraban nunca
  // a la cola (visto en 3 corridas seguidas). Por clave, cada página cuesta lo mismo.
  let ultimoId = '';
  let leidas = 0;
  const step = 1000;
  while (true) {
    let data, error;
    for (let intento = 1; intento <= 3; intento++) {
      const q = supabase
        .from('roomix_properties')
        .select('id, slug, canonical_url, description')
        .order('id', { ascending: true })
        .limit(step);
      ({ data, error } = ultimoId ? await q.gt('id', ultimoId) : await q);
      if (!error) break;
      log('⏳', `Lectura fallida (${intento}/3): ${error.message}`);
      await sleep(2000 * intento);
    }
    // Sin la lista completa no se arranca: mejor abortar que dejar propiedades afuera en silencio.
    if (error) { log('❌', 'No se pudo leer el catálogo completo:', error.message); process.exit(1); }

    for (const r of (data || [])) {
      if (TODAS || (r.description || '').length >= CORTE_SOSPECHOSO) rows.push(r);
    }
    leidas += (data || []).length;
    if (!data || data.length < step) break;
    ultimoId = data[data.length - 1].id;
    // Con --limit no hace falta barrer las 129k filas: cortamos apenas hay candidatas de sobra.
    if (LIMIT > 0 && rows.length >= LIMIT * 3) break;
    if (leidas % 20000 === 0) log('…', `leídas ${leidas} filas, candidatas ${rows.length}`);
  }
  log('🔎', `Catálogo barrido completo: ${leidas} filas leídas`);
  return rows;
}

// ─── Procesa una ficha: visita, arma la descripción condensada, UPDATE ─────────
async function processOne(page, dbRow) {
  const url = dbRow.canonical_url || `https://roomix.ai/propiedad/${dbRow.slug}`;
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    const status = res?.status();
    if (status === 404 || status === 410) { log('🚫', `${dbRow.id} baja (HTTP ${status}), salteo`); return 'gone'; }
    if (status === 403 || status === 429 || status >= 500) { log('⏳', `${dbRow.id} HTTP ${status}, salteo`); return 'blocked'; }

    await sleep(1500);
    const completa = parseDescripcionCompleta(await page.content());
    if (!completa) { log('⚠️', `${dbRow.id} sin descripción en la ficha, salteo`); return 'sindesc'; }

    const nueva = condensarDescripcion(completa);
    // Salvaguarda: si el condensador devolviera algo vacío o ridículamente corto frente a
    // lo que ya teníamos, NO pisamos la fila (mejor lo viejo que dejarla sin descripción).
    if (!nueva || nueva.length < 40) { log('⚠️', `${dbRow.id} condensado vacío/corto (${nueva.length}), salteo`); return 'vacio'; }

    if (DRY_RUN) {
      console.log(`\n── ${dbRow.id} · completa=${completa.length} · antes=${(dbRow.description || '').length} · después=${nueva.length}`);
      console.log(`ANTES:  ${(dbRow.description || '').slice(-120)}`);
      console.log(`DESPUÉS: ${nueva}`);
      return 'ok';
    }

    const { error } = await supabase.from('roomix_properties').update({ description: nueva }).eq('id', dbRow.id);
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
  console.log(`║  📝 Backfill descripciones ${(DRY_RUN ? '(DRY-RUN, no escribe)' : '(escribe en la BD)').padEnd(34)} ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const checkpoint = DRY_RUN ? new Set() : loadCheckpoint();
  log('🔍', `Buscando filas ${TODAS ? '(todas)' : `con descripción cortada (≥${CORTE_SOSPECHOSO} chars)`}...`);
  let pending = (await loadPending()).filter(r => !checkpoint.has(r.id));
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
        if (r === 'ok' || r === 'gone') checkpoint.add(row.id);
        done++;
      })));
      if (!DRY_RUN) saveCheckpoint(checkpoint);
      if (done % 50 < CONCURRENCY) log('📊', `Avance ${done}/${pending.length} — ok:${stats.ok} bajas:${stats.gone} skip:${stats.skip} err:${stats.err}`);
      if (i + CONCURRENCY < pending.length) await sleep(BATCH_DELAY_MS);
    }
    await Promise.all(workers.map(p => p.close().catch(() => {})));
    log('✅', `FIN — ok:${stats.ok} bajas:${stats.gone} skip:${stats.skip} err:${stats.err} (total ${done})`);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
