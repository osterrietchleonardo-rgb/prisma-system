#!/usr/bin/env node
/**
 * Sincroniza las descripciones de los rituales diarios de ClickUp.
 *
 * FUENTE UNICA DE VERDAD: el vault de Obsidian. Este script NO escribe el texto
 * a mano: lo lee de `20 Frentes/engagement-linkedin.md` (el bloque de codigo del
 * enfoque) y lo pega en la descripcion de cada instancia de la tarea diaria de
 * engagement. Si el enfoque cambia en el vault, se corre esto y listo.
 *
 * Tambien normaliza la tarea diaria de outbound: 10 mensajes + revisar respuestas.
 *
 * Es idempotente: si la descripcion ya coincide, no toca la tarea.
 *
 *   node .claude/skills/vakdor-socio/scripts/sincronizar-rituales.mjs [--aplicar]
 *
 * Sin --aplicar solo muestra que cambiaria. Nada se escribe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../../..');
const VAULT = 'C:/Users/LENOVO/OneDrive/Escritorio/Vakdor/MEMORIA/VAKDOR';
const APLICAR = process.argv.includes('--aplicar');

const env = (() => {
  const m = {};
  for (const l of fs.readFileSync(path.join(RAIZ, '.env'), 'utf8').split('\n')) {
    const g = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (g) m[g[1]] = g[2].trim();
  }
  return m;
})();

const H = { Authorization: env.CLICKUP_API_KEY, 'Content-Type': 'application/json' };
const B = 'https://api.clickup.com/api/v2';
const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------- el enfoque, desde el vault

function enfoqueEngagement() {
  const p = path.join(VAULT, '20 Frentes/engagement-linkedin.md');
  const txt = fs.readFileSync(p, 'utf8');
  // El enfoque es el primer bloque de codigo del archivo, el que arranca con "ROL".
  const m = txt.match(/```\r?\n(ROL\r?\n[\s\S]*?)```/);
  if (!m) throw new Error(`No encontre el bloque del enfoque en ${p}. No se toca nada.`);
  return m[1].trimEnd();
}

const CABECERA_ENG = [
  'Ritual diario, 16:30. Comentar y responder en LinkedIn.',
  '',
  'Antes de arrancar: la lista de personas sale del pipeline de ClickUp, primero los de',
  'toque 1 (ya recibieron un mensaje) y despues los sin contactar.',
  '',
  'Tandas de 10 pestanas, no 60. Si LinkedIn pide un captcha o verificacion, se frena todo.',
  '',
  'FUENTE: este texto se genera desde el vault, 20 Frentes/engagement-linkedin.md.',
  'Si cambia alla, correr: node .claude/skills/vakdor-socio/scripts/sincronizar-rituales.mjs --aplicar',
  '',
  '--- PROMPT PARA PEGAR EN LA EXTENSION DE CHROME ---',
  '',
].join('\n');

const NOMBRE_OUT = 'Outbound: 10 mensajes + revisar respuestas';
const DESC_OUT = [
  'Ritual diario, 11:00. Dos partes, y la segunda es la que mas rinde.',
  '',
  '1) REVISAR PRIMERO (antes de mandar nada):',
  '   - Quien contesto un toque y sigue sin respuesta mia.',
  '   - Quien quedo en toque 1 o toque 2 y le toca el siguiente.',
  '   - Bandeja de LinkedIn, WhatsApp y mail. Un hilo mudo en LinkedIn NO prueba que no',
  '     se hablo: la conversacion puede haber seguido por otro canal.',
  '',
  '2) MANDAR AL MENOS 10 MENSAJES.',
  '   Son 10 TOQUES, no 10 personas nuevas: cuentan las aperturas y los seguimientos de',
  '   la secuencia de 3 toques (dia 1 apertura, dia 2 valor, dia 4 briefing).',
  '',
  'Solo IPC2: director o dueno con +30 asesores, +300 propiedades y capacidad de inversion.',
  'El guion completo, con las frases textuales de directores reales, esta en el vault:',
  '20 Frentes/outbound.md',
  '',
  'Los candidatos del dia los deja el Socio al abrir /socio (Sales Navigator, 10 ordenados',
  'por puntaje). Los mensajes los manda Leonardo a mano: el script nunca envia nada.',
].join('\n');

// ------------------------------------------------------------------- ejecucion

const j = await (await fetch(`${B}/list/${ids.lTareas}/task?include_closed=false&subtasks=false`, { headers: H })).json();
const todas = j.tasks || [];

const enfoque = enfoqueEngagement();
const descEng = CABECERA_ENG + enfoque;

const eng = todas.filter((t) => /^Engagement en LinkedIn/i.test(t.name));
const out = todas.filter((t) => /^Outbound:/i.test(t.name));

console.log(`engagement: ${eng.length} instancias | outbound: ${out.length} instancias`);
console.log(`enfoque leido del vault: ${enfoque.length} caracteres`);
if (!APLICAR) console.log('\n(simulacion — nada se escribe. Agregar --aplicar)\n');

let cambios = 0;

for (const t of eng) {
  const actual = await (await fetch(`${B}/task/${t.id}`, { headers: H })).json();
  if ((actual.description || '').trim() === descEng.trim()) { console.log(`  = ${t.id} ya sincronizada`); continue; }
  console.log(`  ${APLICAR ? '+' : '~'} ${t.id} descripcion (${(actual.description || '').length} -> ${descEng.length})`);
  if (APLICAR) {
    const r = await fetch(`${B}/task/${t.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ description: descEng }) });
    if (!r.ok) console.error(`    ERROR ${r.status}: ${await r.text()}`);
    else cambios++;
    await pausa(250);
  }
}

for (const t of out) {
  const actual = await (await fetch(`${B}/task/${t.id}`, { headers: H })).json();
  const okNombre = actual.name === NOMBRE_OUT;
  const okDesc = (actual.description || '').trim() === DESC_OUT.trim();
  if (okNombre && okDesc) { console.log(`  = ${t.id} ya sincronizada`); continue; }
  console.log(`  ${APLICAR ? '+' : '~'} ${t.id} ${okNombre ? '' : 'nombre '}${okDesc ? '' : 'descripcion'}`);
  if (APLICAR) {
    const r = await fetch(`${B}/task/${t.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: NOMBRE_OUT, description: DESC_OUT }) });
    if (!r.ok) console.error(`    ERROR ${r.status}: ${await r.text()}`);
    else cambios++;
    await pausa(250);
  }
}

console.log(`\n${APLICAR ? `${cambios} tareas actualizadas.` : 'Simulacion terminada.'}`);
