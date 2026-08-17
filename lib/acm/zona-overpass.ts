// ACM · Respaldo de la hoja del entorno fuera de CABA (Olivos, Monte Grande, Escobar…).
//
// Los datos del gobierno porteño terminan en la General Paz. De los 53 ACM hechos al escribir
// esto, 48 eran de CABA y 5 de GBA: esto cubre esos 5 sin tocar nada de los 48.
//
// Overpass es un servidor COMUNITARIO, no nuestro: contesta 406 a quien no se identifica y 429
// o 504 cuando está cargado. Nunca puede bloquear la creación de una ficha — si no contesta a
// tiempo, la hoja no sale y listo.
import { resumenACategorias } from "./zona";
import type { FichaZona } from "./ficha";

const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
const TIMEOUT_MS = 20000;
/** Menos de esto es media hoja vacía, que se ve peor que ninguna hoja. */
const MINIMO_CATEGORIAS = 3;

/** Metros entre dos coordenadas (Haversine). Acá no hay PostGIS: esto se resuelve en vivo. */
function metrosEntre(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

interface Elemento { tags: Record<string, string>; lat: number; lon: number; metros: number }

export async function zonaPorOverpass(
  lat: number,
  lon: number,
  barrioDeclarado: string
): Promise<Omit<FichaZona, "relato" | "mapa_url" | "centro"> | null> {
  // Una sola consulta con todos los radios: cada ida a Overpass cuesta segundos.
  // `nwr` toma nodos, vías y relaciones: muchos hospitales, escuelas y parques están mapeados
  // como polígono y no como punto, y pidiendo solo `node` se perderían.
  const consulta = `[out:json][timeout:18];
(
  nwr["railway"="station"](around:1500,${lat},${lon});
  nwr["leisure"="park"](around:1200,${lat},${lon});
  nwr["amenity"="school"](around:1000,${lat},${lon});
  nwr["amenity"="hospital"](around:3000,${lat},${lon});
  nwr["amenity"="pharmacy"](around:500,${lat},${lon});
  nwr["highway"="bus_stop"](around:300,${lat},${lon});
  nwr["amenity"="police"](around:1500,${lat},${lon});
);
out center tags;`;

  let elementos: any[] = [];
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass contesta 406 a quien no se identifica. Mismo patrón que
        // scripts/cargar-manzanas.mjs, que ya lo usa en producción.
        "User-Agent": UA,
        Accept: "application/json",
      },
      body: "data=" + encodeURIComponent(consulta),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`Overpass ${r.status}`);
    elementos = (await r.json())?.elements || [];
  } catch (e) {
    // Sin reintentos a propósito: acá hay un asesor esperando que se cree su ficha. Los
    // reintentos con espera creciente son del script de carga, que corre sin nadie mirando.
    console.error("ACM zona: Overpass no contestó:", e);
    return null;
  }

  // Cada elemento con su distancia. `center` lo agrega Overpass para vías y relaciones.
  const conDistancia: Elemento[] = elementos.flatMap((e: any) => {
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return [];
    return [{ tags: e.tags || {}, lat: la, lon: lo, metros: metrosEntre(lat, lon, la, lo) }];
  });

  const filtrar = (pred: (t: Record<string, string>) => boolean, radio: number) =>
    conDistancia.filter((x) => pred(x.tags) && x.metros <= radio).sort((a, b) => a.metros - b.metros);

  /** El más cercano CON nombre: sin nombre no sirve para narrar ni para imprimir. */
  const primero = (lista: Elemento[], subtipo: string | null = null) => {
    const x = lista.find((e) => (e.tags.name || "").trim());
    return x ? { nombre: x.tags.name.trim(), subtipo, metros: x.metros, lat: x.lat, lon: x.lon, extra: {} } : null;
  };

  const estaciones = filtrar((t) => t.railway === "station", 1500);
  const parques = filtrar((t) => t.leisure === "park", 1200);
  const escuelas = filtrar((t) => t.amenity === "school", 1000);
  const hospitales = filtrar((t) => t.amenity === "hospital", 3000);
  const farmacias = filtrar((t) => t.amenity === "pharmacy", 500);
  const policia = filtrar((t) => t.amenity === "police", 1500);
  const paradas = filtrar((t) => t.highway === "bus_stop", 300);

  // Las líneas salen de route_ref o ref de la parada; en GBA suelen faltar. Si no hay ninguna,
  // la categoría no aparece — que es justo lo que hace resumenACategorias con una lista vacía.
  const lineas = Array.from(
    new Set(
      paradas.flatMap((p) =>
        String(p.tags.route_ref || p.tags.ref || "")
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    )
  );

  // Se arma el MISMO objeto que devuelve zona_resumen para reusar resumenACategorias tal cual:
  // así la hoja de GBA se imprime con el mismo código y se ve idéntica a la de CABA.
  const resumen = {
    // La categoría se llama "subte" porque en CABA eso es, pero FUERA de CABA no hay subte: en
    // Olivos, "Avenida Maipú" es una estación del tren Mitre. Se aclara en el subtipo, que es
    // lo que se imprime al lado del nombre. Sin esto la hoja de una propiedad de Vicente López
    // le promete subte a un comprador que se va a subir a un tren.
    subte: primero(estaciones, "Estación de tren"),
    espacio_verde: primero(parques),
    hospital: primero(hospitales),
    comisaria: primero(policia),
    ciclovia: null,
    escuela: { cantidad: escuelas.length, estatales: 0 },
    farmacia: { cantidad: farmacias.length },
    ecobici: { cantidad: 0 },
    parada_colectivo: { lineas, cantidad: lineas.length },
  };

  const pois = resumenACategorias(resumen);
  if (pois.length < MINIMO_CATEGORIAS) return null;

  return {
    // OpenStreetMap no tiene los barrios de GBA con la prolijidad del gobierno porteño: se usa
    // lo que escribió el asesor, que para una propiedad de GBA es el dato más confiable que hay.
    barrio: (barrioDeclarado || "").trim(),
    comuna: null,
    area_km2: null,
    espacios_verdes_barrio: null,
    fuente: "osm",
    pois,
  };
}
