// ACM · El párrafo que cuenta el barrio en la hoja del entorno.
//
// La IA acá tiene UN trabajo: convertir en prosa una lista de datos que ya vienen calculados.
// No decide, no busca, no completa. Cada número y cada nombre propio del texto tiene que poder
// rastrearse a la lista que se le pasó — por eso los datos van en cuadras YA convertidas y no
// en metros: si el modelo tuviera que dividir por cien, tendríamos aritmética de un LLM en un
// documento firmado por la inmobiliaria.
import { GoogleGenerativeAI } from "@google/generative-ai";
import { cuadrasEnPalabras } from "./zona-formato";
import type { FichaZonaPoi } from "./ficha";

/** Tope duro. La hoja es un A4 exacto y el relato comparte columna con la descripción. */
export const MAX_RELATO = 900;

export interface DatosRelato {
  barrio: string;
  comuna: number | null;
  area_km2: number | null;
  espacios_verdes_barrio: number | null;
  pois: FichaZonaPoi[];
}

/** Cómo se le nombra cada categoría al modelo. Los radios van en cuadras, como todo lo demás. */
const ETIQUETAS: Record<string, string> = {
  subte: "Estación más cercana",
  espacio_verde: "Espacio verde más cercano",
  escuela: "Escuelas a menos de diez cuadras",
  hospital: "Hospital más cercano",
  farmacia: "Farmacias a menos de cinco cuadras",
  parada_colectivo: "Líneas de colectivo que paran a menos de tres cuadras",
  comisaria: "Comisaría más cercana",
  ecobici: "Estaciones de bicicletas públicas a menos de seis cuadras",
  ciclovia: "Ciclovía más cercana",
};

/**
 * Categorías cuyo `detalle` le sirve al modelo. En el resto, `detalle` es el radio en metros
 * ("a menos de 500 m") — existe para la columna impresa, donde los metros exactos corresponden.
 * Pasárselo al modelo lo hacía escribir "cinco farmacias a menos de quinientos metros" justo
 * al lado de frases en cuadras, mezclando dos unidades en el mismo párrafo. La etiqueta de
 * arriba ya lleva el radio en cuadras.
 */
const DETALLE_UTIL = new Set(["subte", "escuela"]);

export function construirPromptZona(d: DatosRelato): string {
  const lineas: string[] = [];
  lineas.push(`Barrio: ${d.barrio}`);
  // Fuera de CABA no hay comuna ni superficie: esas líneas simplemente no van. El modelo tiene
  // prohibido mencionar lo que falta, así que si no está, no existe.
  if (d.comuna != null) lineas.push(`Comuna: ${d.comuna}`);
  if (d.area_km2 != null) lineas.push(`Superficie del barrio: ${d.area_km2} km²`);
  if (d.espacios_verdes_barrio) lineas.push(`Espacios verdes públicos en el barrio: ${d.espacios_verdes_barrio}`);

  for (const p of d.pois) {
    const etiqueta = ETIQUETAS[p.categoria] || p.categoria;
    const dist = p.metros != null ? ` (a ${cuadrasEnPalabras(p.metros)})` : "";
    const det = p.detalle && DETALLE_UTIL.has(p.categoria) ? ` — ${p.detalle}` : "";
    lineas.push(`${etiqueta}: ${p.titulo}${det}${dist}`);
  }

  return `Sos un redactor inmobiliario argentino. Escribís para el dueño de una propiedad que va a
leer el informe de tasación que le hizo su inmobiliaria.

Escribí TRES párrafos cortos sobre el barrio:

1. UBICAR: dónde está el barrio, con lo que diga la lista (comuna, superficie, espacios verdes).
   Una o dos oraciones. Si la lista NO trae nada del barrio más allá del nombre, decí solamente
   el nombre y pasá a lo que sí hay: está PROHIBIDO describir su carácter, su arquitectura, sus
   veredas, su gente o su "perfil" — nada de eso lo sabés.
2. CAMINAR: elegí los TRES O CUATRO datos que más cambian la vida diaria de alguien que vive
   ahí y contalos como la experiencia de caminar el barrio. El resto ignoralo.
3. CERRAR: una sola oración sobre qué clase de día a día permite eso.

DATOS DISPONIBLES (lo único que existe):
${lineas.join("\n")}

LO QUE MÁS SE ROMPE (leelo dos veces):
- ESTO NO ES UNA LISTA. La lista completa ya está impresa al lado de tu texto, con todos los
  números. Si repetís todo, el lector lee lo mismo dos veces y tu párrafo no sirve para nada.
  Elegí, jerarquizá, dejá cosas afuera.
- NUNCA enumeres números de líneas de colectivo. Se dice "más de diez líneas de colectivo",
  nunca "29, 41, 44, 57".
- No cierres con adjetivos vacíos. Prohibido: "práctica", "segura", "tranquila", "ideal",
  "perfecta", "sumamente", "se integran", "calidad de vida", "lo mejor de ambos mundos". Si el
  último párrafo se podría copiar y pegar en el informe de otro barrio, está mal escrito.
- No afirmes que la zona es segura ni tranquila: no lo sabés.

NINGÚN NOMBRE PROPIO QUE NO ESTÉ EN LA LISTA
Esto incluye, además de plazas y calles: barrios vecinos, estaciones de destino, cabeceras,
zonas ("el norte del conurbano", "zona norte", "el centro"), ciudades y partidos. Escribir "el
tren te conecta con Retiro" está PROHIBIDO aunque sea verdad, porque Retiro no está en la lista.
Decí lo que hay y dónde está; no adónde te lleva.

NO INVENTES PARA QUÉ SIRVE NI CON QUÉ SE CONECTA
Una ciclovía no "te conecta con la red de Ecobici". Una estación no "te lleva al centro". Un
hospital no "te cubre ante cualquier urgencia". Cada cosa de la lista está en un lugar, a una
distancia. Eso es todo lo que sabés de ella.

REGLAS QUE NO SE NEGOCIAN:
- No inventes historia, fundación, arquitectura, tradición ni "es sabido que".
- No opines sobre el valor de la propiedad. Nada de inversión, oportunidad ni revalorización.
- No uses las palabras "datos", "fuente", "según", "registro" ni "relevamiento". El lector no
  tiene que enterarse de que esto salió de una lista.
- Si algo no está en la lista, no existe: no lo menciones y no aclares que falta.
- Los decimales se escriben con coma: 8,1 km² y no 8.1 km².
- No uses títulos, viñetas, negritas ni markdown. Solo párrafos de texto corrido.
- Español rioplatense, voseo, tono sobrio. Nada de publicidad.
- MÁXIMO 120 PALABRAS EN TOTAL. Contalas.

Escribí solamente el texto, sin introducción ni comentarios.`;
}

/** Recorta sin partir una palabra al medio. */
function recortar(t: string, max: number): string {
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const i = corte.lastIndexOf(" ");
  return (i > max * 0.6 ? corte.slice(0, i) : corte).trimEnd();
}

/**
 * Saca el andamiaje de markdown que el modelo mete aunque se le pida que no, y aplica el tope.
 * Sin esto, un `## El barrio` se imprime literal en un PDF de lujo.
 */
export function sanearRelato(texto: string): string {
  const limpio = (texto || "")
    .replace(/^#{1,6}\s+.*$/gm, "")            // encabezados
    .replace(/\*\*(.+?)\*\*/g, "$1")           // negritas
    .replace(/(^|[\s(])\*(\S[^*]*?)\*/g, "$1$2") // cursivas (sin tocar un * suelto)
    .replace(/^\s*[-*•]\s+/gm, "")             // viñetas
    .replace(/\n{3,}/g, "\n\n")                // saltos de más
    .trim();
  return recortar(limpio, MAX_RELATO);
}

/**
 * Genera el relato. Devuelve cadena vacía si algo falla: la hoja se puede armar sin texto (el
 * asesor lo escribe a mano si quiere), pero NUNCA se cae la creación de la ficha por esto.
 */
export async function generarRelato(datos: DatosRelato): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // Mismo modelo que ya usa el ACM para analizar fotos.
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: {
        // Temperatura baja: acá no queremos creatividad, queremos que se ciña a la lista.
        temperature: 0.4,
        maxOutputTokens: 1200,
        // EL PENSAMIENTO SE COME EL PRESUPUESTO DE SALIDA. Medido: con el pensamiento
        // encendido y 2.000 tokens de tope, 1.917 se los llevó el razonamiento y quedaron 79
        // para el texto — el párrafo salía cortado a mitad de frase con finishReason
        // MAX_TOKENS. Para narrar una lista de hechos ya calculados, razonar no aporta nada:
        // apagarlo arregla el corte, sale más rápido y sale más barato.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const r = await model.generateContent(construirPromptZona(datos));
    return sanearRelato(r.response.text());
  } catch (e) {
    console.error("ACM zona: no se pudo generar el relato:", e);
    return "";
  }
}
