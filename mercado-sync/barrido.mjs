#!/usr/bin/env node
// ============================================================================
// mercado-sync/barrido.mjs — corre el barrido por la API de Apify, por tandas
//
// Divide un rango de páginas de ZonaProp en tandas, corre el actor
// memo23/zonaprop-scraper para cada tanda, baja el dataset a un archivo
// local y se lo pasa al loader. Sequencial a propósito: cuidadoso.
//
// Uso:
//   node mercado-sync/barrido.mjs --base departamentos-venta-belgrano \
//        --desde 1 --hasta 210 --tanda 30 --zona belgrano [--dry]
//
// Guardas:
//   * Antes de cada tanda consulta el uso mensual de la cuenta Apify y
//     FRENA si superó --tope-usd (default 9.0 de los 10 del plan FREE).
//   * Si una tanda falla, corta ahí: lo cargado queda, nada se pierde.
//   * habilita_bajas siempre false: esto solo suma, jamás resta.
//
// Credenciales: APIFY_API_KEY + las de Supabase, de ENV_FILE o del entorno.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const BASE = arg('base');                       // p.ej. departamentos-venta-belgrano
const DESDE = parseInt(arg('desde', '1'));
const HASTA = parseInt(arg('hasta', '1'));
const TANDA = parseInt(arg('tanda', '30'));
const ZONA = arg('zona', BASE);
const TOPE = parseFloat(arg('tope-usd', '9.0'));
const DRY = process.argv.includes('--dry');
const USA_CKPT = process.argv.includes('--ckpt');   // checkpoint resumible (solo carga inicial)

if (!BASE) { console.error('Falta --base <slug de búsqueda>'); process.exit(1); }

function cargarEnv() {
  const envFile = process.env.ENV_FILE;
  if (envFile) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
  }
}
cargarEnv();
const TOK = process.env.APIFY_API_KEY;
if (!TOK) { console.error('Falta APIFY_API_KEY'); process.exit(1); }

const ACTOR = 'memo23~zonaprop-scraper';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function usoMensual() {
  const r = await fetch(`https://api.apify.com/v2/users/me/limits?token=${TOK}`);
  const j = await r.json();
  return { usado: j.data?.current?.monthlyUsageUsd ?? null, tope: j.data?.limits?.maxMonthlyUsageUsd ?? null };
}

async function correrTanda(paginas) {
  const startUrls = paginas.map(p => ({
    url: p === 1
      ? `https://www.zonaprop.com.ar/${BASE}.html`
      : `https://www.zonaprop.com.ar/${BASE}-pagina-${p}.html`,
  }));
  const input = { startUrls, maxItems: paginas.length * 30, proxy: { useApifyProxy: true } };
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/runs?token=${TOK}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`lanzar run: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const run = (await res.json()).data;
  console.log(`  run ${run.id} lanzado (págs ${paginas[0]}-${paginas[paginas.length - 1]})`);

  // esperar a estado terminal (máx 15 min por tanda)
  for (let i = 0; i < 90; i++) {
    await sleep(10000);
    const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOK}`)).json()).data;
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(st.status)) {
      if (st.status !== 'SUCCEEDED') throw new Error(`run ${run.id} terminó ${st.status}`);
      return st.defaultDatasetId;
    }
  }
  throw new Error(`run ${run.id} no terminó en 15 min`);
}

async function bajarDataset(datasetId, destino) {
  const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${TOK}&clean=true&format=json`);
  if (!r.ok) throw new Error(`bajar dataset ${datasetId}: ${r.status}`);
  const txt = await r.text();
  writeFileSync(destino, txt);
  return JSON.parse(txt).length;
}

async function main() {
  const dataDir = join(__dirname, 'data');
  mkdirSync(dataDir, { recursive: true });

  // CHECKPOINT por tanda (SOLO con --ckpt): para la carga inicial resumible, que este
  // entorno corta. Guardamos la última página cargada; al relanzar, se retoma desde ahí
  // (un corte pierde a lo sumo la tanda en curso). ckpt {done:true} = barrio terminado.
  // El refresco mensual NO pasa --ckpt: siempre relee todo desde --desde, sin saltear.
  const ckptFile = join(dataDir, `ckpt-${ZONA}.json`);
  let ckpt = {};
  if (USA_CKPT) {
    try { ckpt = JSON.parse(readFileSync(ckptFile, 'utf8')); } catch {}
    if (ckpt.done) { console.log(`[barrido] ${ZONA} ya está marcado como terminado (ckpt). Nada que hacer.`); return; }
  }
  const desdeEfectivo = USA_CKPT ? Math.max(DESDE, (ckpt.lastPage || 0) + 1) : DESDE;
  if (desdeEfectivo > DESDE) console.log(`[barrido] retomo ${ZONA} desde pág ${desdeEfectivo} (checkpoint).`);

  const paginas = [];
  for (let p = desdeEfectivo; p <= HASTA; p++) paginas.push(p);
  const tandas = [];
  for (let i = 0; i < paginas.length; i += TANDA) tandas.push(paginas.slice(i, i + TANDA));

  console.log(`[barrido] ${BASE} · págs ${DESDE}-${HASTA} en ${tandas.length} tandas de ${TANDA} · zona=${ZONA}${DRY ? ' · DRY' : ''}`);
  let totalItems = 0, vaciasSeguidas = 0, frenadoPorTope = false, terminado = false;

  for (const [idx, tanda] of tandas.entries()) {
    const { usado, tope } = await usoMensual();
    console.log(`[tanda ${idx + 1}/${tandas.length}] uso Apify: $${usado?.toFixed(2)} de $${tope}`);
    if (usado != null && usado >= TOPE) {
      console.error(`[barrido] FRENO: el uso ($${usado.toFixed(2)}) alcanzó el tope de seguridad ($${TOPE}). Lo cargado queda; se retoma cuando haya crédito.`);
      frenadoPorTope = true;
      break;
    }
    if (DRY) { console.log(`  DRY: correría págs ${tanda[0]}-${tanda[tanda.length - 1]}`); continue; }

    let datasetId = await correrTanda(tanda);
    const destino = join(dataDir, `${ZONA}-p${tanda[0]}-${tanda[tanda.length - 1]}.json`);
    let n = await bajarDataset(datasetId, destino);
    if (n === 0) {
      // Una página vacía puede ser transitoria (verificado 31/8: la 64 dio 0
      // y al reintentar trajo sus 30). Reintentar una vez antes de creerle.
      console.log('  0 items: reintento una vez…');
      await sleep(15000);
      datasetId = await correrTanda(tanda);
      n = await bajarDataset(datasetId, destino);
    }
    totalItems += n;
    console.log(`  dataset ${datasetId}: ${n} items → ${destino}`);
    if (n === 0) {
      vaciasSeguidas++;
      if (vaciasSeguidas >= 2) {
        console.log('  2 páginas vacías seguidas (reintentadas): fin del inventario.');
        if (USA_CKPT) writeFileSync(ckptFile, JSON.stringify({ done: true, lastPage: tanda[tanda.length - 1] }));
        terminado = true;
        break;
      }
      continue;
    }
    vaciasSeguidas = 0;

    execFileSync(process.execPath, [
      join(__dirname, 'loader.mjs'),
      '--file', destino, '--zona', ZONA, '--tipo', 'refresco',
      '--paginas', String(tanda.length), '--esperados', '0',
    ], { stdio: 'inherit', env: process.env });
    // Checkpoint DESPUÉS de cargar la tanda: si nos cortan, retomamos desde acá.
    if (USA_CKPT) writeFileSync(ckptFile, JSON.stringify({ lastPage: tanda[tanda.length - 1], done: false }));
  }

  // Si recorrimos todo el rango hasta HASTA sin frenar por tope, el barrio está
  // terminado: HASTA=210 es el techo de paginación de ZonaProp, no hay más allá.
  if (USA_CKPT && !frenadoPorTope && !terminado && !DRY) {
    writeFileSync(ckptFile, JSON.stringify({ done: true, lastPage: HASTA }));
    console.log(`[barrido] ${ZONA}: agotado el rango de páginas (techo ${HASTA}). Marcado como terminado.`);
  }

  console.log(`[barrido] fin: ${totalItems} items bajados en total.`);
}

main().catch(e => { console.error('[barrido] FATAL:', e.message); process.exit(1); });
