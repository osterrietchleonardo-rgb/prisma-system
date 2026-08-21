#!/usr/bin/env node
/**
 * Outbound diario — el trabajo del trimestre, preparado.
 *
 * Entra a LinkedIn con la sesion real de Leonardo, en navegador VISIBLE y a ritmo
 * humano. Lee las DOS bandejas para saber a quien ya le escribio, recorre la busqueda
 * guardada de Sales Navigator con paginacion, y deja los 10 candidatos del dia
 * cargados en el pipeline en la etapa "sin contactar", con el link y el motivo.
 *
 * NUNCA manda un mensaje. Los manda Leonardo a mano.
 *
 *   node .claude/skills/vakdor-socio/scripts/outbound-diario.mjs [paginas]
 *
 * MANTENIMIENTO: todo el codigo que se manda al navegador va en constantes con
 * String.raw. Sin eso, un \s dentro de un template literal llega al navegador como
 * "s" y el replace termina borrando todas las eses del texto. Paso el 20/08/2026.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../../..');
const SALIDA = path.join(AQUI, '..', 'estado');
const PAGINAS = Number(process.argv[2] || 5);
/** Perfil del navegador, FUERA del repo: guarda las cookies de la sesion de LinkedIn. */
const PERFIL = path.join(process.env.USERPROFILE || process.env.HOME || '', '.playwright-perfiles', 'linkedin');
const BUSQUEDA = 'https://www.linkedin.com/sales/search/people?savedSearchId=2001387130';

// Nunca contactar. Victor Arlandi es el presidente de Central (padre de Kevin).
const NUNCA = [/victor\s+arlandi/i, /kevin\s+arlandi/i];

const env = (() => {
  const t = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = {};
  for (const l of t.split('\n')) { const g = l.match(/^([A-Z_0-9]+)=(.*)$/); if (g) m[g[1]] = g[2].trim(); }
  return m;
})();

// En Windows hay que invocar el .js con node: el bin global es un .cmd y Node no lo
// puede ejecutar directo (ENOENT). Usar shell:true para saltearlo abriria inyeccion.
const CLI = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/playwright-cli.js');
if (!fs.existsSync(CLI)) { console.error('falta @playwright/cli (npm i -g @playwright/cli)'); process.exit(1); }
const pw = (args) => execFileSync(process.execPath, [CLI, '-s=linkedin', '--raw', ...args],
  { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, cwd: RAIZ }).trim();
const json = (s) => { try { return JSON.parse(JSON.parse(s)); } catch { try { return JSON.parse(s); } catch { return null; } } };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
/** Pausa variable: parecerse a una persona leyendo, no a un robot paginando. */
const pausaHumana = () => dormir(2500 + Math.random() * 3000);
const normalizar = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// ------------------------------------------- codigo que corre dentro del navegador

const JS_BANDEJA_SALES = String.raw`
(() => {
  const items = [...document.querySelectorAll('li.conversation-list-item')];
  return JSON.stringify(items.map(x => {
    const nom = (x.querySelector('.artdeco-entity-lockup__title, [class*=title]') || {}).innerText || '';
    const t = x.innerText.replace(/\s+/g, ' ').trim();
    const tiempos = [...x.querySelectorAll('time, [class*=timestamp]')].map(e => e.innerText.trim()).filter(Boolean);
    return { nombre: String(nom).replace(/\s+/g, ' ').trim(), fecha: tiempos[0] || '?', texto: t.slice(0, 200), bandeja: 'sales' };
  }));
})()`;

const JS_SCROLL_MENSAJES = String.raw`async page => {
  const cont = await page.evaluateHandle(() => {
    const li = document.querySelector('li.msg-conversation-listitem');
    let e = li; while (e && e.scrollHeight <= e.clientHeight + 50) e = e.parentElement;
    return e;
  });
  for (let i = 0; i < 10; i++) {
    await cont.evaluate(e => e.scrollBy(0, e.clientHeight * 0.8));
    await page.waitForTimeout(800 + Math.random() * 600);
  }
  return true;
}`;

const JS_BANDEJA_LINKEDIN = String.raw`
(() => {
  const items = [...document.querySelectorAll('li.msg-conversation-listitem')];
  return JSON.stringify(items.map(x => {
    const nom = (x.querySelector('.msg-conversation-listitem__participant-names, [class*=participant-names]') || {}).innerText || '';
    const t = x.innerText.replace(/\s+/g, ' ').trim();
    return { nombre: String(nom).replace(/\s+/g, ' ').trim(), fecha: '', texto: t.slice(0, 200), bandeja: 'linkedin' };
  }));
})()`;

const JS_SCROLL_BUSQUEDA = String.raw`async page => {
  const cont = await page.evaluateHandle(() => {
    const a = document.querySelector('a[href*="/sales/lead/"]');
    let e = a; while (e && e.scrollHeight <= e.clientHeight + 50) e = e.parentElement;
    return e;
  });
  for (let i = 0; i < 12; i++) {
    await cont.evaluate(e => e.scrollBy(0, e.clientHeight * 0.75));
    await page.waitForTimeout(600 + Math.random() * 700);
  }
  return true;
}`;

const JS_EXTRAER = String.raw`
(() => {
  const filas = [...document.querySelectorAll('li.artdeco-list__item')].filter(li => li.querySelector('a[href*="/sales/lead/"]'));
  const vistos = new Set(); const out = [];
  for (const li of filas) {
    const a = li.querySelector('a[href*="/sales/lead/"]');
    const url = a.getAttribute('href').split('?')[0];
    if (vistos.has(url)) continue; vistos.add(url);
    const t = li.innerText.replace(/\s+/g, ' ').trim();
    const mNom = t.match(/^Añadir (.+?) a la selección/);
    const nombre = mNom ? mNom[1] : t.split(' Contacto de ')[0].slice(0, 60);
    out.push({ nombre, url, guardado: /Guardado/.test(t), resto: t.replace(/^Añadir .+? a la selección /, '').slice(0, 240) });
  }
  return JSON.stringify(out);
})()`;

const JS_SIGUIENTE = String.raw`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /siguiente|next/i.test(x.innerText) && !x.disabled);
  if (!b) return JSON.stringify(false);
  b.click(); return JSON.stringify(true);
})()`;

// --------------------------------------------------------- quien ya fue contactado

/*
 * La marca "Guardado" de Sales Navigator NO prueba que se le haya escrito: se puede
 * guardar un lead sin mandarle nada. Paso el 20/08/2026 con Rodrigo Urquiaga, CEO de
 * R&R Inmobiliaria en Peru, que figuraba guardado y nunca habia recibido un mensaje.
 *
 * La verdad son las bandejas, y son DOS: la de Sales Navigator y la de LinkedIn.
 */
async function leerBandejas() {
  const hilos = [];
  pw(['goto', 'https://www.linkedin.com/sales/inbox/']);
  await dormir(8000);
  hilos.push(...(json(pw(['eval', JS_BANDEJA_SALES])) || []));
  await pausaHumana();

  pw(['goto', 'https://www.linkedin.com/messaging/']);
  await dormir(8000);
  pw(['run-code', JS_SCROLL_MENSAJES]);
  hilos.push(...((json(pw(['eval', JS_BANDEJA_LINKEDIN])) || []).filter(h => h.nombre)));
  return hilos;
}

/*
 * Un saludo no es un contacto comercial. Si lo unico que hubo fue "me alegro de que
 * hayamos conectado" o "felicidades por tu aniversario de trabajo", la persona sigue
 * sin contactar. Lo dijo Leonardo el 20/08 y los datos le dieron la razon: cinco CEOs
 * de inmobiliaria (SkyOne, BRIKSS, R&R, Dost) solo tenian una felicitacion.
 */
const SOLO_SALUDO = /(hayamos conectado|aniversario de trabajo|gracias por conectar|feliz cumplea)/i;

// ------------------------------------------------------------- encaje y puntaje

/*
 * La busqueda guardada YA filtra en LinkedIn por industria (Real Estate), cargo,
 * tamano de empresa (11-500), idioma y actividad reciente. Volver a exigir todo eso
 * descarta de mas. Aca solo se saca lo que LinkedIn no distingue: dentro del rubro
 * hay desarrolladoras, constructoras, tasadoras y camaras, que no tienen equipo de
 * asesores gestionando leads y por lo tanto no son clientes de PRISMA.
 */
const EMPRESA_NO = /(col·legi|colegio de|asociacion|asociación|camara|cámara|federacion|federación|sindicato|desarrollador|desarrollos|developers?|land |promoci[oó]n y desarrollo|promotor|tasa(dora|cion|ciones)|tecnitasa|valuacion|constructor|consultor[ai]|arquitectur|estudio jur|abogad|fondo de inversi|asset management|private equity|banco|seguros|hotel|coworking|urbanizador|ingenier|notari|escriban|proptech|software|universidad|instituto|academia|capacitacion|wealth)/i;
const EMPRESA_SI = /(inmobiliari|bienes ra[ií]ces|real estate|propiedades|brokers?|re\/?max|century ?21|coldwell|keller williams|engel|keymex|tecnocasa)/i;
const CARGO_SI = /(due[nñ]o|propietari|presidente|vicepresidente|socio|co-?founder|cofundador|fundador|ceo|director|gerente|head of|country manager|partner)/i;
const CARGO_NO = /(asesor inmobiliari|agente inmobiliari|advisor|corredor independiente|coach|mentor|docente|profesor|estudiante|community manager|recursos humanos|marketing digital)/i;

/** Devuelve el bloque "cargo + empresa + lugar", que es lo unico que se lee con confianza. */
function bloqueCargo(resto, nombre) {
  let t = resto;
  if (nombre && t.startsWith(nombre)) t = t.slice(nombre.length).trim();
  t = t.replace(/^Contacto de \S+ y miembro de LinkedIn Premium ·\s*\S+\s*/i, '')
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
    return 'sub-rubro sin equipo de asesores (desarrolladora, consultora, camara, etc.)';
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
  if (anios && Number(anios) >= 3) { n += 1; por.push(anios + ' años ahí'); }
  if (/argentina/.test(t)) { n += 1; por.push('Argentina'); }
  if (/publicaciones recientes/.test(t)) { n += 1; por.push('publica'); }
  return { puntaje: n, porque: por.join(' · ') };
}

// ------------------------------------------------------- el link directo al chat

/*
 * Sales Navigator NO tiene URL al chat: su boton "Mensaje" es un overlay de JS y la barra
 * de direcciones no cambia. Comprobado el 21/08/2026 abriendolo y mirando location.href.
 *
 * El link que SI funciona es el de la mensajeria normal de LinkedIn, y necesita el
 * identificador publico (el /in/xxx). Ese dato lo devuelve la API interna de Sales
 * Navigator en el campo flagshipProfileUrl.
 *
 * Verificado a mano: el link abre la mensajeria con el destinatario ya cargado y el cursor
 * en el compositor. Un solo clic para empezar a escribir. No manda nada.
 */
const DEC_PERFIL = '%28entityUrn%2CobjectUrn%2CfirstName%2ClastName%2CfullName%2Cheadline%2CflagshipProfileUrl%29';

/** De /sales/lead/<id>,<authType>,<authToken> saca el identificador publico, o null. */
async function identificadorPublico(urlLead) {
  const m = String(urlLead).match(/\/sales\/lead\/([^,]+),([^,]+),([^/?#\s]+)/);
  if (!m) return null;
  const js = `async page => { const r = await page.evaluate(async () => {
    const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)/)||[])[1];
    const u = 'https://www.linkedin.com/sales-api/salesApiProfiles/(profileId:${m[1]},authType:${m[2]},authToken:${m[3]})?decoration=${DEC_PERFIL}';
    const res = await fetch(u, {headers:{'csrf-token':csrf,'accept':'application/json','x-restli-protocol-version':'2.0.0'}});
    if (!res.ok) return null;
    const j = await res.json();
    return j.flagshipProfileUrl || null;
  }); return JSON.stringify(r); }`;
  try {
    const flagship = json(pw(['run-code', js]));
    return flagship ? (String(flagship).match(/\/in\/([^/?#]+)/) || [])[1] || null : null;
  } catch { return null; }
}

const linkChat = (ident) => 'https://www.linkedin.com/messaging/thread/new/?recipient=' + ident;

// -------------------------------------------------------------------- ClickUp

async function yaEnPipeline() {
  const H = { Authorization: env.CLICKUP_API_KEY };
  const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
  const j = await (await fetch(`https://api.clickup.com/api/v2/list/${ids.lPipeline}/task?include_closed=true`, { headers: H })).json();
  return new Set((j.tasks || []).map(t => normalizar(t.name)));
}

async function cargarAlPipeline(lista, soloSaludo) {
  const H = { Authorization: env.CLICKUP_API_KEY, 'Content-Type': 'application/json' };
  const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
  const B2 = 'https://api.clickup.com/api/v2';
  const f = await (await fetch(`${B2}/list/${ids.lPipeline}/field`, { headers: H })).json();
  const campo = {}, opcion = {};
  for (const x of f.fields) {
    campo[x.name] = x.id;
    for (const o of (x.type_config?.options ?? [])) opcion[x.name + '|' + o.name] = o.id;
  }
  const NL = String.fromCharCode(10);
  let n = 0;
  for (const c of lista) {
    const perfil = 'https://www.linkedin.com' + c.url;
    const tibio = soloSaludo.has(normalizar(c.nombre));
    // el link al chat va PRIMERO: es el unico que se clickea, el resto es contexto
    const ident = await identificadorPublico(c.url);
    await dormir(1500 + Math.random() * 1200);
    const lineas = ident
      ? ['ESCRIBIRLE (abre el chat directo, ya con el destinatario cargado):', linkChat(ident), '',
         `POR QUE LO ELEGI (puntaje ${c.puntaje}): ${c.porque}.`, '',
         `Cargo y empresa: ${bloqueCargo(c.resto, c.nombre)}`, '',
         `Perfil en Sales Navigator: ${perfil}`, '']
      : [`POR QUE LO ELEGI (puntaje ${c.puntaje}): ${c.porque}.`, '',
         `Cargo y empresa: ${bloqueCargo(c.resto, c.nombre)}`, '',
         `Perfil en Sales Navigator: ${perfil}`,
         'NO SE PUDO SACAR EL LINK AL CHAT: abri el perfil y usa el boton "Mensaje".', ''];
    if (tibio) lineas.push('YA SON CONTACTO: solo recibio un saludo, nunca la propuesta. Arranca mas tibio.', '');
    if (c.guardado) lineas.push('Figura "Guardado" en Sales Navigator pero NO hay ningun mensaje en las bandejas.', '');
    lineas.push(`Seleccionado el ${new Date().toISOString().slice(0, 10)} por el outbound diario.`,
      'El guion del toque 1 esta en el vault: 20 Frentes/outbound.md');
    const cf = [
      { id: campo['Origen'], value: opcion[tibio ? 'Origen|Tibio (comentó o reaccionó)' : 'Origen|Frío calificado'] },
      { id: campo['Perfil'], value: ident ? linkChat(ident) : perfil },
    ].filter(x => x.id && x.value !== undefined);
    const r = await fetch(`${B2}/list/${ids.lPipeline}/task`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ name: c.nombre, description: lineas.join(NL), status: 'sin contactar',
        priority: (tibio || c.puntaje >= 7) ? 2 : 3, custom_fields: cf }),
    });
    if (r.status === 200) n++;
    await dormir(220);
  }
  return n;
}

// ----------------------------------------------------------------------- main

console.log('Abriendo LinkedIn con tu sesion (navegador visible)...');
/*
 * --profile es obligatorio. Sin el, --persistent NO alcanza: el CLI abre el navegador con
 * user-data-dir <in-memory> y el login de Leonardo se pierde apenas se cierra la ventana.
 * Paso el 21/08/2026: la sesion estaba deslogueada, el outbound no pudo correr y 7 contactos
 * del pipeline quedaron sin link. Se comprueba con `playwright-cli list`, que tiene que
 * devolver la ruta del perfil y headed: true.
 * El perfil vive FUERA del repo: guarda las cookies de sesion y no puede entrar en un commit.
 */
pw(['open', 'https://www.linkedin.com/sales/inbox/', '--persistent', '--headed',
    '--browser=chrome', '--profile', PERFIL]);
await dormir(9000);

const excluir = await yaEnPipeline();
console.log(`ya en el pipeline: ${excluir.size} personas`);

console.log('Leyendo las dos bandejas para saber a quien ya le escribiste...');
const bandejas = await leerBandejas();
const conPropuesta = new Set(), soloSaludo = new Set();
for (const h of bandejas) {
  const k = normalizar(h.nombre);
  if (!k) continue;
  if (SOLO_SALUDO.test(h.texto)) soloSaludo.add(k); else conPropuesta.add(k);
}
console.log(`  ${bandejas.length} hilos · ${conPropuesta.size} con propuesta · ${soloSaludo.size} solo saludo`);

console.log('Volviendo a la busqueda guardada...');
pw(['goto', BUSQUEDA]);
await dormir(16000);   // Sales Navigator tarda en renderizar la primera pagina

const todos = [];
for (let pag = 1; pag <= PAGINAS; pag++) {
  pw(['run-code', JS_SCROLL_BUSQUEDA]);
  await pausaHumana();
  const datos = json(pw(['eval', JS_EXTRAER]));
  console.log(`  pagina ${pag}: ${datos?.length ?? 0} perfiles`);
  if (datos) todos.push(...datos);
  if (pag < PAGINAS) {
    if (!json(pw(['eval', JS_SIGUIENTE]))) { console.log('  no hay mas paginas'); break; }
    await pausaHumana();
  }
}

const vistos = new Set(); const candidatos = []; const descartados = [];
let yaEscritos = 0, yaPipeline = 0;
for (const p of todos) {
  const clave = normalizar(p.nombre);
  if (!clave || vistos.has(clave)) continue;
  vistos.add(clave);
  if (NUNCA.some(re => re.test(p.nombre))) { console.log(`  excluido por regla: ${p.nombre}`); continue; }
  if (conPropuesta.has(clave)) { yaEscritos++; continue; }
  if (excluir.has(clave)) { yaPipeline++; continue; }
  const motivo = noEncaja(p);
  if (motivo) { descartados.push({ nombre: p.nombre, motivo }); continue; }
  candidatos.push({ ...p, ...puntuar(p) });
}
// los tibios primero: ya son contacto y solo les falta la propuesta
const esTibio = (c) => soloSaludo.has(normalizar(c.nombre)) ? 1 : 0;
candidatos.sort((a, b) => (esTibio(b) - esTibio(a)) || (b.puntaje - a.puntaje));
const diez = candidatos.slice(0, 10);

console.log(`descartados: ${yaEscritos} ya recibieron la propuesta · ${yaPipeline} en el pipeline · ${descartados.length} no encajan`);
const porMotivo = {};
for (const d of descartados) porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1;
for (const [m, c] of Object.entries(porMotivo)) console.log(`   ${c}x  ${m}`);
const rescatados = diez.filter(esTibio);
if (rescatados.length) console.log(`RESCATADOS (ya son contacto, solo les falta la propuesta): ${rescatados.map(c => c.nombre).join(', ')}`);
const falsosGuardados = diez.filter(c => c.guardado).length;
if (falsosGuardados) console.log(`ojo: ${falsosGuardados} figuran "Guardado" pero no tienen ningun mensaje`);

const cargados = await cargarAlPipeline(diez, soloSaludo);
console.log(`cargados al pipeline en "sin contactar": ${cargados}`);

const fecha = new Date().toISOString().slice(0, 10);
fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, `outbound-${fecha}.json`),
  JSON.stringify({ fecha, buscados: todos.length, yaEscritos, yaPipeline, descartados, diez, hilos: bandejas }, null, 2));

console.log(`\n=== 10 CANDIDATOS DEL DIA (de ${todos.length} leidos) ===`);
for (const c of diez) {
  const tibio = esTibio(c) ? ' [YA ES CONTACTO]' : '';
  console.log(`  [${c.puntaje}] ${c.nombre}${tibio} — ${bloqueCargo(c.resto, c.nombre).slice(0, 70)}`);
  console.log(`       ${c.porque}`);
}
console.log(`\nparte guardado en estado/outbound-${fecha}.json`);
console.log('El navegador queda abierto para que mandes los mensajes vos.');
