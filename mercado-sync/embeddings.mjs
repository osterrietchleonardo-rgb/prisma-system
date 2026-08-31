#!/usr/bin/env node
// ============================================================================
// mercado-sync/embeddings.mjs — completa el embedding de mercado_avisos
//
// MISMA receta que roomix-sync/crawler.mjs y lib/gemini.ts para que los
// vectores sean comparables con properties y con el Buscador IA:
//   gemini-embedding-001 · taskType RETRIEVAL_DOCUMENT · 768 dims
//   texto = titulo + descripcion + barrio + amenities
//
// Procesa solo las filas con embedding null y calidad != cuarentena
// (la basura no merece vector). Reanudable: correrlo de nuevo sigue
// donde quedó. Uso:  node mercado-sync/embeddings.mjs [--lote 40]
// ============================================================================

import { readFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const LOTE = parseInt(arg('lote', '40'));

const envFile = process.env.ENV_FILE;
if (envFile) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
}
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, GK = process.env.GEMINI_API_KEY;
if (!SB_URL || !SB_KEY || !GK) { console.error('Faltan credenciales (ENV_FILE)'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function embed(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GK}`;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: text.substring(0, 10000) }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 }),
    });
    if (res.ok) return (await res.json()).embedding.values;
    if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
    throw new Error(`embed ${res.status}`);
  }
  throw new Error('embed: 429 persistente');
}

async function main() {
  let hechos = 0, errores = 0;
  for (;;) {
    const r = await fetch(`${SB_URL}/rest/v1/mercado_avisos?embedding=is.null&calidad=neq.cuarentena&select=id,titulo,descripcion,barrio,amenities&order=id&limit=${LOTE}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const filas = await r.json();
    if (!filas.length) break;

    for (const f of filas) {
      const txt = [f.titulo, f.descripcion, f.barrio, (f.amenities || []).join(', ')].filter(Boolean).join(' ').trim();
      try {
        if (!txt) throw new Error('sin texto');
        const vec = await embed(txt);
        const p = await fetch(`${SB_URL}/rest/v1/mercado_avisos?id=eq.${f.id}`, {
          method: 'PATCH',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ embedding: JSON.stringify(vec) }),
        });
        if (!p.ok) throw new Error(`patch ${p.status}`);
        hechos++;
        if (hechos % 100 === 0) console.log(`[embeddings] ${hechos} listos…`);
      } catch (e) { errores++; console.error(`  ${f.id}: ${e.message}`); if (errores > 30) throw new Error('demasiados errores, freno'); }
      await sleep(120);   // ~8/s: bajo el rate limit sin apurar
    }
  }
  console.log(`[embeddings] fin: ${hechos} embebidos · ${errores} errores`);
}

main().catch(e => { console.error('[embeddings] FATAL:', e.message); process.exit(1); });
