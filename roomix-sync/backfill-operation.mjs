#!/usr/bin/env node
// ============================================================================
// Backfill de `operation` — re-etiqueta SOLO las propiedades con operation = NULL
// ============================================================================
// Qué hace:
//   - Lee de Supabase las filas con operation IS NULL (las 962 sin etiquetar).
//   - Re-visita cada página de Roomix y lee `operation_type` (venta/alquiler).
//   - Actualiza ÚNICAMENTE la columna `operation` (no toca ningún otro campo).
//   - Si no puede determinar la operación, la deja como estaba (NULL).
// Es idempotente: se puede correr varias veces; cada corrida toma solo las que
// siguen en NULL.
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

chromium.use(stealthPlugin());

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const PAGE_TIMEOUT = 45_000;
const CONCURRENCY = 2;
const BATCH_DELAY_MS = 1200;

const log = (e, ...a) => console.log(e, new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Misma lógica EXACTA que el crawler (operation_type es el dato fiable).
function parseOperationType(html, title) {
  const m = html.match(/operation_type["\\]*\s*:\s*["\\]*(venta|alquiler|temporal)\b/i);
  if (m) return m[1].toLowerCase() === 'venta' ? 'sale' : 'rent';
  const t = (title || '').trim().toUpperCase();
  if (t.startsWith('VENTA')) return 'sale';
  if (t.startsWith('ALQUILER')) return 'rent';
  return null;
}
function parseTitle(html) {
  const m = html.match(/\\?"title\\?":\\?"([^"\\]{1,80})/);
  return m ? m[1] : null;
}

async function loadNullRows() {
  const rows = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('roomix_properties')
      .select('id, canonical_url')
      .is('operation', null)
      .range(from, from + step - 1);
    if (error) { log('❌', 'Error leyendo BD:', error.message); break; }
    rows.push(...(data || []));
    if (!data || data.length < step) break;
    from += step;
  }
  return rows;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  🩹 Backfill de operation (solo filas NULL)                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  let rows = await loadNullRows();
  log('📦', `Filas con operation NULL: ${rows.length}`);
  if (rows.length === 0) { log('✅', 'Nada para corregir'); return; }

  // Tope opcional para pruebas: BACKFILL_LIMIT=5
  const LIMIT = process.env.BACKFILL_LIMIT ? parseInt(process.env.BACKFILL_LIMIT, 10) : 0;
  if (LIMIT > 0) { rows = rows.slice(0, LIMIT); log('🧪', `Modo prueba: solo ${rows.length} filas`); }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }
  });

  // Warmup Cloudflare
  const warm = await context.newPage();
  try { await warm.goto('https://roomix.ai/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }); await sleep(3000); } catch {}
  await warm.close();

  const pages = await Promise.all(Array.from({ length: CONCURRENCY }, () => context.newPage()));
  let sale = 0, rent = 0, undet = 0, errors = 0, done = 0;

  async function processOne(row, page) {
    if (!row.canonical_url) { undet++; return; }
    try {
      const res = await page.goto(row.canonical_url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      const status = res?.status();
      if (status && (status === 403 || status === 429 || status >= 500)) { errors++; return; }
      await sleep(1200);
      const html = await page.content();
      const op = parseOperationType(html, parseTitle(html));
      if (!op) { undet++; return; }

      const { error } = await supabase
        .from('roomix_properties')
        .update({ operation: op })   // ← SOLO esta columna
        .eq('id', row.id);
      if (error) { log('❌', `Update ${row.id}: ${error.message}`); errors++; return; }

      if (op === 'sale') sale++; else rent++;
    } catch (e) {
      errors++;
    }
  }

  try {
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((row, idx) => processOne(row, pages[idx % pages.length])));
      done += batch.length;
      if (done % 50 === 0 || done >= rows.length) {
        log('🔄', `Progreso ${done}/${rows.length} → sale:${sale} rent:${rent} sin-determinar:${undet} errores:${errors}`);
      }
      await sleep(BATCH_DELAY_MS);
    }
  } finally {
    await Promise.all(pages.map(p => p.close().catch(() => {})));
    await browser.close();
  }

  log('✅', `Backfill terminado → sale:${sale} | rent:${rent} | sin-determinar:${undet} | errores:${errors}`);
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
