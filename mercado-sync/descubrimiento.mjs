#!/usr/bin/env node
// ============================================================================
// mercado-sync/descubrimiento.mjs — el barrido A: lo publicado HOY
//
// Corre el actor con filterPublishedWithin=1 (verificado: devuelve SOLO los
// avisos publicados en el día) para una zona, baja el dataset y lo carga.
// Es el barrido barato que mantiene el mapa al día: centavos por corrida.
//
// Límite conocido: el actor devuelve máx ~50 resultados por corrida. Un día
// normal de Belgrano trae 20-40 nuevos, entra. Si una zona crece, se pasa a
// --dentro-de 2 (últimos 2 días) para que el solape cubra lo que el tope
// corte. El refresco mensual atrapa cualquier resto.
//
// Uso:  node mercado-sync/descubrimiento.mjs --location Belgrano --zona belgrano
//       [--tipo-prop departamentos] [--dentro-de 1]
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const LOCATION = arg('location');
const ZONA = arg('zona', (LOCATION || '').toLowerCase());
const TIPO_PROP = arg('tipo-prop', '');            // vacío = todos los tipos
const DENTRO = arg('dentro-de', '1');              // 1|2|3 días
const MAX = parseInt(arg('max', '50'));            // tope de items por corrida
if (!LOCATION) { console.error('Falta --location'); process.exit(1); }

const envFile = process.env.ENV_FILE;
if (envFile) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
}
const TOK = process.env.APIFY_API_KEY;
if (!TOK) { console.error('Falta APIFY_API_KEY'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const input = {
    filterOperation: 'venta',
    filterLocation: LOCATION,
    filterPublishedWithin: DENTRO,
    maxItems: MAX,
    proxy: { useApifyProxy: true },
  };
  if (TIPO_PROP) input.filterPropertyType = TIPO_PROP;

  const res = await fetch(`https://api.apify.com/v2/acts/memo23~zonaprop-scraper/runs?token=${TOK}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`lanzar: ${res.status}`);
  const run = (await res.json()).data;
  console.log(`[descubrimiento] run ${run.id} · ${LOCATION} · últimos ${DENTRO} día(s)`);

  let datasetId = null;
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOK}`)).json()).data;
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(st.status)) {
      if (st.status !== 'SUCCEEDED') throw new Error(`run terminó ${st.status}`);
      datasetId = st.defaultDatasetId; break;
    }
  }
  if (!datasetId) throw new Error('run no terminó en 10 min');

  const txt = await (await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${TOK}&clean=true&format=json`)).text();
  const n = JSON.parse(txt).length;
  const dataDir = join(__dirname, 'data');
  mkdirSync(dataDir, { recursive: true });
  const destino = join(dataDir, `descubrimiento-${ZONA}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(destino, txt);
  console.log(`[descubrimiento] ${n} avisos nuevos → ${destino}`);
  if (n === 0) { console.log('[descubrimiento] día sin publicaciones nuevas.'); return; }

  execFileSync(process.execPath, [
    join(__dirname, 'loader.mjs'),
    '--file', destino, '--zona', ZONA, '--tipo', 'descubrimiento',
    '--paginas', '1', '--esperados', '0',
  ], { stdio: 'inherit', env: process.env });

  if (n >= MAX) console.warn(`[descubrimiento] AVISO: se alcanzó el tope de ${MAX} items; subir --max o correr con --dentro-de 2 para cubrir el resto.`);
}

main().catch(e => { console.error('[descubrimiento] FATAL:', e.message); process.exit(1); });
