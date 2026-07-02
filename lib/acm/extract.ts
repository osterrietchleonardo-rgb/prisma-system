// ─────────────────────────────────────────────────────────────────────────────
// ACM · Extracción de una propiedad desde la URL de cualquier portal.
// Estrategia en cascada (NO masiva, es 1 URL puntual al apretar "Analizar"):
//   Tier 1 (acá, sin navegador): fetch del HTML → JSON-LD RealEstateListing →
//           OpenGraph/meta → fallback IA (Gemini) sobre el texto visible.
//   Tier 2 (servicio externo con navegador stealth, reusa la estrategia del crawler
//           de roomix): si Tier 1 lo bloquea (Cloudflare/403/vacío) y está seteada
//           la env ACM_EXTRACTOR_URL, se delega a ese servicio.
// Si nada alcanza, devuelve lo que pudo + requiere_completar_manual = true (nunca rompe).
//
// El parseo de JSON-LD reutiliza la MISMA convención que roomix-sync/crawler.mjs
// (schema.org RealEstateListing), que es lo que exponen ZonaProp/Argenprop/ML/etc.
// ─────────────────────────────────────────────────────────────────────────────

import { prismaIA } from "@/lib/gemini";
import type { ExtractResult, Moneda, Operacion, TipoPropiedad, Sujeto } from "@/lib/tasacion/types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function emptyResult(extra: Partial<ExtractResult> = {}): ExtractResult {
  return {
    ok: false,
    sujeto: {},
    precio: null,
    moneda: null, // SIN default: si no se determina, queda vacío para completar a mano
    operacion: null, // SIN default: nunca se asume "venta"
    responsable: null,
    fecha_publicacion: null,
    fuente_portal: null,
    metodo: "opengraph",
    requiere_completar_manual: true,
    ...extra,
  };
}

export function portalFromUrl(url: string): string | null {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h;
  } catch {
    return null;
  }
}

function mapTipo(raw?: string | null): TipoPropiedad {
  const t = (raw || "").toLowerCase();
  if (/\bph\b/.test(t)) return "ph";
  if (/(office|oficina)/.test(t)) return "oficina";
  if (/(local|store|commercial|premises|comercial)/.test(t)) return "local";
  if (/(land|lote|terreno)/.test(t)) return "terreno";
  if (/(house|casa|chalet|singlefamily|residence|quinta)/.test(t)) return "casa";
  if (/(apart|depart|condo|flat|accommod|monoambiente|studio|loft)/.test(t)) return "departamento";
  return "departamento";
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function mapMoneda(raw?: string | null): Moneda | null {
  const c = (raw || "").toUpperCase();
  if (c.includes("USD") || c.includes("U$S") || c.includes("US$") || c.includes("DOLAR")) return "USD";
  if (c.includes("ARS") || (c.includes("$") && !c.includes("US"))) return "ARS";
  return null; // sin señal clara NO se inventa moneda
}

// ── JSON-LD (schema.org RealEstateListing). Maneja @graph y arrays. ──
function parseJsonLdListings(html: string): any[] {
  const out: any[] = [];
  const regex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html))) {
    try {
      const j = JSON.parse(m[1].trim());
      const arr = Array.isArray(j) ? j : j["@graph"] && Array.isArray(j["@graph"]) ? j["@graph"] : [j];
      for (const node of arr) out.push(node);
    } catch {
      /* ignora bloques inválidos */
    }
  }
  return out;
}

function pickListing(nodes: any[]): any | null {
  const typeOf = (n: any) => (Array.isArray(n?.["@type"]) ? n["@type"].join(" ") : n?.["@type"] || "");
  return (
    nodes.find((n) => /RealEstateListing/i.test(typeOf(n))) ||
    nodes.find((n) => /(Residence|Apartment|House|Place|Product|Offer)/i.test(typeOf(n)) && (n.offers || n.address || n.floorSize)) ||
    null
  );
}

function fromJsonLd(html: string): { extract: Partial<ExtractResult>; sujeto: Partial<Sujeto> } | null {
  const nodes = parseJsonLdListings(html);
  if (nodes.length === 0) return null;
  const ld = pickListing(nodes);
  if (!ld) return null;

  const me = ld.mainEntity || ld.about || ld;
  const offers = (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) || (Array.isArray(me.offers) ? me.offers[0] : me.offers) || {};
  const addr = me.address || ld.address || {};
  const fs = me.floorSize || ld.floorSize || {};

  const bedrooms = toNum(ld.numberOfBedrooms ?? me.numberOfBedrooms);
  const rooms = toNum(ld.numberOfRooms ?? me.numberOfRooms);
  const banos = toNum(ld.numberOfBathroomsTotal ?? me.numberOfBathroomsTotal ?? me.numberOfBathrooms);
  const m2 = toNum(fs.value ?? fs);
  // Responsable: seller/provider/agent/broker si el portal lo expone en el JSON-LD.
  const seller = offers.seller || ld.provider || ld.author || me.broker || null;
  const responsable = typeof seller === "string" ? seller : seller?.name || null;
  const bf = String(offers.businessFunction || "").toLowerCase();
  // Solo afirmamos la operación si el portal la declara. Si no (ML no la trae), null → la decide la IA.
  const operacion: Operacion | null =
    bf.includes("lease") || bf.includes("rent") ? "alquiler"
    : bf.includes("sell") || bf.includes("sale") ? "venta"
    : null;

  const sujeto: Partial<Sujeto> = {
    direccion: addr.streetAddress || ld.name || "",
    barrio: addr.addressLocality || addr.addressRegion || "",
    tipo_propiedad: mapTipo(Array.isArray(me["@type"]) ? me["@type"][0] : me["@type"] || ld.name),
    m2_cubiertos: m2 ?? 0,
    dormitorios: bedrooms ?? (rooms ? Math.max(0, rooms - 1) : 0),
    banos: banos ?? 0,
  };

  return {
    extract: {
      precio: toNum(offers.price),
      moneda: mapMoneda(offers.priceCurrency),
      operacion,
      responsable,
      fecha_publicacion: ld.datePosted || ld.datePublished || offers.validFrom || null,
      metodo: "json-ld",
    },
    sujeto,
  };
}

// ── OpenGraph / meta (respaldo liviano para precio/título). ──
function fromOpenGraph(html: string): { extract: Partial<ExtractResult>; sujeto: Partial<Sujeto> } {
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, "i");
    const m = html.match(re);
    return m ? m[1].trim() : null;
  };
  const title = meta("og:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);
  const priceAmount = meta("product:price:amount") || meta("og:price:amount");
  const priceCurr = meta("product:price:currency") || meta("og:price:currency");
  const sujeto: Partial<Sujeto> = {};
  if (title) {
    sujeto.direccion = title;
    sujeto.tipo_propiedad = mapTipo(title);
  }
  return {
    extract: {
      precio: toNum(priceAmount),
      moneda: mapMoneda(priceCurr),
      metodo: "opengraph",
    },
    sujeto,
  };
}

// ── IA = cerebro: recibe TODO lo que trae la página (título, URL, descripción, JSON-LD y
//    texto visible) e INTERPRETA las variables razonando. Nunca inventa moneda/operación. ──
async function fromIA(html: string, url = ""): Promise<{ extract: Partial<ExtractResult>; sujeto: Partial<Sujeto> } | null> {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, "i");
    return html.match(re)?.[1]?.trim() || "";
  };
  const title = meta("og:title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
  const metaDesc = meta("og:description") || meta("description") || "";
  const ldNodes = parseJsonLdListings(html);
  const jsonld = ldNodes.length ? JSON.stringify(ldNodes).slice(0, 4000) : "";
  const contenido = [
    title && `TÍTULO DEL AVISO: ${title}`,
    url && `URL DE LA PUBLICACIÓN: ${url}`,
    metaDesc && `DESCRIPCIÓN (meta): ${metaDesc}`,
    jsonld && `DATOS ESTRUCTURADOS DEL PORTAL (JSON-LD): ${jsonld}`,
    text && `TEXTO VISIBLE DEL AVISO: ${text}`,
  ].filter(Boolean).join("\n\n").slice(0, 14000);
  if (contenido.length < 60) return null;

  const prompt = `Sos un analista inmobiliario experto de Argentina. Te paso TODO el contenido de la página de un aviso. Leé y RAZONÁ sobre el conjunto (título, URL, descripción, datos del portal y texto), y devolvé SOLO un JSON válido (sin texto extra):
{"tipo_propiedad":"departamento|casa|ph|local|oficina|terreno","direccion":"calle y altura si aparece; si no, la zona/barrio. NUNCA el título del aviso","barrio":"","m2_cubiertos":0,"dormitorios":0,"banos":0,"precio":0,"moneda":"USD|ARS|null","operacion":"venta|alquiler|null","responsable":"inmobiliaria o publicante, o null","fecha_publicacion":null}
Cómo razonar (interpretá lo que dice la página, NO adivines ni pongas valores por defecto):
- operacion: mirá la URL, el título y el texto. "alquiler"/"alquilar"/"renta" -> alquiler. "venta"/"en venta"/"comprar" -> venta. Si de verdad no se puede determinar, null. PROHIBIDO asumir "venta" sin señal.
- moneda: mirá cómo se muestra el precio. "US$"/"U$S"/"USD"/"dólares" -> USD. "$"/"ARS"/"pesos" sin símbolo de dólar -> ARS. Coherencia: alquiler mensual suele ser ARS, venta suele ser USD, pero mandá lo que la página indica. Si no hay señal, null.
- precio: el valor de la propiedad, NUNCA las expensas.
- "ambientes" NO es "dormitorios": si solo hay ambientes, dormitorios = ambientes - 1.
- Si un dato no está: null (0 en numéricos).
CONTENIDO:
"""${contenido}"""`;

  try {
    const res = await prismaIA.generateContent(prompt);
    const raw = res.response.text().replace(/```json|```/g, "").trim();
    const j = JSON.parse(raw);
    return {
      extract: {
        precio: toNum(j.precio),
        moneda: mapMoneda(j.moneda), // null si la IA no la determinó
        operacion: j.operacion === "alquiler" ? "alquiler" : j.operacion === "venta" ? "venta" : null,
        responsable: j.responsable || null,
        fecha_publicacion: j.fecha_publicacion || null,
        metodo: "ia",
      },
      sujeto: {
        tipo_propiedad: mapTipo(j.tipo_propiedad),
        direccion: j.direccion || "",
        barrio: j.barrio || "",
        m2_cubiertos: toNum(j.m2_cubiertos) ?? 0,
        dormitorios: toNum(j.dormitorios) ?? 0,
        banos: toNum(j.banos) ?? 0,
      },
    };
  } catch {
    return null;
  }
}

function looksBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 503 || status === 0) return true;
  const h = html.toLowerCase();
  return h.includes("just a moment") || h.includes("cf-challenge") || h.includes("attention required") || html.length < 500;
}

// ── Tier 2: servicio extractor con navegador stealth (opcional, env-gated). ──
async function tryExtractorService(url: string): Promise<ExtractResult | null> {
  const svc = process.env.ACM_EXTRACTOR_URL;
  if (!svc) return null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.ACM_EXTRACTOR_SECRET) headers["x-extractor-secret"] = process.env.ACM_EXTRACTOR_SECRET;
    const res = await fetch(svc, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
      // el servicio puede tardar (resuelve Cloudflare); damos margen, pero acotado
      // para que la suma de tiempos no supere el maxDuration de la función (60s).
      signal: AbortSignal.timeout(38000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ExtractResult>;
    // Respetamos el veredicto del servicio: si NO pudo leer la página (bloqueo/thin), devuelve
    // ok:false y requiere_completar_manual:true. NO lo forzamos a "ok" para no dar datos inventados.
    const ok = data.ok ?? Boolean(data.precio || (data.sujeto && (data.sujeto.m2_cubiertos || data.sujeto.dormitorios)));
    return {
      ...emptyResult(),
      ...data,
      ok,
      requiere_completar_manual: data.requiere_completar_manual ?? !ok,
      metodo: "extractor-service",
    };
  } catch {
    return null;
  }
}

// ── Orquestador principal ──
export async function extractFromUrl(url: string): Promise<ExtractResult> {
  const fuente_portal = portalFromUrl(url);

  let status = 0;
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    status = res.status;
    html = await res.text();
  } catch {
    status = 0;
  }

  const blocked = looksBlocked(status, html);

  // El servicio con navegador (Tier 2) se intenta UNA sola vez como mucho:
  // es lento (resuelve Cloudflare) y, si se llamara dos veces, la suma de tiempos
  // puede superar el límite de la función serverless y devolver un error en texto
  // plano (no-JSON) que rompía el front. Marcamos si ya lo probamos.
  let serviceTried = false;

  // Si parece bloqueado, intentamos primero el servicio con navegador (si existe).
  if (blocked) {
    serviceTried = true;
    const viaSvc = await tryExtractorService(url);
    if (viaSvc) return { ...viaSvc, fuente_portal };
  }

  // Tier 1: estructurado (JSON-LD → OpenGraph) y, si queda flojo, IA.
  const parts: Array<{ extract: Partial<ExtractResult>; sujeto: Partial<Sujeto> } | null> = [];
  if (html) {
    parts.push(fromJsonLd(html));
    parts.push(fromOpenGraph(html));
  }

  // Merge: el primer no-vacío gana (parts está ordenado JSON-LD antes que OpenGraph).
  const sujeto: Partial<Sujeto> = {};
  const ext: Partial<ExtractResult> = {};
  const isEmpty = (v: any) => v === undefined || v === null || v === "" || v === 0;
  for (const p of parts) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p.sujeto)) if (isEmpty((sujeto as any)[k]) && !isEmpty(v)) (sujeto as any)[k] = v;
    for (const [k, v] of Object.entries(p.extract)) if (isEmpty((ext as any)[k]) && !isEmpty(v)) (ext as any)[k] = v;
  }

  const tieneDatosMinimos = (sujeto.m2_cubiertos && sujeto.m2_cubiertos > 0) || (sujeto.dormitorios && sujeto.dormitorios > 0);

  // Si lo estructurado quedó flojo, intentamos el servicio con navegador (lee la página
  // renderizada como un usuario real: resuelve ML/ZonaProp/Argenprop) antes de seguir.
  if (!tieneDatosMinimos && !serviceTried) {
    serviceTried = true;
    const viaSvc = await tryExtractorService(url);
    if (viaSvc) return { ...viaSvc, fuente_portal };
  }

  // IA = cerebro: SIEMPRE que tengamos la página (no bloqueada) razona sobre TODO el contenido
  // y decide la interpretación (operación, moneda, tipo, responsable), además de completar los
  // números que falten. Ya NO se limita a "cuando faltan datos".
  if (html && !blocked) {
    const ia = await fromIA(html, url);
    if (ia) {
      // Vacíos: la IA completa lo que los deterministas no trajeron.
      for (const [k, v] of Object.entries(ia.sujeto)) if (isEmpty((sujeto as any)[k]) && !isEmpty(v)) (sujeto as any)[k] = v;
      for (const [k, v] of Object.entries(ia.extract)) if (isEmpty((ext as any)[k]) && !isEmpty(v)) (ext as any)[k] = v;
      // Interpretación: la IA PISA a los deterministas (razona sobre la página, no por keywords).
      if (ia.extract.operacion) ext.operacion = ia.extract.operacion;
      if (ia.extract.moneda) ext.moneda = ia.extract.moneda;
      if (ia.sujeto.tipo_propiedad) sujeto.tipo_propiedad = ia.sujeto.tipo_propiedad;
      if (ia.extract.responsable) ext.responsable = ia.extract.responsable;
    }
  }

  const ok = Boolean((sujeto.m2_cubiertos && sujeto.m2_cubiertos > 0) || (sujeto.dormitorios && sujeto.dormitorios > 0) || ext.precio);

  return {
    ...emptyResult(),
    sujeto,
    precio: ext.precio ?? null,
    moneda: (ext.moneda as Moneda) ?? null,       // SIN default: vacío si no se determinó
    operacion: (ext.operacion as Operacion) ?? null, // SIN default: nunca "venta" por defecto
    responsable: ext.responsable ?? null,
    fecha_publicacion: ext.fecha_publicacion ?? null,
    fuente_portal,
    metodo: (ext.metodo as ExtractResult["metodo"]) ?? "opengraph",
    ok,
    requiere_completar_manual: !ok,
    aviso: ok
      ? undefined
      : blocked
        ? "Este portal bloqueó la lectura automática. Completá los datos a mano (o configurá el servicio de extracción con navegador)."
        : "No se pudieron extraer datos suficientes de este link. Completá los datos a mano.",
  };
}
