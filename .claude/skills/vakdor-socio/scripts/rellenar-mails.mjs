#!/usr/bin/env node
/**
 * Le busca el mail en Apollo a las fichas del pipeline que no lo tienen.
 *
 * POR QUE. Hasta el 27/08/2026 el buscador de Sales Navigator cargaba solo el link de
 * LinkedIn. Resultado: 81 de 165 tareas sin mail, que no podian entrar a MailerLite ni
 * recibir un segundo canal cuando LinkedIn no contestaba. `outbound-diario.mjs` ya lo
 * arregla de aca en adelante; este script es para el atraso.
 *
 *   node .claude/skills/vakdor-socio/scripts/rellenar-mails.mjs [--dry] [--max N]
 *
 * CUESTA CREDITOS DE APOLLO: uno por mail que encuentra. Correr con --dry primero para ver
 * cuantos son. Solo se acepta el mail si Apollo lo da como `verified`: un `guessed` que
 * rebota ensucia la reputacion del dominio, y para eso es mejor no tenerlo.
 *
 * Solo sirve para las fichas que traen un link /in/ real. Las que solo tienen la URL de
 * Sales Navigator (/sales/lead/...) NO se pueden resolver desde aca: hace falta el
 * navegador abierto, que es lo que hace `identificadorPublico()` en outbound-diario.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../../..');
const DRY = process.argv.includes('--dry');
const MAX = (() => { const i = process.argv.indexOf('--max'); return i > 0 ? Number(process.argv[i + 1]) : Infinity; })();
const NL = String.fromCharCode(10);

const env = (() => {
  const t = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = {};
  for (const l of t.split('\n')) { const g = l.match(/^([A-Za-z_0-9]+)=(.*)$/); if (g) m[g[1]] = g[2].trim(); }
  return m;
})();
for (const k of ['CLICKUP_API_KEY', 'APOLLO_API_KEY']) {
  if (!env[k] || env[k].length < 15) { console.error(`falta ${k} en .env`); process.exit(1); }
}
const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
const H = { Authorization: env.CLICKUP_API_KEY, 'Content-Type': 'application/json' };
const B2 = 'https://api.clickup.com/api/v2';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ya tiene mail? Se mira la etiqueta, no cualquier mail suelto en el texto. */
const YA_TIENE = /^\s*Mail:\s*[\w.+-]+@|Email de trabajo[^:]*:\s*[\w.+-]+@/m;

/**
 * El identificador publico de LinkedIn. Sale del link al chat (?recipient=) o del /in/.
 * La URL de Sales Navigator (/sales/lead/...) NO sirve: es un id interno, no el slug.
 */
function identDe(d) {
  const chat = d.match(/messaging\/thread\/new\/\?recipient=([^\s&]+)/);
  if (chat) return chat[1];
  const perfil = d.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  return perfil ? perfil[1].replace(/\/$/, '') : null;
}

async function buscarEnApollo(ident) {
  const r = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json', 'x-api-key': env.APOLLO_API_KEY },
    body: JSON.stringify({ linkedin_url: `https://www.linkedin.com/in/${ident}` }),
  });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const p = (await r.json()).person;
  if (!p) return { error: 'no lo encontro' };
  if (!p.email) return { error: 'sin mail' };
  if (p.email_status && p.email_status !== 'verified') return { error: `mail "${p.email_status}", se descarta` };
  return { email: p.email, empresa: p.organization?.name || '', empleados: p.organization?.estimated_num_employees || '' };
}

// --- pipeline completo, paginando ---
const todas = [];
for (let pag = 0; pag < 50; pag++) {
  const j = await (await fetch(`${B2}/list/${ids.lPipeline}/task?include_closed=true&page=${pag}`, { headers: { Authorization: env.CLICKUP_API_KEY } })).json();
  todas.push(...(j.tasks || []));
  if (j.last_page || !(j.tasks || []).length) break;
  await dormir(200);
}

const candidatas = todas
  .filter((t) => !YA_TIENE.test(t.description || '') && identDe(t.description || ''))
  .slice(0, MAX);

console.log(`pipeline: ${todas.length} tareas`);
console.log(`sin mail y con LinkedIn resoluble: ${candidatas.length}`);
console.log(`sin mail y SIN LinkedIn resoluble: ${todas.filter((t) => !YA_TIENE.test(t.description || '') && !identDe(t.description || '')).length} (solo tienen la URL de Sales Navigator)`);

if (DRY) {
  console.log(`\n[dry] costaria hasta ${candidatas.length} creditos de Apollo. No se llamo a nadie.`);
  for (const t of candidatas.slice(0, 10)) console.log(`  ${t.name} [${t.status.status}] -> ${identDe(t.description)}`);
  process.exit(0);
}

let hallados = 0, gastados = 0;
const fallidos = [];
for (const t of candidatas) {
  const ident = identDe(t.description);
  const r = await buscarEnApollo(ident);
  gastados++;
  if (r.error) { fallidos.push(`${t.name}: ${r.error}`); process.stdout.write('-'); await dormir(400); continue; }

  // Se AGREGA al final, no se pisa nada. La etiqueta "Mail:" es la que lee volcar-mailerlite.mjs.
  const extra = [
    '',
    '=== SEGUNDO CANAL (agregado el 2026-08-27, buscado en Apollo por el perfil de LinkedIn) ===',
    `Mail: ${r.email}`,
    'Verificado por Apollo. No mandar LinkedIn y mail el mismo dia.',
    r.empleados ? `Apollo le cuenta ${r.empleados} empleados a ${r.empresa || 'la empresa'} (empleados NO es asesores).` : '',
  ].filter(Boolean).join(NL);

  const res = await fetch(`${B2}/task/${t.id}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ description: (t.description || '') + NL + extra }),
  });
  if (res.ok) { hallados++; process.stdout.write('.'); }
  else { fallidos.push(`${t.name}: ClickUp HTTP ${res.status}`); process.stdout.write('x'); }
  await dormir(500);
}

console.log(`\nmails encontrados y agregados: ${hallados} de ${gastados} consultados`);
if (fallidos.length) {
  console.log(`sin resultado (${fallidos.length}):`);
  for (const f of fallidos) console.log(`  ${f}`);
}
