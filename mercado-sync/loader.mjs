#!/usr/bin/env node
// ============================================================================
// mercado-sync/loader.mjs — el acomodador de góndolas de mercado_avisos
//
// Apify trae la mercadería (dataset del actor memo23/zonaprop-scraper);
// este script la revisa, descarta lo podrido a cuarentena y la acomoda:
//   dataset JSON → mapeo 344→84 campos → filtro de calidad → upsert
//   + histórico de precios + publicadores + emprendimientos + auditoría.
//
// Uso:
//   node mercado-sync/loader.mjs --file <dataset.json> --zona <slug> \
//        [--esperados N] [--tipo refresco|descubrimiento] [--dry]
//
// Credenciales: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del
// entorno, o de un .env indicado con ENV_FILE. Escribe con service_role
// (la RLS de mercado_* no da escritura a nadie más).
//
// Decisiones (ver artifact "El espejo del mercado", 29-ago-2026):
//  * Las fechas se leen de publicationListCard (publicationDetail viene null).
//  * Las fotos, de media.pictureUrlsDetailOnly (pictureUrls duplica).
//  * La descripción, de description (list_description viene cortada a 120).
//  * El publicador, de publisher.* (list_publisher_name viene null).
//  * Avisos con rangos ("1 a 2 amb.") van a mercado_emprendimientos.
//  * NADA se borra ni se marca caído acá: eso es de la verificación (C).
//  * telefono/h3/embedding quedan null: los completan procesos aparte.
// ============================================================================

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------- args y entorno --------------------------------------------------

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? (process.argv[i + 1] ?? true) : def;
};
const FILE = arg('file');
const ZONA = arg('zona', 'desconocida');
const ESPERADOS = parseInt(arg('esperados', '0')) || null;
const TIPO = arg('tipo', 'refresco');
const DRY = process.argv.includes('--dry');

if (!FILE) { console.error('Falta --file <dataset.json>'); process.exit(1); }

function cargarEnv() {
  const envFile = process.env.ENV_FILE;
  if (envFile) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']\r?$/g, '').replace(/\r$/, '');
    }
  }
}
cargarEnv();
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (o ENV_FILE)'); process.exit(1); }

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=minimal',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
};

// ---------- centroides para la regla geo (extensible por zona) --------------
// mercado_barrios (Pulso) no tiene coordenadas; van acá hasta que las tenga.

const CENTROIDES = {
  'belgrano':      { lat: -34.5620, lng: -58.4560, km: 3.0 },
  'nunez':         { lat: -34.5450, lng: -58.4630, km: 2.5 },
  'colegiales':    { lat: -34.5730, lng: -58.4490, km: 2.0 },
  'coghlan':       { lat: -34.5610, lng: -58.4740, km: 1.5 },
  'villa-urquiza': { lat: -34.5700, lng: -58.4910, km: 2.5 },
  'saavedra':      { lat: -34.5510, lng: -58.4880, km: 2.5 },
  'palermo':       { lat: -34.5780, lng: -58.4260, km: 3.5 },
};
const distKm = (a, b, c, d) => {
  const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r * Math.cos((a + c) / 2 * r);
  return R * Math.sqrt(x * x + y * y);
};

// ---------- helpers de mapeo ------------------------------------------------

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const soloNum = (v) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

// mainFeatures: [{id:'CFT101', value:'35 m² cub.'}, {id:'1000029', value:'SO'}…]
function featuresPorId(item) {
  const out = {};
  for (const f of item.mainFeatures || []) out[f.id] = f.value;
  for (const f of item.featuresListCardSimplified || []) {
    if (f.featureId && out[f.featureId] === undefined) out[f.featureId] = f.value;
    if (f.featureId === 'CFT6') out.CFT6 = f.value;                 // expensas: solo está acá
    if (f.featureId === 'CFT4' && out.CFT4 === undefined) out.CFT4 = f.value;
  }
  return out;
}

function parsearStats(txt) {
  // "Publicado hace 28 días | 1099 visualizaciones" / "Publicado hoy | 14 visualizaciones"
  if (!txt) return { dias: null, vistas: null };
  const dias = /hace\s+(\d+)\s+d/i.exec(txt)?.[1] ?? (/hoy/i.test(txt) ? '0' : null);
  const vistas = /(\d+)\s+visualizacion/i.exec(txt)?.[1] ?? null;
  return { dias: dias == null ? null : parseInt(dias), vistas: vistas == null ? null : parseInt(vistas) };
}

function partirBarrio(neighborhood) {
  // "Belgrano C, Belgrano, Capital Federal" → sub_barrio/barrio/ciudad (de menor a mayor)
  const partes = (neighborhood || '').split(',').map(s => s.trim()).filter(Boolean);
  if (partes.length >= 3) return { sub: partes[0], barrio: partes[1], ciudad: partes[2] };
  if (partes.length === 2) return { sub: null, barrio: partes[0], ciudad: partes[1] };
  return { sub: null, barrio: partes[0] || null, ciudad: null };
}

const esRango = (v) => /\d\s+a\s+\d/.test(String(v ?? ''));

// ---------- mapeo item → fila -----------------------------------------------

function mapear(item, zona) {
  const f = featuresPorId(item);
  const stats = parsearStats(item.publicationStatistics);
  const loc = partirBarrio(get(item, 'location.neighborhood'));
  const desc = item.description || null;                            // NUNCA list_description
  const pills = (get(item, 'detailExtraTopLevel.pills') || []).map(p => p.id);
  const amenities = (item.featuresDetailGroups || []).flatMap(g => g.values || []);
  const tipoLabel = get(item, 'labels.realEstateType') || item.realEstateType || null;
  const esResidencial = ['Departamento', 'Casa', 'PH'].includes(tipoLabel);

  const fila = {
    id: parseInt(item.postingId),
    es_dueno_directo: get(item, 'publisher.by_owner') === true,
    portal: 'zonaprop',
    url_publica: item.propertyUrl || item.list_public_url,
    url_api: item.apiDetailUrl || null,
    slug: (item.propertyUrl || '').split('/').pop()?.replace(/\.html$/, '') || null,
    codigo_anunciante: item.list_internal_code || null,
    crm_detectado: /XINTEL/i.test(desc || '') ? 'xintel' : (/\bTOKKO\b/i.test(desc || '') ? 'tokko' : null),

    publicado_desde: get(item, 'publicationListCard.begin_date') || item.list_publication_begin || null,
    primera_publicacion: get(item, 'publicationListCard.first_date_online') || null,
    plan_publicacion: get(item, 'publicationDetail.publication_type') || get(item, 'publicationMerged.publication_type') || null,
    dias_publicado: stats.dias,
    visualizaciones: stats.vistas,

    operacion: 'venta',
    tipo: tipoLabel,
    subtipo: get(item, 'labels.realEstateSubtype') || null,
    tipo_id: soloNum(get(item, 'ids.real_estate_type_id')),
    es_emprendimiento: get(item, 'ids.posting_type_code') === 'DEVELOPMENT',
    en_construccion: /en\s+construcci/i.test((item.title || '') + ' ' + (desc || '')),

    precio: item.list_price_amount ?? null,
    moneda: item.list_price_currency || null,
    precio_usd: item.list_price_currency === 'USD' ? (item.list_price_amount ?? null) : null,
    expensas: num(/([\d.,]+)/.exec(String(f.CFT6 ?? ''))?.[1]),
    apto_credito: pills.includes('CREDIT'),
    acepta_mascotas: pills.includes('ADMITS_PETS'),
    precio_bajo_pct: soloNum(get(item, 'listSummary.price_operation_types.0.low_price_percentage')),

    superficie_total_m2: soloNum(/([\d.,]+)\s*m/.exec(String(f.CFT100 ?? get(item, 'units.totalAreaRange') ?? ''))?.[1]?.replace(',', '.')),
    superficie_cubierta_m2: soloNum(/([\d.,]+)\s*m/.exec(String(f.CFT101 ?? ''))?.[1]?.replace(',', '.')),
    superficie_semicubierta_m2: soloNum(f['2000203']),
    ambientes: soloNum(/(\d+)/.exec(String(f.CFT1 ?? get(item, 'units.roomsRange') ?? ''))?.[1]),
    dormitorios: soloNum(/(\d+)/.exec(String(f.CFT2 ?? ''))?.[1]),
    banos: soloNum(/(\d+)/.exec(String(f.CFT3 ?? get(item, 'units.bathroomRange') ?? ''))?.[1]),
    cocheras: soloNum(/(\d+)/.exec(String(f.CFT4 ?? get(item, 'units.garagesRange') ?? '0'))?.[1]) ?? 0,
    antiguedad_anios: soloNum(/(\d+)/.exec(String(f.CFT5 ?? ''))?.[1]),
    piso: soloNum(/(?:^|\s)piso\s+(\d{1,2})\b|(\d{1,2})(?:er|do|to|mo|vo|no)?\s*piso\b/i.exec((item.title || '') + ' ' + (desc || ''))?.slice(1).find(Boolean)),
    pisos_edificio: soloNum(f['1000015']),
    disposicion: ['Frente', 'Contrafrente', 'Lateral', 'Interno'].includes(f['1000019']) ? f['1000019'].toLowerCase() : null,
    orientacion: /^[NSEO]{1,2}$/.test(String(f['1000029'] ?? '')) ? f['1000029'] : null,

    direccion: get(item, 'location.streetAddress') || null,
    direccion_exacta: get(item, 'location.visibility') === 'EXACT',
    barrio: loc.barrio,
    sub_barrio: loc.sub,
    ciudad: loc.ciudad,
    provincia: loc.ciudad === 'Capital Federal' ? 'CABA' : 'Buenos Aires',
    region: loc.ciudad === 'Capital Federal' ? 'CABA' : null,
    pais: 'AR',
    lat: get(item, 'location.latitude') ?? null,
    lng: get(item, 'location.longitude') ?? null,
    url_mapa: get(item, 'location.mapsUrl') || null,

    titulo: item.title || item.list_title || null,
    descripcion: desc,
    amenities,
    caracteristicas: item.featuresListCardSimplified || [],
    apto_profesional: f['1000004'] !== undefined || /apto\s+prof/i.test((item.title || '') + ' ' + (desc || '')),
    luminoso: f['1000027'] !== undefined,

    fotos: get(item, 'media.pictureUrlsDetailOnly') || [],
    foto_portada: item.list_first_image_url || null,
    planos: get(item, 'media.floorPlansUrls') || [],
    videos: get(item, 'media.videosUrls') || [],
    tours: get(item, 'media.toursUrls') || [],

    publicador_id: soloNum(get(item, 'publisher.id')),
    publicador_nombre: get(item, 'publisher.name') || null,       // list_publisher_name viene null
    publicador_premier: get(item, 'publisher.premier') === true,
    publicador_puntaje: soloNum(get(item, 'publisher.feedback_statistics.average')),
    publicador_resenas: soloNum(get(item, 'publisher.feedback_statistics.responded_count')),
    tiene_whatsapp: item.hasWhatsapp === true,

    payload: item.requestResponses || null,
  };

  // hash de lo que importa: si no cambió, el upsert solo toca visto_ultima_vez
  fila.hash_contenido = createHash('md5').update(JSON.stringify([
    fila.precio, fila.moneda, fila.expensas, fila.titulo, fila.descripcion,
    fila.superficie_total_m2, fila.ambientes, fila.fotos, fila.publicador_id,
    fila.publicado_desde, fila.plan_publicacion,
  ])).digest('hex');

  return fila;
}

// ---------- filtro de calidad (calibrado 29-ago: 0 falsos positivos) --------

function evaluarCalidad(fila, zona) {
  const motivos = [];
  const esResidencial = ['Departamento', 'Casa', 'PH'].includes(fila.tipo);
  const ppm2 = fila.precio > 0 && fila.superficie_total_m2 > 0 ? fila.precio / fila.superficie_total_m2 : null;

  if (esResidencial && fila.moneda === 'USD') {
    if (fila.precio != null && fila.precio < 15000) motivos.push('precio_sospechoso');
    if (ppm2 != null && (ppm2 < 200 || ppm2 > 15000)) motivos.push('precio_m2_fuera');
  }
  if (fila.lat == null || fila.lng == null || fila.lat < -56 || fila.lat > -21 || fila.lng < -74 || fila.lng > -53) {
    motivos.push('geo_invalida');
  } else {
    const c = CENTROIDES[zona];
    if (c && distKm(c.lat, c.lng, fila.lat, fila.lng) > c.km) motivos.push('geo_fuera_de_zona');
  }
  if (esResidencial) {
    if (fila.superficie_total_m2 != null && fila.superficie_total_m2 < 12) motivos.push('superficie_imposible');
    if (fila.superficie_total_m2 != null && fila.superficie_cubierta_m2 != null
        && fila.superficie_total_m2 < fila.superficie_cubierta_m2) motivos.push('total_menor_que_cubierta');
    if (fila.superficie_total_m2 && fila.ambientes && fila.superficie_total_m2 / fila.ambientes < 9) motivos.push('m2_por_ambiente');
    if (fila.ambientes == null && fila.dormitorios == null) motivos.push('sin_ambientes');
  }
  const t = (fila.titulo || '').toLowerCase();
  if (/\balquiler\b/.test(t) && fila.operacion === 'venta') motivos.push('operacion_coherente');
  const mt = /(\d)\s*amb|monoambiente/.exec(t);
  const tamb = mt ? (mt[0].includes('mono') ? 1 : parseInt(mt[1])) : null;
  if (tamb && fila.ambientes && tamb !== fila.ambientes) motivos.push('conflicto_titulo');

  const cuarentena = motivos.some(m => !['conflicto_titulo'].includes(m));
  return { calidad: motivos.length === 0 ? 'ok' : (cuarentena ? 'cuarentena' : 'conflicto'), motivos };
}

function completitud(fila) {
  const claves = ['precio', 'superficie_total_m2', 'ambientes', 'banos', 'lat', 'barrio',
    'antiguedad_anios', 'descripcion', 'foto_portada', 'publicador_nombre', 'publicado_desde', 'expensas'];
  const con = claves.filter(k => fila[k] != null && fila[k] !== '').length;
  return Math.round(con / claves.length * 100);
}

// ---------- main ------------------------------------------------------------

async function main() {
  const raw = JSON.parse(readFileSync(FILE, 'utf8'));
  const items = Array.isArray(raw) ? raw : raw.items;               // acepta dataset pelado o respuesta del MCP
  console.log(`[loader] ${items.length} items de ${FILE} · zona=${ZONA} · tipo=${TIPO}${DRY ? ' · DRY RUN' : ''}`);

  const inicio = new Date().toISOString();
  const filas = [], emprendimientos = [], publicadores = new Map();
  let errores = 0;

  for (const item of items) {
    try {
      // Rangos ("1 a 2 amb." / "20 a 67 m2") o posting DEVELOPMENT → tabla aparte
      const rango = esRango(get(item, 'units.roomsRange')) || esRango(get(item, 'units.totalAreaRange'))
        || get(item, 'ids.posting_type_code') === 'DEVELOPMENT';
      if (rango) {
        emprendimientos.push({
          id: parseInt(item.postingId),
          url_publica: item.propertyUrl || item.list_public_url,
          titulo: item.title || null, descripcion: item.description || null,
          barrio: partirBarrio(get(item, 'location.neighborhood')).barrio,
          sub_barrio: partirBarrio(get(item, 'location.neighborhood')).sub,
          lat: get(item, 'location.latitude'), lng: get(item, 'location.longitude'),
          precio_desde: item.list_price_amount ?? null, moneda: item.list_price_currency || null,
          ambientes_rango: get(item, 'units.roomsRange'), superficie_rango: get(item, 'units.totalAreaRange'),
          unidades: soloNum(get(item, 'units.units_quantity')),
          publicador_id: soloNum(get(item, 'publisher.id')),
          payload: item.requestResponses || null,
          visto_ultima_vez: new Date().toISOString(),
        });
        continue;
      }

      const fila = mapear(item, ZONA);
      const q = evaluarCalidad(fila, ZONA);
      fila.calidad = q.calidad;
      fila.calidad_motivos = q.motivos;
      fila.completitud = completitud(fila);
      fila.precio_inicial = fila.precio;                            // solo cuenta en el INSERT (ver upsert)
      fila.visto_ultima_vez = new Date().toISOString();
      filas.push(fila);

      if (fila.publicador_id) publicadores.set(fila.publicador_id, {
        id: fila.publicador_id, nombre: fila.publicador_nombre,
        es_dueno: fila.es_dueno_directo, premier: fila.publicador_premier,
        puntaje: fila.publicador_puntaje, resenas: fila.publicador_resenas,
        actualizado_en: new Date().toISOString(),
      });
    } catch (e) { errores++; console.error(`  item ${item.postingId}: ${e.message}`); }
  }

  // El actor puede repetir un aviso dentro del mismo dataset (SERP + detalle):
  // deduplicar por id antes de insertar, quedándonos con la última versión.
  const filasUnicas = [...new Map(filas.map(f => [f.id, f])).values()];
  filas.length = 0; filas.push(...filasUnicas);
  const empUnicos = [...new Map(emprendimientos.map(e => [e.id, e])).values()];
  emprendimientos.length = 0; emprendimientos.push(...empUnicos);

  const resumen = {
    ok: filas.filter(x => x.calidad === 'ok').length,
    cuarentena: filas.filter(x => x.calidad === 'cuarentena').length,
    conflicto: filas.filter(x => x.calidad === 'conflicto').length,
    emprendimientos: emprendimientos.length,
    duenos_directos: filas.filter(x => x.es_dueno_directo).length,
  };
  console.log('[loader] mapeo:', JSON.stringify(resumen));
  for (const x of filas.filter(x => x.calidad !== 'ok'))
    console.log(`  ${x.calidad}: ${x.id} [${x.calidad_motivos}] "${(x.titulo || '').slice(0, 50)}"`);

  if (DRY) { console.log('[loader] DRY RUN: nada escrito.'); return; }

  // --- upsert con lógica de cambios ---
  const ids = filas.map(x => x.id);
  const existentes = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100).join(',');
    for (const r of await sb(`mercado_avisos?id=in.(${lote})&select=id,hash_contenido,precio,es_dueno_directo`, { prefer: 'return=representation' }) || [])
      existentes.set(r.id, r);
  }

  let insertados = 0, actualizados = 0, sinCambio = 0, cambiosPrecio = 0;
  const nuevos = filas.filter(x => !existentes.has(x.id));
  for (let i = 0; i < nuevos.length; i += 50) {
    await sb('mercado_avisos', { method: 'POST', body: JSON.stringify(nuevos.slice(i, i + 50)) });
    insertados += Math.min(50, nuevos.length - i);
  }
  // histórico inicial de los nuevos
  const preciosNuevos = nuevos.filter(x => x.precio != null).map(x => ({ aviso_id: x.id, precio: x.precio, moneda: x.moneda, expensas: x.expensas }));
  for (let i = 0; i < preciosNuevos.length; i += 100)
    await sb('mercado_precios', { method: 'POST', body: JSON.stringify(preciosNuevos.slice(i, i + 100)) });

  for (const fila of filas.filter(x => existentes.has(x.id))) {
    const prev = existentes.get(fila.id);
    if (prev.hash_contenido === fila.hash_contenido) {
      await sb(`mercado_avisos?id=eq.${fila.id}`, { method: 'PATCH', body: JSON.stringify({ visto_ultima_vez: fila.visto_ultima_vez, barridos_sin_ver: 0, estado: 'activo' }) });
      sinCambio++;
      continue;
    }
    const { precio_inicial, ...cambios } = fila;                    // precio_inicial jamás se pisa
    await sb(`mercado_avisos?id=eq.${fila.id}`, { method: 'PATCH', body: JSON.stringify({ ...cambios, barridos_sin_ver: 0, estado: 'activo' }) });
    actualizados++;
    if (prev.precio != null && fila.precio != null && Number(prev.precio) !== Number(fila.precio)) {
      await sb('mercado_precios', { method: 'POST', body: JSON.stringify([{ aviso_id: fila.id, precio: fila.precio, moneda: fila.moneda, expensas: fila.expensas, variacion_pct: Math.round((fila.precio - prev.precio) / prev.precio * 10000) / 100 }]) });
      cambiosPrecio++;
    }
  }

  // publicadores y emprendimientos: upsert simple por PK
  const pubs = [...publicadores.values()];
  for (let i = 0; i < pubs.length; i += 100)
    await sb('mercado_publicadores?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(pubs.slice(i, i + 100)) });
  for (let i = 0; i < emprendimientos.length; i += 50)
    await sb('mercado_emprendimientos?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(emprendimientos.slice(i, i + 50)) });

  // auditoría: si no quedó registrada, no pasó
  const obtenidos = filas.length + emprendimientos.length;
  const completo = ESPERADOS ? obtenidos >= ESPERADOS * 0.95 && errores === 0 : false;
  await sb('mercado_barridos', {
    method: 'POST',
    body: JSON.stringify([{
      tipo: TIPO, zona: ZONA, inicio, fin: new Date().toISOString(),
      esperados: ESPERADOS, obtenidos, paginas: parseInt(arg('paginas', '0')) || 0, errores,
      completo, habilita_bajas: false,                              // las bajas: solo la verificación C
      costo_usd: Math.round(obtenidos * 0.1) / 100,
      notas: `loader v1 · insertados=${insertados} actualizados=${actualizados} sin_cambio=${sinCambio} precios=${cambiosPrecio}`,
    }]),
  });

  console.log(`[loader] listo: ${insertados} insertados · ${actualizados} actualizados · ${sinCambio} sin cambio · ${cambiosPrecio} cambios de precio · ${emprendimientos.length} emprendimientos · ${pubs.length} publicadores`);
}

main().catch(e => { console.error('[loader] FATAL:', e.message); process.exit(1); });
