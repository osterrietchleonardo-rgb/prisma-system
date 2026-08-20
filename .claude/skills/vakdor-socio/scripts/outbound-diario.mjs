#!/usr/bin/env node
/**
 * Outbound diario — el trabajo del trimestre, preparado.
 *
 * Entra a Sales Navigator con la sesion real de Leonardo, en navegador VISIBLE y a
 * ritmo humano. Lee la busqueda guardada con paginacion, descarta a quien ya esta en
 * el pipeline, puntua contra el IPC2, y deja los 10 candidatos del dia.
 * Ademas lee la bandeja y marca a quien hay que seguir.
 *
 * NUNCA manda un mensaje. Los manda Leonardo a mano.
 *
 *   node .claude/skills/vakdor-socio/scripts/outbound-diario.mjs [paginas]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../../..');
const SALIDA = path.join(AQUI, '..', 'estado');
const PAGINAS = Number(process.argv[2] || 5);
const BUSQUEDA = 'https://www.linkedin.com/sales/search/people?savedSearchId=2001387130';

// Nunca contactar. Victor Arlandi es el presidente de Central (padre de Kevin).
const NUNCA = [/victor\s+arlandi/i, /kevin\s+arlandi/i];

const env = (() => {
  const t = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = {};
  for (const l of t.split('\n')) { const g = l.match(/^([A-Z_0-9]+)=(.*)$/); if (g) m[g[1]] = g[2].trim(); }
  return m;
})();

// En Windows hay que invocar el .js con node: el bin global es un .cmd y Node
// no lo puede ejecutar directo (ENOENT). Usar shell:true abriria inyeccion.
const CLI = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/playwright-cli.js');
if (!fs.existsSync(CLI)) { console.error('falta @playwright/cli (npm i -g @playwright/cli)'); process.exit(1); }
const pw = (args) => execFileSync(process.execPath, [CLI, '-s=linkedin', '--raw', ...args],
  { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, cwd: RAIZ }).trim();
const json = (s) => { try { return JSON.parse(JSON.parse(s)); } catch { try { return JSON.parse(s); } catch { return null; } } };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
/** Pausa variable: parecerse a una persona leyendo, no a un robot paginando. */
const pausaHumana = () => dormir(2500 + Math.random() * 3000);

// ---------------------------------------------------------------- ya conocidos

async function yaEnPipeline() {
  const H = { Authorization: env.CLICKUP_API_KEY };
  const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
  const r = await fetch(`https://api.clickup.com/api/v2/list/${ids.lPipeline}/task?include_closed=true`, { headers: H });
  const j = await r.json();
  return new Set((j.tasks || []).map(t => normalizar(t.name)));
}
const normalizar = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// ----------------------------------------------------------- encaje y puntaje

/*
 * La busqueda guardada de Sales Navigator YA filtra en LinkedIn por:
 *   industria = Real Estate + Commercial Real Estate
 *   cargo     = Director General / de ventas / Presidente / Dueno de agencia /
 *               Dueno de franquicia / Propietario / Socio fundador / ...
 *   empresa   = 11 a 500 empleados
 *   ademas    = publico en LinkedIn en los ultimos 30 dias
 *
 * O sea: volver a exigir "que sea inmobiliaria" descarta de mas, porque LinkedIn
 * ya lo garantizo. Aca solo se saca lo que LinkedIn no puede distinguir: dentro
 * del rubro inmobiliario hay desarrolladoras, constructoras y consultoras, que
 * NO tienen equipo de asesores gestionando leads y por lo tanto PRISMA no les sirve.
 */

// Sub-rubros del real estate que no tienen equipo comercial de asesores.
const EMPRESA_NO = /(col·legi|colegio de|asociacion|asociación|camara|cámara|federacion|federación|sindicato|desarrollador|desarrollos|developers?|land |promoci[oó]n y desarrollo|promotor|tasa(dora|cion|ciones)|tecnitasa|valuacion|constructor|consultor[ai]|arquitectur|estudio jur|abogad|fondo de inversi|asset management|private equity|banco|seguros|hotel|coworking|urbanizador|ingenier|notari|escriban|tasacion|proptech|software|universidad|instituto|academia|capacitacion)/i;
// Si igual dice que es inmobiliaria o red de agencias, gana esto y entra.
const EMPRESA_SI = /(inmobiliari|bienes ra[ií]ces|real estate|propiedades|brokers?|re\/?max|century ?21|coldwell|keller williams|engel|keymex|tecnocasa|era |century)/i;
// Cargos que deciden o sufren la operacion. Socios y co-founders incluidos.
const CARGO_SI = /(due[nñ]o|propietari|presidente|vicepresidente|socio|co-?founder|cofundador|fundador|ceo|director|gerente|head of|country manager|partner)/i;
// Nunca: no deciden ni tienen equipo.
const CARGO_NO = /(asesor inmobiliari|agente inmobiliari|corredor independiente|coach|mentor|docente|profesor|estudiante|community manager|recursos humanos|marketing digital)/i;

/** Devuelve el bloque "cargo + empresa + lugar", que es lo que se puede leer con confianza. */
function bloqueCargo(resto, nombre) {
  let t = resto;
  if (nombre && t.startsWith(nombre)) t = t.slice(nombre.length).trim();
  t = t
    .replace(/^Contacto de .*?grado ·\s*\S+\s*/i, '')
    .replace(/Visto Ya has visto el perfil de .*? antes\.\s*/i, '')
    .replace(/^Guardado\s*/i, '')
    .replace(/\s*Guardado\s*/i, ' ');
  t = t.split(/\s+\d+\s+a[nñ]os?\s/)[0].split(/\s+\d+\s+mes(es)?\s/)[0].split(/\s+Acerca de:/)[0];
  return t.trim().slice(0, 120);
}

/** Descarta duro. Devuelve el motivo si NO encaja, o null si encaja. */
function noEncaja(p) {
  const b = bloqueCargo(p.resto, p.nombre);
  if (!b) return 'no se pudo leer el cargo';
  if (CARGO_NO.test(b)) return 'no decide ni tiene equipo';
  if (!CARGO_SI.test(b)) return 'el cargo no es de direccion, gerencia ni sociedad';
  if (EMPRESA_NO.test(b) && !EMPRESA_SI.test(b))
    return 'sub-rubro sin equipo de asesores (desarrolladora, consultora, etc.)';
  return null;
}

/** Ordena entre los que ya encajan. */
function puntuar(p) {
  const b = bloqueCargo(p.resto, p.nombre).toLowerCase();
  const t = p.resto.toLowerCase();
  let n = 0; const por = [];
  if (/(due[nñ]o|propietari|presidente|socio fundador|cofundador|co-?founder|ceo|director general|director ejecutivo)/.test(b)) { n += 3; por.push('decide solo'); }
  else if (/(director comercial|director de ventas)/.test(b)) { n += 3; por.push('sufre la operacion y decide'); }
  else if (/socio|partner/.test(b)) { n += 3; por.push('socio'); }
  else if (/director/.test(b)) { n += 2; por.push('direccion'); }
  else if (/gerente/.test(b)) { n += 2; por.push('gerencia'); }
  if (EMPRESA_SI.test(b)) { n += 2; por.push('inmobiliaria confirmada'); }
  if (/contacto de 1er/.test(t)) { n += 2; por.push('1er grado'); }
  else if (/contacto de 2º/.test(t)) { n += 1; por.push('2º grado'); }
  const anios = (t.match(/(\d+)\s*a[nñ]os?\s+.*?en la empresa/) || [])[1];
  if (anios && Number(anios) >= 3) { n += 1; por.push(`${anios} años ahí`); }
  if (/argentina/.test(t)) { n += 1; por.push('Argentina'); }
  if (/publicaciones recientes/.test(t)) { n += 1; por.push('publica'); }
  return { puntaje: n, porque: por.join(' · ') };
}

// ----------------------------------------------------------------------- main

console.log('Abriendo Sales Navigator con tu sesion (navegador visible)...');
pw(['open', BUSQUEDA, '--persistent', '--headed', '--browser=chrome']);
await dormir(16000);   // Sales Navigator tarda en renderizar la primera pagina

const excluir = await yaEnPipeline();
console.log(`ya en el pipeline: ${excluir.size} personas (no se vuelven a proponer)`);

const todos = [];
for (let pag = 1; pag <= PAGINAS; pag++) {
  // scroll lento hasta cargar la pagina entera
  pw(['run-code', `async page => {
    const cont = await page.evaluateHandle(() => {
      const a = document.querySelector('a[href*="/sales/lead/"]');
      let e = a; while (e && e.scrollHeight <= e.clientHeight + 50) e = e.parentElement;
      return e;
    });
    for (let i = 0; i < 12; i++) {
      await cont.evaluate(e => e.scrollBy(0, e.clientHeight * 0.75));
      await page.waitForTimeout(600 + Math.random()*700);
    }
    return true;
  }`]);
  await pausaHumana();

  const datos = json(pw(['eval', `
(() => {
  const filas = [...document.querySelectorAll('li.artdeco-list__item')].filter(li => li.querySelector('a[href*="/sales/lead/"]'));
  const vistos = new Set(); const out = [];
  for (const li of filas) {
    const a = li.querySelector('a[href*="/sales/lead/"]');
    const url = a.getAttribute('href').split('?')[0];
    if (vistos.has(url)) continue; vistos.add(url);
    const t = li.innerText.replace(/\\s+/g,' ').trim();
    const mNom = t.match(/^Añadir (.+?) a la selección/);
    const nombre = mNom ? mNom[1] : t.split(' Contacto de ')[0].slice(0,60);
    // "Guardado" = Leonardo ya lo guardo como lead, o sea ya lo contacto.
    out.push({ nombre, url, guardado: /Guardado/.test(t), resto: t.replace(/^Añadir .+? a la selección /,'').slice(0,240) });
  }
  return JSON.stringify(out);
})()`]));
  console.log(`  pagina ${pag}: ${datos?.length ?? 0} perfiles`);
  if (datos) todos.push(...datos);

  if (pag < PAGINAS) {
    const hay = json(pw(['eval', `(() => {
      const b = [...document.querySelectorAll('button')].find(x => /siguiente|next/i.test(x.innerText) && !x.disabled);
      if (!b) return JSON.stringify(false);
      b.click(); return JSON.stringify(true);
    })()`]));
    if (!hay) { console.log('  no hay mas paginas'); break; }
    await pausaHumana();
  }
}

// ------------------------------------------------------- filtrar y seleccionar

const vistos = new Set();
const candidatos = [];
let yaGuardados = 0, yaPipeline = 0;
const descartados = [];
for (const p of todos) {
  const clave = normalizar(p.nombre);
  if (!clave || vistos.has(clave)) continue;
  vistos.add(clave);
  if (NUNCA.some(re => re.test(p.nombre))) { console.log(`  excluido por regla: ${p.nombre}`); continue; }
  if (p.guardado) { yaGuardados++; continue; }   // ya contactado
  if (excluir.has(clave)) { yaPipeline++; continue; }
  const motivo = noEncaja(p);
  if (motivo) { descartados.push({ nombre: p.nombre, motivo }); continue; }
  const { puntaje, porque } = puntuar(p);
  candidatos.push({ ...p, puntaje, porque });
}
candidatos.sort((a, b) => b.puntaje - a.puntaje);
const diez = candidatos.slice(0, 10);
console.log(`descartados: ${yaGuardados} ya contactados · ${yaPipeline} en el pipeline · ${descartados.length} no encajan`);
const porMotivo = {};
for (const d of descartados) porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1;
for (const [m, c] of Object.entries(porMotivo)) console.log(`   ${c}x  ${m}`);

// ------------------------------------- cargar los 10 al pipeline en "sin contactar"

async function cargarAlPipeline(lista) {
  const H = { Authorization: env.CLICKUP_API_KEY, 'Content-Type': 'application/json' };
  const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
  const B2 = 'https://api.clickup.com/api/v2';
  const f = await (await fetch(`${B2}/list/${ids.lPipeline}/field`, { headers: H })).json();
  const campo = {}, opcion = {};
  for (const x of f.fields) {
    campo[x.name] = x.id;
    for (const o of (x.type_config?.options ?? [])) opcion[x.name + '|' + o.name] = o.id;
  }
  let n = 0;
  for (const c of lista) {
    const perfil = 'https://www.linkedin.com' + c.url;
    const bloque = bloqueCargo(c.resto, c.nombre);
    const desc = [
      `POR QUE LO ELEGI (puntaje ${c.puntaje}): ${c.porque}.`,
      '',
      `Cargo y empresa: ${bloque}`,
      '',
      `Perfil y chat: ${perfil}`,
      '(desde ahi, boton "Mensaje" para escribirle)',
      '',
      `Seleccionado el ${new Date().toISOString().slice(0,10)} por el outbound diario, de la busqueda guardada 2001387130.`,
      'Toque 1: apertura con observacion de SU operacion + pregunta de si o no. El guion esta en el vault, 20 Frentes/outbound.md.',
    ].join(String.fromCharCode(10));
    const cf = [
      { id: campo['Origen'], value: opcion['Origen|Frío calificado'] },
      { id: campo['Perfil'], value: perfil },
    ].filter(x => x.id && x.value !== undefined);
    const r = await fetch(`${B2}/list/${ids.lPipeline}/task`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ name: c.nombre, description: desc, status: 'sin contactar',
        priority: c.puntaje >= 7 ? 2 : 3, custom_fields: cf }),
    });
    if (r.status === 200) n++;
    await dormir(220);
  }
  return n;
}

const cargados = await cargarAlPipeline(diez);
console.log(`cargados al pipeline en "sin contactar": ${cargados}`);

// ------------------------------------------------------- seguimientos pendientes

console.log('Leyendo la bandeja...');
pw(['goto', 'https://www.linkedin.com/sales/inbox/']);
await dormir(7000);
const hilos = json(pw(['eval', `
(() => {
  const items = [...document.querySelectorAll('li.conversation-list-item')];
  return JSON.stringify(items.map(x => {
    const nom = (x.querySelector('.artdeco-entity-lockup__title, [class*=title]')||{}).innerText||'';
    const t = x.innerText.replace(/\\s+/g,' ').trim();
    const tiempos = [...x.querySelectorAll('time, [class*=timestamp]')].map(e=>e.innerText.trim()).filter(Boolean);
    return { nombre: String(nom).replace(/\\s+/g,' ').trim(), fecha: tiempos[0]||'?', resumen: t.slice(0,150) };
  }));
})()`])) || [];

const fecha = new Date().toISOString().slice(0, 10);
const parte = { fecha, buscados: todos.length, yaGuardados, yaPipeline, candidatos: candidatos.length, descartados, diez, hilos };
fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, `outbound-${fecha}.json`), JSON.stringify(parte, null, 2));

console.log(`\n=== 10 CANDIDATOS DEL DIA (de ${todos.length} leidos) ===`);
for (const c of diez) {
  console.log(`  [${c.puntaje}] ${c.nombre} — ${bloqueCargo(c.resto, c.nombre).slice(0, 78)}`);
  console.log(`       ${c.porque}`);
}
console.log(`\n=== HILOS EN LA BANDEJA: ${hilos.length} ===`);
console.log(`parte guardado en estado/outbound-${fecha}.json`);
console.log('\nEl navegador queda abierto para que mandes los mensajes vos.');
