// ACM · Normalización y allowlist de URLs de foto de propiedad. Funciones PURAS: ningún
// `fetch`, ningún `sharp`. Viven aparte de `fotos-descarga.ts` justamente por eso — la mitad
// de los que las usan (el Buscador IA, el mapa, la ficha compartible, el historial de ACM)
// solo arman JSON y no tienen por qué cargar una librería nativa de imágenes para hacerlo.
//
// La allowlist de hosts sigue estando en UN solo lugar, que es lo que importa: es lo único que
// evita que una URL corrupta u hostil colada en `images` (una columna que puebla un
// sync/crawler, no un humano de confianza) llegue a un `fetch()` real. Tenerla duplicada es un
// riesgo de seguridad, no un tema de estilo.

/** Normaliza un campo `images` (jsonb): array de strings o de `{url}`, con basura filtrada, y
 *  con las URLs del CDN de roomix corregidas (ver `normalizarFotoRoomix` al final del archivo:
 *  el `.webp` que publica roomix da 404 en su propio CDN el 12% de las veces). Se aplica acá,
 *  en el único punto por donde pasan todas las lecturas de `images` del ACM, para que la foto
 *  salga arreglada tanto en la ficha del cliente como en la comparación por fotos con IA. */
export function normalizarImagenes(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((im: any) => (typeof im === "string" ? im : im?.url))
    .filter((u: any): u is string => typeof u === "string" && u.length > 0)
    .map(normalizarFotoRoomix);
}

/** Hosts reales de fotos de la cartera propia: sync de Tokko (`lib/tokko-sync.ts`) + Storage
 *  de Supabase (fichas cargadas a mano). Mismos hosts que la allowlist de `next/image`
 *  (next.config.mjs) — son los únicos orígenes reales de fotos de propiedad del sistema. */
export const HOSTS_CARTERA = [/^static\.tokkobroker\.com$/, /\.supabase\.co$/];
/** CDN real de fotos de la red de colaboración (roomix). */
export const HOSTS_ROOMIX = [/^cdn\.roomix\.ai$/];

/** Primeras `n` URLs de `images` que pasan la allowlist de hosts dada, en el orden en que están
 *  guardadas (sin curar — política validada en la ronda de holdout de San Telmo). */
export function primerasFotosPermitidas(images: string[], n: number, hosts: RegExp[]): string[] {
  const out: string[] = [];
  for (const url of images) {
    if (out.length >= n) break;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && hosts.some((re) => re.test(parsed.hostname))) out.push(url);
    } catch {
      // URL inválida: se descarta, no corta el resto.
    }
  }
  return out;
}

/** Roomix publica en sus fichas URLs de foto terminadas en `.webp` que su propio CDN no sirve:
 *  dan 404 y la foto queda rota en la tarjeta del comparable, en la ficha del cliente y en la
 *  comparación por fotos con IA (que descarga server-side y descarta la que falla). Medido el
 *  21-ago-2026 sobre `roomix_properties`: de 510 primeras-fotos `.webp` probadas, 63 dieron 404
 *  (12%) — unas 10.700 propiedades del catálogo de 356.314. Ninguna `.jpg` falló (40/40).
 *
 *  El mismo archivo con extensión `.jpg` SIEMPRE está: 60 de 60 probadas devolvieron 200,
 *  incluidas las 47 donde el `.webp` también andaba. No es negociación de contenido (probado
 *  con `Accept: image/webp`, User-Agent de Chrome y `Referer: roomix.ai`: sigue 404), así que
 *  no hay forma de pedir el `.webp` "bien" — simplemente no existe en el CDN.
 *
 *  Por eso se pide siempre el `.jpg`, que es el único que está garantizado. Cuesta ~57% más de
 *  peso (110 KB contra 70 KB de promedio), y ese costo solo lo paga la lista de tarjetas (que
 *  ya baja las fotos de a una con `loading="lazy"`): la ficha pública pasa por `/_next/image`,
 *  que recomprime igual, y el análisis con IA re-encodea a JPEG 1280 con sharp antes de mandar.
 *
 *  Solo toca el CDN de roomix. Cualquier otra URL (Tokko, Storage, lo que venga) sale igual. */
export function normalizarFotoRoomix(url: string): string {
  try {
    const parsed = new URL(url);
    if (!HOSTS_ROOMIX.some((re) => re.test(parsed.hostname))) return url;
    return url.replace(/\.webp(?=$|\?)/i, ".jpg");
  } catch {
    return url;
  }
}
