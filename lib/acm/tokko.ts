// ACM · Mapea los tags/servicios de Tokko (que vienen en inglés: "Pool", "Gym",
// "Garden", "Terrace", "Storage room", "24 Hour Security"…) a las amenities del Sujeto.
import type { Amenidades } from "@/lib/tasacion/types";

const MATCHERS: Record<keyof Amenidades, RegExp> = {
  cochera_cubierta: /garage|cochera|covered parking/i,
  cochera_descubierta: /uncovered parking|cochera descub/i,
  baulera: /storage room|baulera|attic/i,
  pileta: /\bpool\b|pileta|piscina|swimming/i,
  gimnasio: /\bgym\b|gimnas|fitness/i,
  sum: /\bsum\b|salon de usos|salón de usos|clubhouse/i,
  seguridad_24hs: /24 hour security|security|seguridad|vigilan|alarm/i,
  jardin_privado: /\bgarden\b|jard[ií]n|backyard/i,
  terraza_privada: /terrace|terraza|solarium|deck/i,
};

export function tokkoTagsToAmenidades(tags: string[]): Amenidades {
  const hay = (tags || []).join(" | ");
  const out = {} as Amenidades;
  (Object.keys(MATCHERS) as (keyof Amenidades)[]).forEach((k) => {
    out[k] = MATCHERS[k].test(hay);
  });
  return out;
}
