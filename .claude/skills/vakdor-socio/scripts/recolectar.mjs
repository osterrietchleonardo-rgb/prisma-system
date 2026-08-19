#!/usr/bin/env node
/**
 * Recolector del Socio.
 *
 * Junta el estado real del mundo de Leonardo consultando todas las fuentes EN
 * PARALELO y escribe un parte compacto. No piensa, no opina, no usa IA.
 *
 * Regla de fallo: si una fuente se cae o el token vence, se anota el error y se
 * sigue. NUNCA corta. El Socio tiene que poder decir "esto no lo pude ver" en
 * vez de asumir que está vacío.
 *
 *   node .claude/skills/vakdor-socio/scripts/recolectar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../../..');
const SALIDA = path.join(AQUI, '..', 'estado');
const TIMEOUT_MS = 20000;

// ---------------------------------------------------------------- utilidades

const env = (() => {
  const txt = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = {};
  for (const l of txt.split('\n')) {
    const g = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (g) m[g[1]] = g[2].trim();
  }
  return m;
})();

const conTiempo = (promesa, ms = TIMEOUT_MS) =>
  Promise.race([
    promesa,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
  ]);

/** Corre una fuente y nunca lanza: devuelve {ok, datos} o {ok:false, error}. */
async function fuente(nombre, fn) {
  const t0 = Date.now();
  try {
    const datos = await conTiempo(fn());
    return { nombre, ok: true, ms: Date.now() - t0, datos };
  } catch (e) {
    return { nombre, ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 200) };
  }
}

const json = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
};

const hoy = new Date();
const iso = (d) => new Date(d).toISOString().slice(0, 10);

// ------------------------------------------------------------------- fuentes

async function clickup() {
  const H = { Authorization: env.CLICKUP_API_KEY };
  const ids = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scratch/clickup-ids.json'), 'utf8'));
  const j = await json(`https://api.clickup.com/api/v2/list/${ids.lTareas}/task?include_closed=false&subtasks=false`, { headers: H });
  const ts = j.tasks || [];
  const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).getTime();
  const campo = (t, n) => {
    const c = (t.custom_fields || []).find((x) => x.name === n);
    if (!c || c.value == null) return null;
    if (c.type === 'drop_down') {
      const o = (c.type_config.options || []).find((o) => o.id === c.value || o.orderindex === c.value);
      return o ? o.name : null;
    }
    return c.value;
  };
  const resumir = (t) => ({
    nombre: t.name,
    prioridad: t.priority?.priority ?? 'sin',
    estado: t.status?.status,
    vence: t.due_date ? new Date(Number(t.due_date)).toISOString() : null,
    area: campo(t, 'Área'),
    tipo: campo(t, 'Tipo'),
    afecta: campo(t, 'A quién afecta'),
    origen: campo(t, 'Origen'),
    postergada: campo(t, 'Veces postergada'),
  });
  return {
    total_abiertas: ts.length,
    hoy: ts.filter((t) => t.due_date && Number(t.due_date) <= finDia && Number(t.due_date) >= finDia - 86400000).map(resumir),
    vencidas: ts.filter((t) => t.due_date && Number(t.due_date) < finDia - 86400000).map(resumir),
    postergadas_3_o_mas: ts.filter((t) => Number(campo(t, 'Veces postergada') || 0) >= 3).map(resumir),
  };
}

async function zoho() {
  const { Composio } = await import('@composio/core');
  process.env.COMPOSIO_API_KEY = env.COMPOSIO_API_KEY;
  const s = await new Composio().create('leonardo');
  const ACC = env.ZOHO_ACCOUNT_ID || '5457602000000008002';
  const r = await s.execute('ZOHO_MAIL_MESSAGES_LIST_EMAILS', { account_id: ACC, limit: 25, status: 'unread' });
  const arr = r.data?.data ?? [];
  return {
    no_leidos: (Array.isArray(arr) ? arr : []).map((m) => ({
      de: m.fromAddress,
      asunto: String(m.subject || '').replace(/&#39;/g, "'"),
      fecha: new Date(Number(m.receivedTime)).toISOString(),
    })),
  };
}

async function supabase() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const abiertas = await json(
    `${url}/rest/v1/system_feedback?estado=neq.resuelta&select=estado,categoria,content,created_at&order=created_at.desc`,
    { headers: H },
  );
  return {
    sugerencias_abiertas: abiertas.length,
    detalle: abiertas.slice(0, 10).map((s) => ({
      estado: s.estado,
      texto: String(s.content || '').replace(/\s+/g, ' ').slice(0, 160),
      fecha: iso(s.created_at),
    })),
  };
}

async function mailerlite() {
  const H = { Authorization: `Bearer ${env.MAILERLITE_API_KEY}`, Accept: 'application/json' };
  const g = await json('https://connect.mailerlite.com/api/groups?limit=25', { headers: H });
  return {
    grupos: (g.data || []).map((x) => ({ nombre: x.name, activos: x.active_count })),
  };
}

async function n8n() {
  const base = String(env.N8N_WEBHOOK_URL || '').replace(/\/webhook.*$/, '');
  if (!base) throw new Error('sin N8N_WEBHOOK_URL');
  const j = await json(`${base}/api/v1/executions?status=error&limit=10`, {
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY },
  });
  return {
    fallidas: (j.data || []).map((e) => ({
      flujo: e.workflowData?.name ?? e.workflowId,
      cuando: e.startedAt,
    })),
  };
}

async function github() {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('gh', ['run', 'list', '--limit', '8', '--json', 'name,status,conclusion,createdAt'], {
    cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const runs = JSON.parse(out);
  return { fallidos: runs.filter((r) => r.conclusion === 'failure').map((r) => ({ nombre: r.name, cuando: r.createdAt })) };
}

async function buffer() {
  if (!env.BUFFER_API_KEY) throw new Error('sin BUFFER_API_KEY');
  // Via el CLI oficial (@bufferapp/cli), que se genera del schema GraphQL.
  // Escribir la query a mano es lo que fallaba antes: el token siempre estuvo bien.
  const { execFileSync } = await import('node:child_process');
  // Se invoca el .mjs con node: en Windows, Node bloquea ejecutar el .cmd del bin
  // global (EINVAL), y usar shell:true para saltearlo abriria inyeccion.
  const CLI = path.join(process.env.APPDATA || '', 'npm/node_modules/@bufferapp/cli/built/index.mjs');
  if (!fs.existsSync(CLI)) throw new Error('falta @bufferapp/cli (npm i -g @bufferapp/cli)');
  const correr = (args) => {
    const out = execFileSync(process.execPath, [CLI, ...args, '--output', 'json', '--quiet'],
      { encoding: 'utf8', env: { ...process.env, BUFFER_API_KEY: env.BUFFER_API_KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out);
  };
  const cuenta = correr(['account']);
  const org = cuenta.organizations?.[0]?.id;
  const canales = correr(['channels', 'list']);
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z';
  const hasta = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const met = correr(['aggregatedPostMetrics', '--organization-id', org,
    '--start-date-time', desde, '--end-date-time', hasta]);
  const m = Object.fromEntries((met.metrics || []).map((x) => [x.type, x.value]));
  return {
    canales: canales.map((c) => ({ servicio: c.service, nombre: c.name, id: c.id })),
    ultimos_30_dias: {
      posts: m.postCount, impresiones: m.impressions, alcance: m.reach,
      reacciones: m.reactions, comentarios: m.comments,
      compartidos: m.shares, tasa_engagement: m.engagementRate,
    },
  };
}

// ---------------------------------------------------------------------- main

const FUENTES = [
  ['clickup', clickup],
  ['zoho', zoho],
  ['supabase', supabase],
  ['mailerlite', mailerlite],
  ['n8n', n8n],
  ['github', github],
  ['buffer', buffer],
];

const resultados = await Promise.all(FUENTES.map(([n, f]) => fuente(n, f)));

const parte = {
  generado: new Date().toISOString(),
  fecha: iso(hoy),
  fuentes_ok: resultados.filter((r) => r.ok).map((r) => r.nombre),
  fuentes_caidas: resultados.filter((r) => !r.ok).map((r) => ({ nombre: r.nombre, error: r.error })),
  datos: Object.fromEntries(resultados.filter((r) => r.ok).map((r) => [r.nombre, r.datos])),
};

fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, `${parte.fecha}.json`), JSON.stringify(parte, null, 2));

// resumen legible por consola
console.log(`PARTE DEL ${parte.fecha}`);
console.log(`ok: ${parte.fuentes_ok.join(', ') || 'ninguna'}`);
if (parte.fuentes_caidas.length)
  console.log(`CAIDAS: ${parte.fuentes_caidas.map((f) => `${f.nombre} (${f.error})`).join(' | ')}`);
for (const r of resultados.filter((r) => r.ok)) {
  const d = r.datos;
  if (r.nombre === 'clickup')
    console.log(`  clickup   -> ${d.total_abiertas} abiertas | hoy: ${d.hoy.length} | vencidas: ${d.vencidas.length} | postergadas 3+: ${d.postergadas_3_o_mas.length}`);
  if (r.nombre === 'zoho') console.log(`  zoho      -> ${d.no_leidos.length} sin leer`);
  if (r.nombre === 'supabase') console.log(`  supabase  -> ${d.sugerencias_abiertas} sugerencias abiertas`);
  if (r.nombre === 'n8n') console.log(`  n8n       -> ${d.fallidas.length} ejecuciones con error`);
  if (r.nombre === 'github') console.log(`  github    -> ${d.fallidos.length} workflows fallidos`);
  if (r.nombre === 'mailerlite') console.log(`  mailerlite-> ${d.grupos.length} grupos`);
  if (r.nombre === "buffer") console.log(`  buffer    -> ${d.canales.length} canales | 30d: ${d.ultimos_30_dias.posts} posts, ${d.ultimos_30_dias.impresiones} impresiones, ${d.ultimos_30_dias.tasa_engagement}% engagement`);
}
console.log(`\nparte guardado en estado/${parte.fecha}.json`);
