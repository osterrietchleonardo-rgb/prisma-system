#!/usr/bin/env node
// ============================================================================
// mercado-sync/telefonos.mjs — completa el teléfono de los avisos
//
// Corre el actor haketa/zonaprop-scraper (el único que trae el whatsApp en
// texto, US$0,003/aviso) sobre una URL de búsqueda y hace PATCH del campo
// telefono en mercado_avisos por postingId. No inserta filas nuevas: los
// avisos que no existan en la tabla se ignoran (los carga el barrido memo23).
//
// Uso:
//   node mercado-sync/telefonos.mjs --url <busqueda ZonaProp> [--max N]
// ============================================================================

import { readFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const URL_BUSQUEDA = arg('url');
const MAX = parseInt(arg('max', '100'));
if (!URL_BUSQUEDA) { console.error('Falta --url'); process.exit(1); }

const envFile = process.env.ENV_FILE;
if (envFile) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
}
const TOK = process.env.APIFY_API_KEY, SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!TOK || !SB_URL || !SB_KEY) { console.error('Faltan credenciales (ENV_FILE)'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const res = await fetch(`https://api.apify.com/v2/acts/haketa~zonaprop-scraper/runs?token=${TOK}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUrls: [URL_BUSQUEDA], maxItems: MAX, includeDescription: false }),
  });
  if (!res.ok) throw new Error(`lanzar: ${res.status}`);
  const run = (await res.json()).data;
  console.log(`[telefonos] run ${run.id} sobre ${URL_BUSQUEDA}`);

  let datasetId = null;
  for (let i = 0; i < 60; i++) {
    await sleep(8000);
    const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOK}`)).json()).data;
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(st.status)) {
      if (st.status !== 'SUCCEEDED') throw new Error(`run terminó ${st.status}`);
      datasetId = st.defaultDatasetId; break;
    }
  }
  if (!datasetId) throw new Error('run no terminó en 8 min');

  const items = await (await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${TOK}&clean=true&format=json`)).json();
  console.log(`[telefonos] ${items.length} avisos con datos de contacto`);

  let conTel = 0, patched = 0, sinFila = 0;
  for (const it of items) {
    const id = parseInt(it.postingId);
    const tel = (it.whatsApp || '').trim() || null;
    if (!tel) continue;
    conTel++;
    const r = await fetch(`${SB_URL}/rest/v1/mercado_avisos?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ telefono: tel }),
    });
    if (!r.ok) { console.error(`  ${id}: ${r.status}`); continue; }
    const rows = await r.json();
    if (rows.length > 0) patched++; else sinFila++;
  }
  console.log(`[telefonos] listo: ${conTel} con teléfono · ${patched} actualizados en la tabla · ${sinFila} sin fila aún (los cargará el barrido)`);
}

main().catch(e => { console.error('[telefonos] FATAL:', e.message); process.exit(1); });
