#!/usr/bin/env node
/**
 * Vuelca el pipeline de ClickUp a MailerLite.
 *
 * El proceso de outbound NO termina en ClickUp: todo lead tiene que quedar tambien en
 * MailerLite, con mail, nombre, telefono y una descripcion completa. Lo pidio Leonardo
 * el 27-ago-2026, despues de descubrir que 84 leads estaban solo en el tablero.
 *
 *   node .claude/skills/vakdor-socio/scripts/volcar-mailerlite.mjs [--dry]
 *
 * Se corre DESPUES de outbound-diario.mjs. Es idempotente: MailerLite actualiza al que ya
 * existe en vez de duplicarlo, asi que correrlo dos veces no rompe nada.
 *
 * SEGURIDAD DEL ENVIO. Va al grupo "Pipeline Outbound" y nunca dispara un mail: el endpoint
 * que se usa no manda nada por si mismo. Son contactos en frio que nunca pidieron nada, asi
 * que un envio automatico seria un desastre y ademas quemaria la reputacion del dominio.
 *
 * Lo unico que podria mandarles algo solo es una automatizacion con disparador "se sumo al
 * grupo". Al 27/08/2026 la cuenta no tiene ninguna automatizacion activa. Si algun dia se
 * crea una, revisar esto antes: que salga un mail tiene que ser una decision de Leonardo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../../..');
const DRY = process.argv.includes('--dry');
const NL = String.fromCharCode(10);

/**
 * Grupo propio de los leads del pipeline. Antes iban a IMPORTADOS-NO-ENVIAR, pero ahi ya
 * habia 136 suscriptores de otra cosa y quedaba todo mezclado; Leonardo pidio separarlos el
 * 27/08/2026. Este grupo tiene SOLO gente del pipeline de outbound.
 *
 * Que esten aparte no los vuelve enviables: siguen siendo contactos en frio que nunca
 * pidieron nada. Antes de apuntarle una campana a este grupo, mirar uno por uno — hay
 * fichas marcadas con "[!]" en el resumen que son casillas de oficina o mails equivocados.
 */
const GRUPO = '196986392716248714';   // Pipeline Outbound

const env = (() => {
  const t = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = {};
  for (const l of t.split('\n')) { const g = l.match(/^([A-Z_0-9]+)=(.*)$/); if (g) m[g[1]] = g[2].trim(); }
  return m;
})();
for (const k of ['CLICKUP_API_KEY', 'MAILERLITE_API_KEY']) {
  if (!env[k] || env[k].length < 20) { console.error(`falta ${k} en .env`); process.exit(1); }
}
const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpio = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const grupo1 = (txt, re) => { const m = txt.match(re); return m ? limpio(m[1]) : ''; };

// ------------------------------------------------------------------ ClickUp

/** Todas las tareas del pipeline, PAGINANDO: ClickUp manda 100 y no avisa que hay mas. */
async function pipeline() {
  const H = { Authorization: env.CLICKUP_API_KEY };
  const todas = [];
  for (let pag = 0; pag < 50; pag++) {
    const u = `https://api.clickup.com/api/v2/list/${ids.lPipeline}/task?include_closed=true&page=${pag}`;
    const j = await (await fetch(u, { headers: H })).json();
    todas.push(...(j.tasks || []));
    if (j.last_page || !(j.tasks || []).length) break;
    await dormir(200);
  }
  return todas;
}

// ------------------------------------------------------------------ parseo

/**
 * El mail SOLO se toma de una linea que lo declare como el mail de ESTA persona.
 *
 * Agarrar el primer mail del texto es peligroso: en la ficha de Ruben Frattini el primero es
 * luis@proptechlatam.com, que es de Lucho —otra persona que Ruben sumo a la conversacion—.
 * Sin esta guarda, Ruben quedaba registrado con el mail de un tercero. Si no hay etiqueta, la
 * ficha no entra: es preferible que falte a que este mal.
 */
function mailDeclarado(d) {
  for (const re of [
    /^\s*Mail:\s*([\w.+-]+@[\w-]+\.[\w.]+)/m,
    /Email de trabajo[^:]*:\s*([\w.+-]+@[\w-]+\.[\w.]+)/i,
    /^\s*Email:\s*([\w.+-]+@[\w-]+\.[\w.]+)/m,
  ]) { const m = d.match(re); if (m) return m[1].toLowerCase(); }
  return '';
}

function parsear(t) {
  const d = t.description || '';
  const email = mailDeclarado(d);
  if (!email) return null;

  const nuevo = /ESCRIBIRLE:\s*\n\s*Mail:/.test(d);
  let cargo, empresa, pais, empleados, linkedin, nota, fuente;

  if (nuevo) {
    cargo = grupo1(d, /^CARGO:\s*(.+)$/m);
    const emp = grupo1(d, /^EMPRESA:\s*(.+)$/m);
    const mp = emp.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    empresa = mp ? limpio(mp[1]) : emp;
    pais = mp ? limpio(mp[2]) : '';
    empleados = grupo1(d, /TAMANO:.*?(\d+)\s*empleados/s);
    linkedin = grupo1(d, /LinkedIn:\s*(\S+)/);
    nota = grupo1(d, /^NOTA:\s*([\s\S]*?)(?:\n\n|$)/m);
    fuente = /Google Maps \(via Apify\)/.test(d) ? 'Apify (Google Maps) + Apollo' : 'Apollo';
  } else {
    const ce = grupo1(d, /^Cargo y empresa:\s*(.+)$/m);
    const mp = ce.match(/^(.*?)\s*\(~?([\d.]+)\s*(?:personas|empleados)\)\s*$/);
    const ce2 = mp ? limpio(mp[1]) : ce;
    empleados = mp ? mp[2].replace(/\./g, '') : '';
    const men = ce2.match(/^(.*?)\s+(?:en|de)\s+(.+)$/i);
    cargo = men ? limpio(men[1]) : ce2;
    empresa = men ? limpio(men[2]) : '';
    pais = grupo1(d, /^Pais:\s*(.+)$/m);
    linkedin = grupo1(d, /^Perfil:\s*(\S+)/m) || grupo1(d, /(https:\/\/www\.linkedin\.com\/in\/\S+)/);
    nota = grupo1(d, /POR QUE LO ELEGI[^:]*:\s*([\s\S]*?)(?:\n\n|$)/);
    fuente = 'Sales Navigator + Apollo';
  }

  const cf = (n) => (t.custom_fields || []).find((c) => c.name === n);
  if (!empresa && cf('Empresa')?.value) empresa = limpio(cf('Empresa').value);
  const co = cf('Origen');
  const origen = co?.type_config?.options ? (co.type_config.options[co.value]?.name || '') : '';

  // Las advertencias van PRIMERAS. Si el "OJO ANTES DE ESCRIBIRLE" no viaja, MailerLite
  // muestra un mail malo como si fuera bueno y nadie se entera hasta que el mensaje falla.
  const ojo = grupo1(d, /OJO ANTES DE ESCRIBIRLE:\s*([\s\S]*?)\n\s*\n/);
  const alerta = [ojo, /^OJO[:,]?\s*/i.test(nota) ? nota : ''].filter(Boolean).join(' ').replace(/^-\s*/, '');

  /*
   * El link que abre el chat de LinkedIn ya con el destinatario cargado. Es el unico que se
   * clickea de verdad: el perfil obliga a buscar el boton "Mensaje". Va al campo `linkedin`
   * de MailerLite cuando existe, y el perfil queda como respaldo. Lo pidio Leonardo el
   * 27/08/2026 al ver que las fichas cargadas desde Apollo no lo traian.
   */
  const chat = grupo1(d, /(https:\/\/www\.linkedin\.com\/messaging\/thread\/new\/\?recipient=\S+)/);

  const partes = t.name.trim().split(/\s+/);
  const resumen = [
    alerta ? `[!] ${alerta}` : '',
    chat ? `Escribirle por LinkedIn: ${chat}` : '',
    `${t.name} — ${cargo || 'cargo no registrado'} en ${empresa || 'empresa no registrada'}${pais ? `, ${pais}` : ''}.`,
    empleados ? `${empleados} empleados en LinkedIn segun Apollo; NO verificado como asesores ni como propiedades publicadas.` : '',
    `Etapa: ${t.status.status}. Origen: ${origen || 'sin registrar'}.`,
    !alerta && nota ? nota : '',
    `Fuente: ${fuente}.`,
  ].filter(Boolean).join(' ').slice(0, 900);

  const campos = {
    name: partes[0],
    last_name: partes.slice(1).join(' '),
    company: empresa,
    country: pais,
    nombre_de_la_inmobiliaria: empresa,
    cargo_en_la_inmobiliaria: cargo,
    // Empleados de Apollo NO va a "Cantidad Asesores": Apollo cuenta gente en LinkedIn y el
    // IPC2 son asesores. Poner uno donde va el otro seria inventar el dato.
    empleados_linkedin: empleados,
    linkedin: chat || linkedin,
    estado_calificacion: t.status.status,
    fuente_del_lead: fuente,
    resumen_del_lead: resumen,
    tarea_clickup: t.url || t.id,
  };
  for (const k of Object.keys(campos)) if (!campos[k]) delete campos[k];
  return { email, name: partes[0], fields: campos };
}

// --------------------------------------------------------------- MailerLite

/**
 * Alta o actualizacion de UN suscriptor.
 *
 * Se usa `POST /api/subscribers`, no `/api/subscribers/import`: el de import espera un
 * ARCHIVO subido (multipart) y devuelve 422 "The file field is required" si se le manda un
 * JSON con la lista adentro. Paso el 27/08/2026. Este endpoint crea si no existe y actualiza
 * si ya esta, asi que el script se puede correr todos los dias sin duplicar a nadie.
 *
 * No lleva `autoresponders`: este endpoint no dispara nada por si mismo. Lo que hay que
 * cuidar es que no se cree una automatizacion con disparador "se sumo al grupo", porque eso
 * SI le mandaria un mail a cada lead nuevo. Hoy la cuenta no tiene ninguna automatizacion
 * activa; si alguna vez se crea una, revisar esto antes.
 */
async function subirUno(s) {
  const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MAILERLITE_API_KEY}`,
      'Content-Type': 'application/json', Accept: 'application/json',
    },
    body: JSON.stringify({ email: s.email, fields: s.fields, groups: [GRUPO], status: 'active' }),
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, cuerpo: txt.slice(0, 300) };
}

// -------------------------------------------------------------------- main

const tareas = await pipeline();
const listos = [], sinMail = [];
for (const t of tareas) { const p = parsear(t); if (p) listos.push(p); else sinMail.push(t.name); }

const vistos = new Set(), unicos = [];
for (const s of listos) { if (!vistos.has(s.email)) { vistos.add(s.email); unicos.push(s); } }

console.log(`pipeline: ${tareas.length} tareas`);
console.log(`con mail declarado: ${unicos.length}`);
console.log(`SIN mail (no pueden entrar): ${sinMail.length}`);
if (sinMail.length) {
  console.log('  -> son los del buscador de Sales Navigator, que no captura mail.');
  console.log(`     ${sinMail.slice(0, 5).join(', ')}${sinMail.length > 5 ? `, y ${sinMail.length - 5} mas` : ''}`);
}

if (DRY) { console.log(`\n[dry] hubiera subido ${unicos.length} a Pipeline Outbound`); process.exit(0); }

// De a uno, con pausa: MailerLite corta a las 120 llamadas por minuto.
let subidos = 0; const fallados = [];
for (const s of unicos) {
  const r = await subirUno(s);
  if (r.ok) { subidos++; process.stdout.write('.'); }
  else { fallados.push(`${s.email}: HTTP ${r.status} ${r.cuerpo}`); process.stdout.write('x'); }
  await dormir(520);
}
console.log(`\nsubidos a Pipeline Outbound: ${subidos} de ${unicos.length}`);
if (fallados.length) { console.log('FALLARON:'); for (const f of fallados) console.log('  ' + f); }
