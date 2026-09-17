#!/usr/bin/env node
// ============================================================================
// mercado-sync/descubrimiento.mjs — el barrido A: lo publicado HOY
//
// Corre el actor con filterPublishedWithin=1 (verificado: devuelve SOLO los
// avisos publicados en el día) para una zona, baja el dataset y lo carga.
// Es el barrido barato que mantiene el mapa al día: centavos por corrida.
//
// LA VENTANA SE CALCULA SOLA (--dentro-de sigue existiendo para correrlo a mano).
// El piso es 2 porque la ventana del actor es "el día anterior entero + lo que va
// de hoy"; sube a 3 cuando FALTÓ una corrida, que es lo que pasó el 9, 10, 11, 14
// y 15 de septiembre: nadie recuperó esos días. Ver mercado-sync/plan.mjs.
//
// Y antes de lanzar consulta el uso del mes en Apify: si llegó al tope del plan
// (US$ 100), FRENA con error en vez de seguir gastando. Con --dry dice qué haría
// y no gasta un centavo.
//
// Uso:  node mercado-sync/descubrimiento.mjs --location Belgrano --zona belgrano
//       [--tipo-prop departamentos] [--dentro-de 2] [--max 50] [--espera-min 40]
//       [--tope-usd 90] [--dry]
//       [--recuperar <runId>]  ← carga una corrida ya pagada que quedó sin cargar
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ventanaDescubrimiento, hayPresupuesto } from './plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const LOCATION = arg('location');
const ZONA = arg('zona', (LOCATION || '').toLowerCase());
const TIPO_PROP = arg('tipo-prop', '');            // vacío = todos los tipos
const DENTRO_MANUAL = arg('dentro-de', null);      // 2|3 días; sin esto, se calcula
const MAX = parseInt(arg('max', '50'));            // tope de items por corrida
const TOPE = parseFloat(arg('tope-usd', '90'));    // freno de seguridad dentro del plan de US$ 100
const DRY = process.argv.includes('--dry');
// Cuánto esperamos a que el actor termine. OJO: la corrida YA SE PAGA aunque
// nosotros dejemos de esperar, así que cortar temprano es tirar plata. Todo CABA
// con --max 1500 tarda 10-13 min (medido 5..12-sep); 40 min deja margen de sobra.
const ESPERA_MIN = parseInt(arg('espera-min', '40'));
if (!LOCATION) { console.error('Falta --location'); process.exit(1); }

const envFile = process.env.ENV_FILE;
if (envFile) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
}
const TOK = process.env.APIFY_API_KEY;
if (!TOK) { console.error('Falta APIFY_API_KEY'); process.exit(1); }
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL, SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Si nos pasan --recuperar <runId>, no lanzamos nada: agarramos el dataset de una
// corrida que ya se pagó y quedó sin cargar (p.ej. porque se agotó la espera).
const RECUPERAR = arg('recuperar', '');

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: opts.prefer || 'return=minimal' },
  });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

/** Cuándo fue la última corrida de descubrimiento de esta zona que quedó registrada. */
async function ultimaCorrida() {
  if (!SB_URL || !SB_KEY) return null;
  const filas = await sb(
    `mercado_barridos?tipo=eq.descubrimiento&zona=eq.${encodeURIComponent(ZONA)}&order=inicio.desc&limit=1&select=inicio`,
    { prefer: 'return=representation' }
  );
  return filas?.[0]?.inicio ?? null;
}

/** Cuánto lleva gastado la cuenta este mes. Si no se puede leer, devuelve null. */
async function usoApify() {
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me/limits?token=${TOK}`);
    if (!r.ok) return { usado: null, limite: null };
    const j = await r.json();
    return { usado: j.data?.current?.monthlyUsageUsd ?? null, limite: j.data?.limits?.maxMonthlyUsageUsd ?? null };
  } catch { return { usado: null, limite: null }; }
}

async function lanzar(DENTRO) {
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
  const vueltas = ESPERA_MIN * 6;   // una cada 10 s
  for (let i = 0; i < vueltas; i++) {
    await sleep(10000);
    const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOK}`)).json()).data;
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(st.status)) {
      if (st.status !== 'SUCCEEDED') throw new Error(`run terminó ${st.status}`);
      datasetId = st.defaultDatasetId; break;
    }
    if (i > 0 && i % 12 === 0) console.log(`[descubrimiento] ${(i / 6).toFixed(0)} min esperando (${st.status})…`);
  }
  if (!datasetId) throw new Error(`run no terminó en ${ESPERA_MIN} min — la corrida ${run.id} igual se pagó; se recupera con --recuperar ${run.id}`);
  return datasetId;
}

async function main() {
  // 1) La guardia del presupuesto. El 14 y 15 de septiembre las corridas murieron
  // con "lanzar: 403" porque la cuenta estaba en US$ 102,43 de un límite de 100:
  // Apify rechaza lanzar. Mejor frenar nosotros, con el motivo escrito.
  const { usado, limite } = await usoApify();
  if (!RECUPERAR && !hayPresupuesto(usado, TOPE)) {
    const aviso = `FRENO POR PRESUPUESTO: el mes lleva US$ ${usado?.toFixed(2)} y el tope de seguridad es US$ ${TOPE} (límite de la cuenta: US$ ${limite}). No se lanza nada hasta que arranque el ciclo nuevo o se suba el límite.`;
    if (!DRY) { console.error(`[descubrimiento] ${aviso}`); process.exit(1); }
    console.warn(`[descubrimiento] ${aviso}`);
    console.warn('[descubrimiento] (en seco sigo igual, para poder ver la ventana que se calcularía)');
  }

  // 2) La ventana: lo que falte desde la última corrida registrada, con piso 2 y techo 3.
  const ultima = await ultimaCorrida().catch((e) => { console.warn(`[descubrimiento] no pude leer la última corrida (${e.message}); uso la ventana más amplia.`); return null; });
  const DENTRO = String(DENTRO_MANUAL ?? ventanaDescubrimiento(ultima, new Date()));
  console.log(`[descubrimiento] ${ZONA}: última corrida ${ultima || 'nunca'} · ventana ${DENTRO} día(s) · tope ${MAX} items · uso del mes US$ ${usado?.toFixed(2) ?? '?'} de ${TOPE}`);
  if (DRY) { console.log('[descubrimiento] DRY: hasta acá llego, no se lanza ninguna corrida.'); return; }

  let datasetId;
  if (RECUPERAR) {
    const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${RECUPERAR}?token=${TOK}`)).json()).data;
    if (!st) throw new Error(`no existe la corrida ${RECUPERAR}`);
    if (st.status !== 'SUCCEEDED') throw new Error(`la corrida ${RECUPERAR} está ${st.status}, no hay nada que recuperar`);
    datasetId = st.defaultDatasetId;
    console.log(`[descubrimiento] recuperando la corrida ${RECUPERAR} (${st.startedAt.slice(0, 16)}) — ya pagada, no se lanza nada`);
  } else {
    datasetId = await lanzar(DENTRO);
  }

  const txt = await (await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${TOK}&clean=true&format=json`)).text();
  const items = JSON.parse(txt);
  const n = items.length;
  const dataDir = join(__dirname, 'data');
  mkdirSync(dataDir, { recursive: true });
  const destino = join(dataDir, `descubrimiento-${ZONA}-${new Date().toISOString().slice(0, 10)}${RECUPERAR ? '-rec-' + RECUPERAR : ''}.json`);
  writeFileSync(destino, txt);
  console.log(`[descubrimiento] ${n} avisos nuevos → ${destino}`);
  if (n === 0) {
    // Un día sin publicaciones también es una corrida que pasó, y la ventana del
    // día siguiente se calcula con la última corrida REGISTRADA: si no la
    // dejamos escrita, mañana pediría un día de más y lo pagaría de más. El
    // loader es el que escribe la fila, y hoy no va a correr.
    if (SB_URL && SB_KEY) {
      const ahora = new Date().toISOString();
      await sb('mercado_barridos', {
        method: 'POST',
        body: JSON.stringify([{
          tipo: 'descubrimiento', zona: ZONA, inicio: ahora, fin: ahora,
          esperados: 0, obtenidos: 0, paginas: 1, errores: 0,
          completo: false, habilita_bajas: false, costo_usd: 0,
          notas: `descubrimiento sin publicaciones nuevas (ventana ${DENTRO} día/s)`,
        }]),
      }).catch((e) => console.warn(`[descubrimiento] no pude registrar la corrida vacía: ${e.message}`));
    }
    console.log('[descubrimiento] día sin publicaciones nuevas.');
    return;
  }

  // Cuántos trae de cada día de publicación. Es el termómetro del tope: la ventana
  // real es "ayer entero + lo que va de hoy", así que si n queda por debajo de --max
  // significa que ayer entró completo. Medido 8..12-sep: CABA publica 1277-1543/día.
  const porDia = {};
  for (const it of items) { const d = (it.list_publication_begin || '').slice(0, 10); if (d) porDia[d] = (porDia[d] || 0) + 1; }
  console.log(`[descubrimiento] por día de publicación: ${JSON.stringify(porDia)}`);

  execFileSync(process.execPath, [
    join(__dirname, 'loader.mjs'),
    '--file', destino, '--zona', ZONA, '--tipo', 'descubrimiento',
    '--paginas', '1', '--esperados', '0',
  ], { stdio: 'inherit', env: process.env });

  // Si tocó el tope, el día más viejo de la ventana quedó cortado y esos avisos no
  // los vuelve a ver nadie hasta el refresco mensual. Subir --max, que no encarece:
  // la ventana real es más chica que el tope, se paga por item devuelto.
  if (!RECUPERAR && n >= MAX) console.warn(`[descubrimiento] AVISO: se tocó el tope de ${MAX} items — hay avisos del día anterior que quedaron afuera. Subir --max.`);
}

main().catch(e => { console.error('[descubrimiento] FATAL:', e.message); process.exit(1); });
