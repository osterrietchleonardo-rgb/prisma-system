// ACM · Hoja "La propiedad y su entorno": de una dirección a los datos duros del barrio.
//
// El camino es: dirección → Georef (lat/lon) → zona_resumen (PostGIS) → categorías listas para
// imprimir. Fuera de CABA, zona_resumen devuelve null y entra el respaldo de zona-overpass.ts.
//
// NADA de acá escribe texto para el cliente: eso es zona-relato.ts. Acá solo salen números y
// nombres propios que vinieron de un dataset.
import { CATEGORIAS_ZONA, type CategoriaZona, type FichaZona, type FichaZonaPoi } from "./ficha";

const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
const TIMEOUT_GEOREF_MS = 8000;

/** Provincia 02 = CABA. Georef pide el código, no el nombre. */
const PROVINCIA_CABA = "02";

/**
 * Dirección → coordenadas, con Georef (gratis, del gobierno nacional).
 *
 * OJO con lo que Georef NO da: para CABA devuelve `departamento: "Comuna 13"`, nunca el barrio.
 * El barrio sale del polígono (zona_resumen), no de acá.
 *
 * Se busca primero restringido a CABA porque ahí está el 90% del inventario medido; si no
 * aparece, se reintenta sin restringir provincia para cubrir GBA.
 */
export async function geocodificar(direccion: string, barrio: string): Promise<{ lat: number; lon: number } | null> {
  const texto = [direccion, barrio].filter(Boolean).join(", ").trim();
  if (!texto) return null;

  for (const provincia of [PROVINCIA_CABA, null]) {
    try {
      const u = new URL("https://apis.datos.gob.ar/georef/api/direcciones");
      u.searchParams.set("direccion", texto);
      u.searchParams.set("max", "1");
      if (provincia) u.searchParams.set("provincia", provincia);

      const r = await fetch(u.toString(), {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_GEOREF_MS),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const ub = d?.direcciones?.[0]?.ubicacion;
      if (ub && Number.isFinite(ub.lat) && Number.isFinite(ub.lon)) {
        return { lat: Number(ub.lat), lon: Number(ub.lon) };
      }
    } catch {
      // Timeout o red caída: se prueba el siguiente intento y, si no, se devuelve null.
    }
  }
  return null;
}

const plural = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;

/**
 * El jsonb de zona_resumen (o el equivalente que arma Overpass) → las tarjetas de la hoja.
 *
 * Regla: **una categoría sin dato no aparece**. Nada de "0 farmacias" ni "sin datos de subte":
 * un renglón que dice que algo falta llama la atención sobre lo que no hay, que es justo lo que
 * un documento de venta no tiene que hacer. Si no hay, no se habla del tema.
 */
export function resumenACategorias(r: any): FichaZonaPoi[] {
  if (!r || typeof r !== "object") return [];

  /**
   * El más cercano de una categoría.
   * `sinNombre` es el título de respaldo cuando el dataset no trae nombre propio; sin él, la
   * categoría se descarta. Solo lo usa espacio_verde: la consulta ya se encarga de que un
   * parque anónimo llegue hasta acá únicamente si pasa la hectárea (ver zona_verde_cercano),
   * así que "Espacio verde" a secas es honesto. Una estación de subte sin nombre, en cambio,
   * es un dato roto y no se muestra.
   */
  const cercano = (cat: CategoriaZona, opciones?: { detalle?: boolean; sinNombre?: string }): FichaZonaPoi | null => {
    const x = r[cat];
    if (!x) return null;
    const nombre = String(x.nombre || "").trim();
    const titulo = nombre || opciones?.sinNombre || "";
    if (!titulo) return null;
    return {
      categoria: cat,
      titulo,
      detalle: opciones?.detalle && x.subtipo ? String(x.subtipo).trim() : "",
      metros: Number.isFinite(x.metros) ? Number(x.metros) : null,
      cantidad: null,
      lat: Number.isFinite(x.lat) ? Number(x.lat) : null,
      lon: Number.isFinite(x.lon) ? Number(x.lon) : null,
    };
  };

  const conteo = (cat: CategoriaZona, sing: string, plu: string, detalle = ""): FichaZonaPoi | null => {
    const n = Number(r[cat]?.cantidad);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { categoria: cat, titulo: plural(n, sing, plu), detalle, metros: null, cantidad: n, lat: null, lon: null };
  };

  const porCategoria: Record<CategoriaZona, () => FichaZonaPoi | null> = {
    // La línea es lo único que el lector realmente necesita saber además del nombre.
    subte: () => cercano("subte", { detalle: true }),
    // Sin detalle: al lado de "Plaza Gral. Manuel Belgrano", poner "PLAZA" es ruido.
    espacio_verde: () => cercano("espacio_verde", { sinNombre: "Espacio verde" }),
    escuela: () => {
      const base = conteo("escuela", "escuela", "escuelas");
      if (!base) return null;
      const est = Number(r.escuela?.estatales);
      return { ...base, detalle: Number.isFinite(est) && est > 0 ? `${est} estatales` : "" };
    },
    hospital: () => cercano("hospital"),
    farmacia: () => conteo("farmacia", "farmacia", "farmacias", "a menos de 500 m"),
    parada_colectivo: () => {
      const lineas = Array.isArray(r.parada_colectivo?.lineas) ? r.parada_colectivo.lineas : [];
      if (lineas.length === 0) return null;
      // Ordenadas como NUMEROS: el orden de texto pone el 113 antes que el 29 y la lista
      // parece un error de carga.
      const orden = [...lineas].sort((a: string, b: string) => Number(a) - Number(b));
      return {
        categoria: "parada_colectivo",
        titulo: orden.join(" · "),
        detalle: "a menos de 300 m",
        metros: null, cantidad: orden.length, lat: null, lon: null,
      };
    },
    comisaria: () => cercano("comisaria"),
    ecobici: () => conteo("ecobici", "estación Ecobici", "estaciones Ecobici", "a menos de 600 m"),
    ciclovia: () => cercano("ciclovia"),
  };

  // El orden de impresión lo manda CATEGORIAS_ZONA, no el orden del jsonb.
  return CATEGORIAS_ZONA.map((c) => porCategoria[c]()).filter((x): x is FichaZonaPoi => x !== null);
}

/** Lo duro de la hoja + el punto que se geocodificó (que necesita el mapa). */
export interface ZonaCalculada {
  zona: Omit<FichaZona, "relato" | "mapa_url">;
  centro: { lat: number; lon: number };
}

/** Menos de esto es media hoja vacía, que se ve peor que ninguna hoja. */
const MINIMO_CATEGORIAS = 3;

/**
 * Todo lo duro de la hoja, listo salvo el relato y el mapa (que vienen después).
 * Devuelve null si no se pudo ubicar la propiedad o si no hay datos suficientes.
 */
export async function obtenerZona(
  supabase: { rpc: (fn: string, args: any) => Promise<{ data: any; error: any }> },
  direccion: string,
  barrio: string
): Promise<ZonaCalculada | null> {
  const centro = await geocodificar(direccion, barrio);
  if (!centro) return null;

  const { data, error } = await supabase.rpc("zona_resumen", { p_lat: centro.lat, p_lon: centro.lon });
  if (error) {
    console.error("ACM zona: falló zona_resumen:", error);
    return null;
  }

  if (data) {
    const pois = resumenACategorias(data);
    if (pois.length < MINIMO_CATEGORIAS) return null;
    return {
      centro,
      zona: {
        barrio: String(data.barrio || ""),
        comuna: Number.isFinite(data.comuna) ? Number(data.comuna) : null,
        area_km2: Number.isFinite(Number(data.area_km2)) ? Number(data.area_km2) : null,
        espacios_verdes_barrio: Number.isFinite(data.espacios_verdes_barrio) ? Number(data.espacios_verdes_barrio) : null,
        fuente: "gcba",
        pois,
      },
    };
  }

  // No es CABA: respaldo por OpenStreetMap. Import diferido para no cargarlo en el 90% de los
  // casos que se resuelven con la base.
  const { zonaPorOverpass } = await import("./zona-overpass");
  const zona = await zonaPorOverpass(centro.lat, centro.lon, barrio);
  return zona ? { zona, centro } : null;
}
