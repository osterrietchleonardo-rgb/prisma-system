// ACM · El barrio de un aviso leído de su página.
//
// Los portales ponen el barrio en campos distintos, y no donde el nombre del campo lo sugiere.
// En el JSON-LD de Argenprop y de Zonaprop (páginas reales, 16-sep-2026) `addressLocality` es la
// CIUDAD y `addressRegion` es el BARRIO:
//   Argenprop 20432877 → addressLocality "CABA, Argentina",            addressRegion "Palermo Chico"
//   Zonaprop  58056724 → addressLocality "Capital Federal, Argentina", addressRegion "Chacarita"
// Tomar "el primero que venga" se quedaba con la ciudad, y un barrio "CABA" rompe la búsqueda de
// comparables (no es un barrio) y sale impreso en la ficha del cliente.
//
// La regla es la MISMA que ya usa el extractor con navegador (`pickBarrioCoherente` en
// roomix-sync/extractor-server.mjs, que corre aparte y no puede importar este archivo): se juntan
// los candidatos de todas las fuentes, se descarta lo que es una ciudad o región entera, y gana
// el que confirma el link del aviso o el que repiten más fuentes. Si ninguno es un barrio real,
// vacío: mejor que el asesor lo complete a que el sistema adivine. Si cambia una, cambiar la otra.

/** Nombres que describen una ciudad o región entera, no un barrio. */
export const ZONA_GENERAL =
  /^(capital federal|ciudad(\s+aut[oó]noma)?\s+de\s+buenos\s+aires|c\.?a\.?b\.?a\.?|buenos aires|argentina|gran buenos aires|g\.?b\.?a\.?|provincia(\s+de\s+buenos\s+aires)?|zona\s+(norte|sur|oeste|este)|amba)$/i;

/** Para comparar: minúsculas, sin tildes, y cualquier signo pasa a ser un espacio. */
function normalizar(s: string): string {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function elegirBarrio(candidatos: (string | null | undefined)[], url: string): string {
  let slug = "";
  try {
    slug = normalizar(decodeURIComponent(url || ""));
  } catch {
    slug = normalizar(url || "");
  }
  // "Caballito, Capital Federal" → "Caballito"; afuera los vacíos y lo que no es un barrio.
  const limpios = candidatos
    .map((c) => (c || "").toString().split(",")[0].trim())
    .filter((c) => c && !ZONA_GENERAL.test(c));
  if (limpios.length === 0) return "";
  const puntaje = (c: string) => {
    const n = normalizar(c);
    if (!n) return -1;
    let p = limpios.filter((o) => normalizar(o) === n).length; // cuántas fuentes lo dicen
    if (slug.includes(n)) p += 3; // lo confirma el link del aviso
    return p;
  };
  // `sort` es estable: ante un empate queda el que vino antes en la lista.
  return limpios.slice().sort((a, b) => puntaje(b) - puntaje(a))[0];
}
