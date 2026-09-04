#!/usr/bin/env node
// ============================================================================
// cargar-caba.mjs — orquesta la carga de los barrios de CABA que faltan.
//
// RESUMIBLE: este entorno corta los procesos de background largos. El orquestador
// lleva un archivo de "hechos" (data/caba-done.txt): al relanzarlo, saltea los
// barrios ya completos y sigue. Un barrio cortado a mitad se re-scrapea desde la
// página 1 la próxima vez (el loader deduplica, así que no hay daño; solo se
// re-baja lo ya visto de ESE barrio).
//
// GUARDAS:
//  * Al arrancar, aborta cualquier run de Apify huérfano (de un corte previo).
//  * Antes de cada barrio consulta el uso mensual y FRENA en --tope-usd.
//  * Cada barrido.mjs también frena solo en --tope-usd por tanda.
//
// Uso: ENV_FILE=./.env node mercado-sync/cargar-caba.mjs --tope-usd 76
// ============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d; };
const TOPE = parseFloat(arg('tope-usd', '76'));
const TANDA = arg('tanda', '30');
const HASTA = arg('hasta', '210');

const envFile = process.env.ENV_FILE;
if (envFile) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
}
const TOK = process.env.APIFY_API_KEY;

const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });
// Un barrio está hecho si su checkpoint (lo escribe barrido.mjs) dice done:true.
const estaHecho = (b) => {
  try { return JSON.parse(readFileSync(join(dataDir, `ckpt-${b}.json`), 'utf8')).done === true; } catch { return false; }
};

// 48 barrios de CABA. Los 7 originales + recoleta se marcan hechos aparte.
const BARRIOS = [
  'recoleta', 'caballito', 'almagro', 'balvanera', 'villa-crespo', 'barracas',
  'flores', 'retiro', 'villa-devoto', 'villa-del-parque', 'monserrat', 'san-nicolas',
  'constitucion', 'san-telmo', 'chacarita', 'villa-ortuzar', 'villa-pueyrredon',
  'boedo', 'parque-patricios', 'villa-luro', 'floresta', 'san-cristobal',
  'parque-chacabuco', 'monte-castro', 'puerto-madero', 'agronomia', 'la-paternal',
  'villa-general-mitre', 'villa-santa-rita', 'villa-real', 'versalles',
  'velez-sarsfield', 'mataderos', 'liniers', 'parque-avellaneda', 'villa-lugano',
  'nueva-pompeya', 'villa-soldati', 'villa-riachuelo', 'parque-chas', 'la-boca',
];

async function uso() {
  try { const j = await (await fetch(`https://api.apify.com/v2/users/me/limits?token=${TOK}`)).json();
    return j.data?.current?.monthlyUsageUsd ?? null; } catch { return null; }
}
async function abortarHuerfanos() {
  try {
    const j = await (await fetch(`https://api.apify.com/v2/actor-runs?token=${TOK}&status=RUNNING&limit=10`)).json();
    for (const r of j.data?.items || []) {
      await fetch(`https://api.apify.com/v2/actor-runs/${r.id}/abort?token=${TOK}`, { method: 'POST' });
      console.log(`[caba] abortado run huérfano ${r.id}`);
    }
  } catch {}
}

async function main() {
  await abortarHuerfanos();
  const pend = BARRIOS.filter(b => !estaHecho(b));
  const hechos = BARRIOS.filter(estaHecho).length;
  console.log(`[caba] hechos: ${hechos} · pendientes: ${pend.length} · tope US$${TOPE}`);
  const u0 = await uso();
  console.log(`[caba] uso Apify: US$${u0?.toFixed(2)}`);

  for (const barrio of pend) {
    const u = await uso();
    if (u != null && u >= TOPE) {
      console.log(`[caba] FRENO en tope: US$${u.toFixed(2)} >= US$${TOPE}. Pendientes: ${pend.filter(b => !estaHecho(b)).join(', ')}`);
      break;
    }
    console.log(`\n===== ${barrio} · uso US$${u?.toFixed(2)}/${TOPE} =====`);
    try {
      execFileSync(process.execPath, [
        join(__dirname, 'barrido.mjs'),
        '--base', `departamentos-venta-${barrio}`,
        '--desde', '1', '--hasta', String(HASTA), '--tanda', String(TANDA),
        '--zona', barrio, '--tope-usd', String(TOPE),
      ], { stdio: 'inherit', env: process.env });
      // barrido.mjs marca ckpt.done al agotar el inventario. Si volvió sin marcarlo,
      // fue el freno por tope (no un barrio terminado): cortamos acá.
      if (!estaHecho(barrio)) {
        console.log(`[caba] ${barrio} volvió sin terminar (probable freno por tope). Corto.`);
        break;
      }
      console.log(`[caba] ✔ ${barrio} hecho`);
    } catch (e) {
      console.error(`[caba] ${barrio} no terminó: ${e.message}. Queda pendiente para el próximo relanzamiento.`);
      break; // cortado (probable kill del entorno): frenar, se retoma al relanzar.
    }
  }
  const uf = await uso();
  console.log(`\n[caba] pausa. uso Apify: US$${uf?.toFixed(2)} · hechos: ${BARRIOS.filter(estaHecho).length}/${BARRIOS.length}`);
}
main().catch(e => { console.error('[caba] FATAL:', e.message); process.exit(1); });
