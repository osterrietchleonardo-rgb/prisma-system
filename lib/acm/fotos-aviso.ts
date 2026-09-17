// ACM · Las fotos de UN aviso, leídas de su página.
//
// Cuando el asesor suma un comparable pegando el link y ese aviso no está en la red, las fotos
// hay que sacarlas de la página del portal. El problema no es encontrar fotos: una página de
// portal trae decenas de fotos AJENAS (avisos recomendados, otras unidades del mismo edificio,
// logos). Meter una de esas en la ficha del cliente es mostrarle otra propiedad como si fuera
// el comparable. Por eso cada portal se reconoce por algo que ata la foto a ESE aviso, medido
// contra páginas reales el 16-sep-2026:
//
//   - Zonaprop: la carpeta de la foto es el número del aviso partido de a dos cifras
//     (aviso 58056724 → /avisos/1/00/58/05/67/24/). Se pide la versión de 1200x1200.
//   - Argenprop: la carpeta es el número del aviso AL REVÉS (20432877 → /static-content/77823402/).
//     La misma página traía 8 fotos de otros avisos en carpetas distintas.
//   - MercadoLibre: la foto no lleva el número del aviso, así que se toman solo las que están
//     dentro de la galería (`ui-pdp-gallery`), que termina donde empieza la columna siguiente.
//     Justo después vienen las "unidades disponibles" del emprendimiento, con fotos de OTRAS
//     unidades: en el aviso probado eran 6.
//
// Portal que no se reconoce: no se devuelve ninguna foto. Mejor una hoja sin fotos que una hoja
// con las fotos de otra propiedad.
//
// PURA: recibe el HTML, no baja nada.

export const MAX_FOTOS_AVISO = 16;

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Número del aviso de Zonaprop: `...-58056724.html`. */
export function idZonaprop(url: string): string | null {
  return url.match(/-(\d{5,})\.html(?:$|[?#])/)?.[1] ?? null;
}

/** Número del aviso de Argenprop: `...--20432877`. */
export function idArgenprop(url: string): string | null {
  return url.match(/--(\d{5,})(?:$|[/?#])/)?.[1] ?? null;
}

function unicas(urls: string[]): string[] {
  return Array.from(new Set(urls)).slice(0, MAX_FOTOS_AVISO);
}

function fotosZonaprop(url: string, html: string): string[] {
  const id = idZonaprop(url);
  if (!id) return [];
  const pares = id.padStart(10, "0").match(/\d\d/g)!.join("/");
  const re = new RegExp(`https://imgar\\.zonapropcdn\\.com/avisos/(?:resize/)?(\\d+)/${pares}/\\d+x\\d+/(\\d+)\\.jpg`, "g");
  const out: string[] = [];
  for (const m of Array.from(html.matchAll(re))) {
    out.push(`https://imgar.zonapropcdn.com/avisos/${m[1]}/${pares}/1200x1200/${m[2]}.jpg`);
  }
  return unicas(out);
}

function fotosArgenprop(url: string, html: string): string[] {
  const id = idArgenprop(url);
  if (!id) return [];
  const carpeta = id.split("").reverse().join("");
  const re = new RegExp(`https://www\\.argenprop\\.com/static-content/${carpeta}/([0-9a-f-]{36})(?:_[a-z_]+)?\\.jpg`, "gi");
  const out: string[] = [];
  for (const m of Array.from(html.matchAll(re))) {
    out.push(`https://www.argenprop.com/static-content/${carpeta}/${m[1].toLowerCase()}.jpg`);
  }
  return unicas(out);
}

function fotosMercadoLibre(html: string): string[] {
  const inicio = html.indexOf("ui-pdp-gallery");
  if (inicio < 0) return [];
  // Fin de la galería: la primera columna/fila que viene después. Sin corte no se toma nada,
  // porque lo que sigue a la galería son justamente fotos de otras unidades.
  const cortes = ["ui-pdp-container__col", "ui-pdp-container__row", "ui-vip-available-units"]
    .map((k) => html.indexOf(k, inicio))
    .filter((i) => i > inicio);
  if (cortes.length === 0) return [];
  const galeria = html.slice(inicio, Math.min(...cortes));
  const out: string[] = [];
  for (const m of Array.from(galeria.matchAll(/https:\/\/http2\.mlstatic\.com\/D_[A-Za-z0-9_]*?(\d{5,}-MLA\d+_\d+)-[A-Z]\.(?:webp|jpg)/g))) {
    out.push(`https://http2.mlstatic.com/D_NQ_NP_2X_${m[1]}-F.webp`);
  }
  return unicas(out);
}

export function fotosDelAviso(url: string, html: string | null | undefined): string[] {
  if (!html) return [];
  const host = hostDe(url);
  if (/(^|\.)zonaprop\.com\.ar$/.test(host)) return fotosZonaprop(url, html);
  if (/(^|\.)argenprop\.com$/.test(host)) return fotosArgenprop(url, html);
  if (/(^|\.)mercadolibre\.com\.ar$/.test(host)) return fotosMercadoLibre(html);
  return [];
}
