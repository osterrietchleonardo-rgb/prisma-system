#!/usr/bin/env node
// ============================================================================
// mercado-sync/verificacion.mjs — el barrido C: el ÚNICO que marca caídos
//
// Toma los avisos "viejos" de una zona (visto_ultima_vez anterior a --dias),
// pide sus fichas de detalle DIRECTAS al actor en tandas de 40, pasa lo que
// vuelve por el loader (así también actualiza precios) y aplica la regla:
//
//   * volvió con online=true            → activo, visto_ultima_vez fresco
//   * volvió con online=false           → CAIDO (probable venta), caido_en=now
//   * pedido directo y NO volvió        → barridos_sin_ver+1
//       - con 2+ fallos → sospechoso (sigue visible, con aviso)
//       - con 4+ fallos → caido con nota (equivale a 404 repetido)
//
// La ausencia en un barrido general NUNCA marca caído; solo esta verificación
// directa puede. Nada se borra jamás: caido conserva dias_en_mercado.
//
// Uso:  node mercado-sync/verificacion.mjs --zona belgrano [--dias 32]
//       [--max 400] [--dry]
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const ZONA = arg('zona');
const DIAS = parseInt(arg('dias', '32'));
const MAX = parseInt(arg('max', '400'));
const DRY = process.argv.includes('--dry');
if (!ZONA) { console.error('Falta --zona'); process.exit(1); }

const envFile = process.env.ENV_FILE;
if (envFile) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
}
const TOK = process.env.APIFY_API_KEY, SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!TOK || !SB_URL || !SB_KEY) { console.error('Faltan credenciales (ENV_FILE)'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { ...HB, Prefer: opts.prefer || 'return=minimal', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

async function correrDetalles(urls) {
  const input = { startUrls: urls.map(u => ({ url: u })), maxItems: 50, proxy: { useApifyProxy: true } };
  const res = await fetch(`https://api.apify.com/v2/acts/memo23~zonaprop-scraper/runs?token=${TOK}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`lanzar: ${res.status}`);
  const run = (await res.json()).data;
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOK}`)).json()).data;
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(st.status)) {
      if (st.status !== 'SUCCEEDED') throw new Error(`run ${st.status}`);
      return await (await fetch(`https://api.apify.com/v2/datasets/${st.defaultDatasetId}/items?token=${TOK}&clean=true&format=json`)).text();
    }
  }
  throw new Error('run no terminó en 10 min');
}

// El slug de zona no siempre coincide con el barrio de la tabla (acentos).
const BARRIO_POR_ZONA = {
  'belgrano': 'Belgrano', 'nunez': 'Núñez', 'colegiales': 'Colegiales',
  'coghlan': 'Coghlan', 'villa-urquiza': 'Villa Urquiza', 'saavedra': 'Saavedra',
  'palermo': 'Palermo',
};

async function main() {
  const barrio = BARRIO_POR_ZONA[ZONA];
  if (!barrio) { console.error(`Zona ${ZONA} sin barrio mapeado (agregar a BARRIO_POR_ZONA)`); process.exit(1); }
  const corte = new Date(Date.now() - DIAS * 86400000).toISOString();
  const candidatos = await sb(
    `mercado_avisos?estado=neq.caido&visto_ultima_vez=lt.${corte}` +
    `&barrio=eq.${encodeURIComponent(barrio)}&select=id,url_publica,barridos_sin_ver,estado&order=visto_ultima_vez&limit=${MAX}`,
    { prefer: 'return=representation' }
  );
  console.log(`[verificacion] ${ZONA}: ${candidatos.length} avisos sin ver hace ${DIAS}+ días${DRY ? ' · DRY' : ''}`);
  if (!candidatos.length || DRY) return;

  const dataDir = join(__dirname, 'data');
  mkdirSync(dataDir, { recursive: true });
  let vivos = 0, caidosOnline = 0, sinRespuesta = 0, aSospechoso = 0, aCaido = 0;

  for (let i = 0; i < candidatos.length; i += 40) {
    const lote = candidatos.slice(i, i + 40);
    const txt = await correrDetalles(lote.map(c => c.url_publica));
    const items = JSON.parse(txt);
    const vueltos = new Map(items.map(it => [parseInt(it.postingId), it]));

    // Los que volvieron vivos pasan por el loader: actualiza precio, hash y visto_ultima_vez
    const vivosItems = items.filter(it => it.online !== false);
    if (vivosItems.length) {
      const destino = join(dataDir, `verif-${ZONA}-${Date.now()}.json`);
      writeFileSync(destino, JSON.stringify(vivosItems));
      execFileSync(process.execPath, [join(__dirname, 'loader.mjs'), '--file', destino, '--zona', ZONA, '--tipo', 'verificacion', '--paginas', '0', '--esperados', '0'], { stdio: 'inherit', env: process.env });
      vivos += vivosItems.length;
    }

    for (const c of lote) {
      const it = vueltos.get(c.id);
      if (it && it.online === false) {
        await sb(`mercado_avisos?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'caido', caido_en: new Date().toISOString() }) });
        caidosOnline++;
      } else if (!it) {
        const n = (c.barridos_sin_ver || 0) + 1;
        const cambio = { barridos_sin_ver: n };
        if (n >= 4) { cambio.estado = 'caido'; cambio.caido_en = new Date().toISOString(); aCaido++; }
        else if (n >= 2) { cambio.estado = 'sospechoso'; aSospechoso++; }
        await sb(`mercado_avisos?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify(cambio) });
        sinRespuesta++;
      }
    }
  }

  await sb('mercado_barridos', {
    method: 'POST',
    body: JSON.stringify([{
      tipo: 'verificacion', zona: ZONA, inicio: new Date().toISOString(), fin: new Date().toISOString(),
      esperados: candidatos.length, obtenidos: vivos, paginas: 0, errores: 0,
      completo: true, habilita_bajas: true,
      costo_usd: Math.round(candidatos.length * 0.15) / 100,
      notas: `verificacion: ${vivos} vivos · ${caidosOnline} caidos(online=false) · ${sinRespuesta} sin respuesta (${aSospechoso}→sospechoso, ${aCaido}→caido)`,
    }]),
  });
  console.log(`[verificacion] fin: ${vivos} vivos · ${caidosOnline} caídos confirmados · ${aSospechoso} a sospechoso · ${aCaido} a caído por 4 fallos`);
}

main().catch(e => { console.error('[verificacion] FATAL:', e.message); process.exit(1); });
