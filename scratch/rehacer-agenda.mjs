import fs from 'node:fs';
const tok = fs.readFileSync('.env','utf8').match(/^CLICKUP_API_KEY=(.+)$/m)[1].trim();
const H = { Authorization: tok, 'Content-Type':'application/json' };
const B = 'https://api.clickup.com/api/v2';
const ids = JSON.parse(fs.readFileSync('scratch/clickup-ids.json','utf8'));
const pausa = ms => new Promise(r => setTimeout(r, ms));

/**
 * Bloques REALES de Leonardo. Salen de `00 Norte/Norte.md` del vault, seccion
 * "La capacidad real". Actualizados el 21/08/2026: el dia arranca a las 10:00 y
 * el contenido se hace entero el sabado a la manana.
 *
 * Las 13:00 a 15:00 no existen: come con su familia. Es sagrado.
 *
 *   10:00-13:00  el bloque grande (lo profundo y lo comercial)
 *   13:00-15:00  FAMILIA — no se agenda nada, nunca
 *   15:00-16:30  producto
 *   16:30-17:30  cierre (engagement, retro los viernes)
 *   sabado 10:00-12:00  todo el contenido de la semana
 *
 * Si el Norte cambia, se cambia aca. Un plan que pida mas horas de las que hay
 * no se cumple, y un plan que no se cumple lo hace sentir en falta todos los dias.
 */
const SLOTS = [
  { h: 10, m: 0,  dur: 60,  tipo: 'profundo' },
  { h: 11, m: 0,  dur: 60,  tipo: 'profundo' },  // se lo lleva el outbound diario
  { h: 12, m: 0,  dur: 60,  tipo: 'profundo' },
  { h: 15, m: 0,  dur: 90,  tipo: 'producto' },
  { h: 16, m: 30, dur: 30,  tipo: 'liviano'  },
  { h: 17, m: 0,  dur: 30,  tipo: 'liviano'  },
];

const j = await (await fetch(B+'/list/'+ids.lTareas+'/task?include_closed=false&subtasks=false',{headers:H})).json();
const todas = j.tasks || [];
const origen = t => {
  const c = (t.custom_fields||[]).find(x => x.name === 'Origen');
  return c?.value ?? '';
};
const esRitual = t => /Ritual de CEO/.test(origen(t));

// Los rituales conservan su dia; solo se les corrige la hora segun que son.
const horaRitual = (nombre) => {
  if (/Engagement/i.test(nombre))             return { h:16, m:30, dur:30 };
  if (/Retro de la semana/i.test(nombre))     return { h:17, m:0,  dur:30 };
  if (/Outbound/i.test(nombre))               return { h:11, m:0,  dur:60 };
  // Los lunes 15:00: Kevin lo usa el martes temprano con sus asesores.
  if (/resumen para Kevin/i.test(nombre))     return { h:15, m:0,  dur:60 };
  // El contenido va entero el sabado 10:00-12:00, uno detras del otro.
  if (/Calendario de contenido/i.test(nombre)) return { h:10, m:0,  dur:30 };
  if (/grabacion de reels/i.test(nombre))     return { h:10, m:30, dur:45 };
  if (/Editar y programar/i.test(nombre))     return { h:11, m:15, dur:45 };
  return { h:10, m:0, dur:60 }; // cualquier ritual nuevo, al bloque grande
};

const clave = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ocupado = new Map();
const marcar = (d, s) => {
  const k = clave(d);
  if (!ocupado.has(k)) ocupado.set(k, new Set());
  ocupado.get(k).add(s.h+':'+s.m);
};
const libre = (d, s) => !(ocupado.get(clave(d))?.has(s.h+':'+s.m));

let nR = 0;
for (const t of todas.filter(esRitual)) {
  const d = new Date(Number(t.due_date));
  const s = horaRitual(t.name);
  const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.h, s.m, 0, 0).getTime();
  marcar(d, s);
  if (Number(t.due_date) !== ts || Number(t.time_estimate||0) !== s.dur*60000) {
    await fetch(B+'/task/'+t.id, { method:'PUT', headers:H, body: JSON.stringify({
      due_date: ts, due_date_time: true, start_date: ts, start_date_time: true, time_estimate: s.dur*60000 })});
    nR++;
    await pausa(150);
  }
}
console.log('rituales reubicados:', nR);

// Producto: se reparte en los huecos que quedan, por prioridad.
const orden = { urgent:0, high:1, normal:2, low:3 };
const producto = todas.filter(t => !esRitual(t))
  .sort((a,b) => (orden[a.priority?.priority] ?? 9) - (orden[b.priority?.priority] ?? 9)
              || Number(a.due_date||0) - Number(b.due_date||0));

const dias = [];
const hoy = new Date();
let cur = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
while (dias.length < 90) {
  const w = cur.getDay();
  if (w >= 1 && w <= 5) dias.push(new Date(cur));
  cur.setDate(cur.getDate() + 1);
}

let i = 0, nP = 0;
for (const t of producto) {
  let puesta = false;
  while (!puesta && i < dias.length) {
    const d = dias[i];
    const s = SLOTS.find(s => libre(d, s));
    if (!s) { i++; continue; }
    const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.h, s.m, 0, 0).getTime();
    marcar(d, s);
    await fetch(B+'/task/'+t.id, { method:'PUT', headers:H, body: JSON.stringify({
      due_date: ts, due_date_time: true, start_date: ts, start_date_time: true, time_estimate: s.dur*60000 })});
    nP++; puesta = true;
    await pausa(150);
  }
}
console.log('tareas de producto reubicadas:', nP);
