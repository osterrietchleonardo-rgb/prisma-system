// ============================================================================
// Condensador de descripciones (Roomix) — texto completo → ficha prolija ≤500
// ============================================================================
// POR QUÉ EXISTE
//   Roomix publica en su JSON-LD la descripción CORTADA a 500 caracteres, y corta a
//   mitad de palabra: "...- 2 dormitorios - El pri". Ese texto es el que se veía en la
//   ficha compartida y en el ACM (queja de un asesor, 27/07/2026). La descripción
//   COMPLETA sí está en el DOM de la ficha de Roomix (div.whitespace-pre-wrap).
//
//   Decisión: seguimos guardando 500 caracteres, pero en vez de un corte a mitad de
//   palabra guardamos un resumen ORDENADO armado con el texto real completo.
//
// CÓMO CONDENSA (100% determinista, sin IA: mismo texto de entrada → misma salida)
//   1. Limpia: espacios raros, viñetas pegadas ("flotantes- Ventanas"), líneas repetidas.
//   2. Saca la letra chica: matrícula/CUCICBA, leyes, "medidas aproximadas", teléfonos,
//      mails, links y datos de contacto de la inmobiliaria publicante (no queremos el
//      contacto de otra agencia dentro de la ficha de nuestro asesor).
//   3. Detecta las secciones del aviso (UBICACION / METRAJE / DEPARTAMENTO / EDIFICIO…)
//      y las normaliza a 4 etiquetas: Superficie · Interior · Ubicación · Edificio.
//   4. Arma el texto hasta 500: primero el titular, después 2 ítems de cada sección
//      (así ninguna queda afuera) y con lo que sobra completa por prioridad.
//   5. Nunca corta a mitad de palabra: si un ítem no entra, no entra el ítem entero.
//
// NOTA: no se tocan las MAYÚSCULAS del aviso. Se probó normalizarlas y arruina los
// nombres propios ("AV. DEL LIBERTADOR Y REPÚBLICA DE LA INDIA" → "av. del libertador
// y república de la india"). Se respeta el texto del anunciante; se ordena la ESTRUCTURA.
// ============================================================================

export const MAX_DESCRIPCION = 500;

// ─── Ruido: frases que no aportan al comprador y se descartan enteras ────────
const RUIDO = [
  // Legales / matrícula / colegios profesionales
  /matr[ií]cula|\bmat\.?\s*n?[°º]?\s*\d|cucicba|cmcpsi|cmcsi|cpmal|\bcpi\s*n?[°º]?\.?\s*\d|colegio (profesional|[úu]nico)|corredor(a)? (p[úu]blico|inmobiliario)|martiller[oa]/i,
  /ley\s*(n[°º]?\.?\s*)?\d|ley nacional|en cumplimiento de la ley|decreto\s*\d/i,
  /intermediaci[óo]n y la conclusi[óo]n|ser[áa]n llevadas exclusivamente|profesional responsable/i,
  /no constituye (una )?oferta|car[áa]cter informativo|sin previo aviso|sujet[oa]s? a (cambios|modificaci)/i,
  /medidas (son )?aproximadas|fotos? (son )?ilustrativas?|im[áa]genes ilustrativas|a t[íi]tulo orientativo/i,
  /no es accesible para personas con movilidad reducida/i,
  /toda la informaci[óo]n deber[áa] ser verificada|documentaci[óo]n respaldatoria|registral|surgir[áa]n de la documentaci[óo]n/i,
  /disclaimer|aviso de responsabilidad|art[íi]culo\s*\d|\bart\.\s*\d/i,
  /corretaje|avisos publicados por corredores|promuevan operaciones inmobiliarias|deber[áa]n contener informaci[óo]n/i,
  /\bcoti\b|venta sujeta a la obtenci[óo]n|reserva ad referend[uú]m/i,
  // Promos de financiación/servicios de la inmobiliaria publicante (RE/MAX Lendar, etc.)
  /lendar|simulaci[óo]n de tu cuota|solicitar un pr[ée]stamo|exclusivo para clientes|hac[ée] la simulaci[óo]n/i,
  /valores? sujetos?|consultar disponibilidad y valores|precios sujetos/i,
  // Contacto / firma / marketing de la inmobiliaria publicante
  /\b(whats?app|wsp|tel[eé]fono|cel(ular)?\.?|contactanos|contact[áa]|escribinos|consultanos|consult[áa]|coordin[áa]|solicit[áa] (tu )?visita|agend[áa])\b/i,
  /^\s*(contacto|contactos|datos de contacto|corredor(a)? responsable|responsable|asesor(a)?( comercial| inmobiliari[oa])?)\s*[:\-–]/i,
  /\b(comercializa|publicado por|a trav[ée]s de inmomap|una publicaci[óo]n de)\b/i,
  /https?:\/\/|www\.|@[a-z0-9_.-]+\.[a-z]{2,}|\bcod(igo)?\.?\s*(interno|ref)/i,
  /\+?54\s?9?\s?\d{2,4}[\s-]?\d{4}[\s-]?\d{4}|\b\d{4}-\d{4}\b/,
  /\bref\.?\s*[:#]/i,
];

// ─── Encabezados del aviso → etiqueta normalizada de la ficha ────────────────
const SECCIONES = [
  { etiqueta: 'Superficie', prioridad: 1, re: /^(metraje|superficie|medidas|m2|mts2|metros)\b/i },
  { etiqueta: 'Interior',   prioridad: 2, re: /^(departamento|depto|casa|ph|unidad|propiedad|interior|distribuci[óo]n|ambientes|detalle|caracter[íi]sticas|comodidades|el inmueble|la propiedad|planta)\b/i },
  { etiqueta: 'Ubicación',  prioridad: 3, re: /^(ubicaci[óo]n|zona|barrio|transporte|accesos?|cercan[íi]as?|entorno)\b/i },
  { etiqueta: 'Edificio',   prioridad: 4, re: /^(edificio|amenities|servicios|expensas|complejo|condominio|country|barrio cerrado|seguridad)\b/i },
  // Secciones que se descartan enteras: el precio ya es un campo propio de la ficha, y los
  // datos de la inmobiliaria publicante no van en la ficha de nuestro asesor.
  { etiqueta: null,         prioridad: 9, re: /^(precio|valor|forma de pago|financiaci[óo]n)\b/i },
  { etiqueta: null,         prioridad: 9, re: /^(contacto|contactos|datos de contacto|corredor|responsable|asesor|legales?|aviso legal)\b/i },
];

const PRIORIDAD_PROSA = 2.5; // el cuerpo del aviso pesa tanto como las secciones fuertes

/** Normaliza espacios y separa viñetas/oraciones pegadas (avisos en un solo renglón). */
function norm(s) {
  return (s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    // "contrafrente.Toilette" → "contrafrente. Toilette" (sin romper siglas tipo "D.B.")
    .replace(/([.!?])([A-ZÁÉÍÓÚÑ][a-záéíóúüñ])/g, '$1 $2')
    // "Pisos flotantes- Ventanas de PVC" → viñeta en su propio renglón (el guion va pegado)
    .replace(/([.!?:a-záéíóúüñ0-9])[-–—]\s+(?=[A-Za-zÁÉÍÓÚÑáéíóúüñ])/g, '$1\n- ');
}

/** Quita viñetas, numeración y puntuación suelta del inicio/fin de un ítem. */
function limpiarItem(s) {
  return s
    .replace(/^[\s\-–—•*·+>»~=_.]+/, '')
    .replace(/[\s\-–—•*·+=_]+$/, '')
    .replace(/\s*[.;,]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Primera letra en mayúscula (sin tocar el resto). */
const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const esRuido = (t) => RUIDO.some((re) => re.test(t));

/** ¿La línea es un encabezado de sección? (corta, en mayúsculas o terminada en ":") */
function comoEncabezado(linea) {
  const l = limpiarItem(linea).replace(/:$/, '').trim();
  if (!l || l.length > 34) return null;
  const letras = l.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  if (!letras) return null;
  const esMayus = letras === letras.toUpperCase();
  if (!esMayus && !linea.trim().endsWith(':')) return null;
  // Firma de la inmobiliaria en iniciales ("AB - LM", "D.B.", "M/G"): sección a descartar.
  if (/^[A-ZÁÉÍÓÚÑ]{1,3}([\s.\-/]+[A-ZÁÉÍÓÚÑ]{1,3})*[.]?$/.test(l)) return { etiqueta: null, prioridad: 9 };
  const hit = SECCIONES.find((s) => s.re.test(l));
  if (hit) return { etiqueta: hit.etiqueta, prioridad: hit.prioridad };
  // Encabezado propio del aviso que no está en el mapa: se conserva con su nombre.
  return { etiqueta: capitalizar(l.toLowerCase()), prioridad: 5 };
}

// Abreviaturas frecuentes en avisos: ese punto NO termina la oración ("Av. Córdoba").
const ABREVIATURAS = new Set([
  'av', 'avda', 'bv', 'bvd', 'blvd', 'gral', 'sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'ing', 'arq',
  'esq', 'dpto', 'depto', 'dept', 'sto', 'sta', 'no', 'nro', 'nº', 'n°', 'km', 'mts', 'mt', 'm2',
  'aprox', 'etc', 'ej', 'p', 'c', 's', 'u$s', 'us', 'cta', 'coch', 'amb', 'hab', 'ref', 'piso',
]);

/** Trocea un texto en oraciones, respetando abreviaturas e iniciales. */
function oraciones(texto) {
  const partes = [];
  let desde = 0;
  const re = /([.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const previa = texto.slice(desde, m.index);
    const ultima = (previa.match(/([\wÁÉÍÓÚÜÑáéíóúüñ$°º]+)$/) || [])[1] || '';
    if (ABREVIATURAS.has(ultima.toLowerCase()) || ultima.length <= 1) continue;
    partes.push(texto.slice(desde, m.index + 1));
    desde = re.lastIndex;
  }
  partes.push(texto.slice(desde));
  return partes.map(limpiarItem).filter(Boolean);
}

/**
 * Descripción completa del aviso → resumen ordenado de, como máximo, `max` caracteres.
 * Determinista: sin IA, sin red. Nunca corta a mitad de palabra.
 */
export function condensarDescripcion(raw, max = MAX_DESCRIPCION) {
  const texto = norm(raw).trim();
  if (!texto) return '';

  // ── 1. Unidades de texto: líneas y, si vienen largas, sus oraciones ──
  //    (un aviso escrito en un solo renglón traía una matrícula al final y, filtrando por
  //     línea entera, se descartaba TODA la descripción — visto en una muestra real).
  const unidades = [];
  for (const linea of texto.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (linea.length > 200) unidades.push(...oraciones(linea));
    else unidades.push(linea);
  }

  // ── 2. Agrupar por sección, salteando ruido y secciones descartadas ──
  let titular = '';
  const bloques = []; // { etiqueta, prioridad, orden, items[] }
  let actual = null;
  let descartando = false;
  let orden = 0;
  const prosa = { etiqueta: null, prioridad: PRIORIDAD_PROSA, orden: 0, items: [] };

  for (const unidad of unidades) {
    const enc = comoEncabezado(unidad);
    if (enc) {
      // Un encabezado que ES ruido (p. ej. "CSI 6588/CPI 5839") también abre sección descartada:
      // sin esto entraba como sección propia y se llevaba la matrícula a la ficha.
      descartando = enc.etiqueta === null || esRuido(unidad); // PRECIO / CONTACTO / legales
      actual = null;
      if (descartando) continue;
      actual = bloques.find((b) => b.etiqueta === enc.etiqueta);
      if (!actual) { actual = { etiqueta: enc.etiqueta, prioridad: enc.prioridad, orden: orden++, items: [] }; bloques.push(actual); }
      continue;
    }

    // Dentro de una sección descartada se tiran los renglones cortos, pero un párrafo
    // largo corta el descarte: sin esto, un "CONTACTO D.B." arriba del aviso se comía
    // toda la descripción que venía después (visto en una muestra real).
    if (descartando) {
      if (unidad.length < 60 || esRuido(unidad)) continue;
      descartando = false;
      actual = null;
    }
    if (esRuido(unidad)) continue;

    const item = limpiarItem(unidad);
    if (!item || item.length < 3) continue;

    if (actual) actual.items.push(item);
    else if (!titular) titular = item;
    else {
      if (!prosa.items.length) prosa.orden = orden++;
      prosa.items.push(item);
    }
  }
  if (prosa.items.length) bloques.push(prosa);

  // ── 3. Normalizar y sacar repetidos ──
  const vistos = new Set();
  const unico = (s) => {
    const k = s.toLowerCase().replace(/[^a-z0-9áéíóúñ]/gi, '');
    if (!k || vistos.has(k)) return null;
    vistos.add(k);
    return s;
  };

  if (titular) {
    const [primera] = oraciones(titular);
    if (primera && primera.length <= 180) titular = primera;
    else if (titular.length > 180) titular = titular.slice(0, 180).replace(/\s+\S*$/, '');
    titular = capitalizar(titular);
    unico(titular);
  }

  for (const b of bloques) {
    b.items = b.items
      .flatMap((i) => (i.length > 160 ? oraciones(i) : [i]))
      .map(capitalizar)
      .map(unico)
      .filter(Boolean);
  }

  const activos = bloques
    .filter((b) => b.items.length > 0)
    .sort((a, b) => a.prioridad - b.prioridad || a.orden - b.orden);

  // ── 4. Armado con presupuesto de caracteres ──
  const SEP = ' ';
  const conPunto = (s) => (/[.!?:]$/.test(s) ? s : `${s}.`);
  const render = (b, items) =>
    b.etiqueta ? `${b.etiqueta}: ${items.join(', ')}.` : items.map(conPunto).join(SEP);

  const partes = [];
  let usado = 0;

  if (titular) {
    const t = conPunto(titular);
    if (t.length <= max) { partes.push(t); usado = t.length; }
  }

  const estados = activos.map((b) => ({ ...b, elegidos: [] }));
  const intentar = (e, item) => {
    const antes = e.elegidos.length ? render(e, e.elegidos).length : 0;
    const despues = render(e, [...e.elegidos, item]).length;
    const costo = despues - antes + (antes === 0 ? SEP.length : 0);
    if (usado + costo > max) return false;
    e.elegidos.push(item);
    usado += costo;
    return true;
  };

  // Pasada 1: hasta 2 ítems por bloque, para que ninguna sección quede afuera.
  for (const e of estados) for (const item of e.items.slice(0, 2)) intentar(e, item);
  // Pasada 2: se completa con el resto, por prioridad. Si un ítem no entra se prueba el
  // siguiente (uno larguísimo no debe dejar 200 caracteres sin usar).
  for (const e of estados) for (const item of e.items.slice(2)) intentar(e, item);

  for (const e of estados) if (e.elegidos.length) partes.push(render(e, e.elegidos));

  const salida = partes.join(SEP).replace(/\s{2,}/g, ' ').trim();
  return salida.length > max ? salida.slice(0, max).replace(/\s+\S*$/, '') : salida;
}

export default condensarDescripcion;
