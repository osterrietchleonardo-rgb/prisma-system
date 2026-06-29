import { TokkoProperty } from "@/types/marketing-ia";

// Marketing IA · Contexto de propiedad para el prompt del generador de copy.
// Objetivo: que el copy use datos REALES y relevantes de la propiedad asociada
// (sin ser una ficha técnica) y, si NO hay propiedad, que no invente nada.

// Arma un bloque legible con los datos reales de la propiedad.
// Devuelve "" cuando no hay propiedad asociada.
export function buildPropertyDataBlock(p?: TokkoProperty | null): string {
  if (!p) return "";

  const m2 = p.surface_total || p.surface_covered || 0;
  const precio = p.price ? `${p.currency || "USD"} ${Number(p.price).toLocaleString("es-AR")}` : null;
  const ubicacion = [p.address, p.zone].filter(Boolean).join(", ");
  const amenities = Array.isArray(p.tags) ? p.tags.filter(Boolean).join(", ") : "";
  // La descripción del aviso puede ser larga: la normalizamos y acotamos para controlar tokens.
  const descripcion = (p.description || "").replace(/\s+/g, " ").trim().slice(0, 1200);

  const filas = [
    p.title ? `- Título del aviso: ${p.title}` : null,
    p.property_type ? `- Tipo: ${p.property_type}` : null,
    p.operation_type ? `- Operación: ${p.operation_type}` : null,
    ubicacion ? `- Ubicación: ${ubicacion}` : null,
    m2 ? `- Superficie: ${m2} m²` : null,
    p.rooms ? `- Ambientes: ${p.rooms}` : null,
    p.bathrooms ? `- Baños: ${p.bathrooms}` : null,
    precio ? `- Precio: ${precio}` : null,
    amenities ? `- Características / Amenities: ${amenities}` : null,
    descripcion ? `- Descripción real del aviso: ${descripcion}` : null,
  ].filter(Boolean);

  return filas.join("\n");
}

// Devuelve la directiva que reemplaza a la vieja regla "NO INVENTAR PROPIEDADES":
// - Si HAY propiedad: instruye a apoyarse en los datos reales con criterio psicológico
//   (ni 100% ficha técnica, ni 100% sin datos), respetando el filtro del IPC.
// - Si NO hay propiedad: mantiene la regla de no inventar datos de inmuebles.
export function buildPropertyDirective(
  p?: TokkoProperty | null,
  opts: { variants?: boolean } = {}
): string {
  const block = buildPropertyDataBlock(p);

  if (!block) {
    return `REGLA OBLIGATORIA (NO INVENTAR PROPIEDADES):
Todavía NO estás trabajando sobre una propiedad puntual. ${
      opts.variants ? "En NINGUNA de las variantes menciones" : "NO menciones"
    } ni inventes direcciones, calles, barrios o ubicaciones exactas, metros cuadrados, cantidad de ambientes o baños, precios, ni ningún dato técnico concreto de un inmueble específico. Escribí el copy en términos generales, enfocado en el perfil de cliente (IPC) y su deseo/problema, sin datos inventados.`;
  }

  const alcance = opts.variants ? " (aplicá esto en las 3 variantes)" : "";
  return `PROPIEDAD ASOCIADA (DATOS REALES Y VERIFICADOS — USALOS CON CRITERIO)${alcance}:
${block}

CÓMO USAR LA PROPIEDAD EN EL COPY:
- Estos datos son REALES. Apoyate en ellos para dar credibilidad, pero el copy NO es una ficha técnica ni un listado de specs.
- Elegí solo los 2 a 4 atributos MÁS persuasivos para este IPC y este ángulo (los que despiertan deseo o resuelven su dolor concreto) e integralos de forma natural dentro de la narrativa psicológica.
- Nunca inventes, exageres ni completes datos que no figuren arriba. Si un dato no está, no lo menciones.
- Respetá SIEMPRE el filtro del IPC sobre qué NO mostrar/mencionar.
- La emoción y la estrategia mandan; los datos concretos son la PRUEBA que sostiene la promesa, no el centro del mensaje.`;
}
