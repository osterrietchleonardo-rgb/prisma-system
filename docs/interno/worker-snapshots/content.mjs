// content.mjs — generacion de contenido con Claude (voz de Vakdor).
// Separado de watch.mjs para poder testear los prompts sin arrancar el loop del worker.
// Cada funcion recibe el cliente `anthropic` para no depender del entorno del worker.
import Anthropic from "@anthropic-ai/sdk";
import { skillCopywriter, skillCarousel, skillLeadMagnet } from "./skills.mjs";
import { instruccionCta, instruccionComentario } from "./voz.mjs";

export const MODELO = "claude-sonnet-5";
// Techo real de salida de Sonnet 5 para este worker. El thinking adaptivo sale del mismo
// presupuesto que el texto, asi que el default y todo call site usan el techo, no un numero
// "razonable" mas chico: un limite pensado solo para el texto visible trunca el JSON (ya paso
// con el magnet). Espejo de MAX_TOKENS_TECHO del lado app.
const MAX_TOKENS_TECHO = 8000;

export const BRAND_SYSTEM = `Sos el copywriter estrategico de Vakdor. Vendes PRISMA (Sistema Operativo para inmobiliarias: Tokko + WhatsApp + IA). Target LinkedIn: IPC2 (director con +30 asesores).
EJE CLAVE (aterriza SIEMPRE en el Resultado): Vehiculo (integracion total, Vakdor=partner) -> Mecanismo (sistematizar conocimiento y procesos, Metodo P-R-I-S-M-A) -> Resultado (eliminar la dependencia operativa: control total y trazabilidad). Al director no le interesa el software, le interesa recuperar el control.
3 Fracturas: Hemorragia de oportunidades, Anarquia comercial, Ceguera de gobernanza.
FORMATO (inquebrantable): 2a persona (vos/tu agencia/tenes); parrafos de 2-3 lineas con linea en blanco; CERO emojis; vinetas con "•"; sin links en el cuerpo; LinkedIn = ultracualificacion (hook con calificador, posicion fuerte, CTA que no ruega).`;

/** OJO: Sonnet 5 devuelve bloques `thinking` ademas de `text`. */
function extraerTexto(content) {
  return content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("").trim();
}

async function llamar(client, system, user, { maxTokens = MAX_TOKENS_TECHO, effort, cachearSystem = true } = {}) {
  const bloque = { type: "text", text: system };
  if (cachearSystem) bloque.cache_control = { type: "ephemeral" };
  const params = {
    model: MODELO,
    max_tokens: Math.min(maxTokens, MAX_TOKENS_TECHO),
    thinking: { type: "adaptive" },
    system: [bloque],
    messages: [{ role: "user", content: user }],
  };
  if (effort) params.output_config = { effort };
  const res = await client.messages.create(params);
  // `stop_reason: "max_tokens"` = la respuesta viene cortada a la mitad. En los caminos que
  // parsean JSON eso explota solo (JSON.parse tira), pero en los de texto crudo (la reescritura
  // de revisar()) una pieza a medio escribir NO es falsy y pisaba en silencio a una completa.
  // Tratarlo como fallo de la llamada: el develop marca la idea, la revisión conserva el original.
  if (res.stop_reason === "max_tokens") {
    throw new Error(`respuesta truncada por max_tokens (${params.max_tokens}): el thinking adaptivo consumió el presupuesto de salida`);
  }
  return extraerTexto(res.content);
}

/** Cierre parcial para pasarle a revisar() de revision.mjs. */
export function llamador(client, system) {
  // maxTokens al techo (MAX_TOKENS_TECHO): la reescritura de revisar() regenera la pieza entera
  // (1500-2500 car) bajo el mismo thinking adaptivo que ya truncó el magnet. max_tokens es un
  // techo, no una asignacion: el veredicto (JSON chico) no gasta ese margen de mas.
  return (prompt) => llamar(client, system, prompt, { maxTokens: MAX_TOKENS_TECHO });
}

export function extraerJson(txt) {
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("respuesta IA sin JSON");
  return JSON.parse(m[0]);
}

/** Reemplaza a la plantilla unica: la forma la da la estructura sorteada, no un molde fijo. */
function bloqueVoz(ctx, etapa) {
  const { canon, estructura, escenas, comentarioTipo, comentarioDetalle, proposito } = ctx.receta;
  return [
    `CANON DE VOZ (inquebrantable):\n${canon}`,
    // El proposito va ANTES de la estructura y dice explicitamente que no define la forma.
    // Son ejes distintos: el proposito es el PARA QUE, la estructura es el COMO. Si los dos
    // pidieran forma, el prompt terminaria con dos moldes peleandose (ver comentario abajo).
    proposito ? `PROPÓSITO DE ESTA PIEZA — ${proposito.titulo}:\n${proposito.detalle}\nEsto define QUÉ buscás lograr y con qué evidencia. La FORMA de escribirlo la da la ESTRUCTURA de abajo, no este bloque.` : "",
    estructura ? `ESTRUCTURA DE ESTA PIEZA — ${estructura.titulo}:\n${estructura.detalle}\nEscribí SIGUIENDO esta forma. No uses el molde hook/fricción/quiebre/solución/prueba/CTA.` : "",
    escenas.length ? `ESCENAS DEL RUBRO PARA APOYARTE (usá al menos una, desarrollada con detalle propio):\n${escenas.map((e) => `- ${e.titulo}: ${e.detalle}`).join("\n")}` : "",
    instruccionCta(etapa),
    instruccionComentario(comentarioTipo, etapa, comentarioDetalle),
    `EXTENSIÓN: 1500-2500 caracteres, líneas cortas con mucho aire.`,
  ].filter(Boolean).join("\n\n");
}

// Bloque de insights reales (Buffer) para inyectar en el prompt (o "" si no hay).
function bloqueInsights(insights) {
  return insights ? `DATOS REALES DE RENDIMIENTO (usalos para decidir angulo/hook, no inventes):\n${insights}` : "";
}

// OJO: acá NO va la estructura. La forma narrativa la dicta UNA sola instrucción, la de
// `bloqueVoz` ("ESTRUCTURA DE ESTA PIEZA"), que ya honra `idea.estructura` vía recetaParaIdea.
// Antes se inyectaban las dos y podían pedir formas distintas en el mismo prompt.
function briefIdea(idea) {
  return `Pieza: fuente=${idea.fuente}, formato=${idea.formato}. Titulo: ${idea.titulo}. Angulo: ${idea.angulo ?? ""}. Gancho: ${idea.gancho ?? ""}. Brief: ${JSON.stringify(idea.brief ?? {})}.`;
}

// Si la idea ya tiene descripcion (contenido) o una indicacion de reformular (comentario),
// se lo pasamos al prompt para que las slides/PDF se alineen a eso (regeneracion tras reformular).
function ajusteIdea(idea) {
  const c = (idea.contenido ?? "").trim();
  const r = (idea.comentario ?? "").trim();
  if (!c && !r) return "";
  return [
    "AJUSTE (respetalo): ya hay material definido para esta pieza.",
    c ? `Descripcion/posteo actual:\n${c}` : "",
    r ? `Indicacion del director para reformular: ${r}` : "",
    "Alinea las slides/el PDF y la descripcion a esto.",
  ].filter(Boolean).join("\n");
}

// ---------- contenido base (post o articulo de blog) ----------
export async function desarrollar(client, idea, ctx) {
  const esBlog = idea.fuente === "blog";
  const etapa = idea.funnel ?? "mofu";
  const user = [
    briefIdea(idea),
    bloqueVoz(ctx, etapa),
    ctx.memoria || "",
    bloqueInsights(ctx.insights),
    `Escribí el contenido COMPLETO. Segunda persona, párrafos de 2-3 líneas, cero emojis, viñetas con •, sin links en el cuerpo.`,
    // Enlazado interno: solo aplica al articulo de la web. En LinkedIn los links bajan el
    // alcance y por eso el cuerpo NUNCA lleva ninguno.
    esBlog && ctx.enlaces?.length
      ? `ARTÍCULOS YA PUBLICADOS (enlazá 2 o 3 de forma contextual con markdown [texto](url), solo donde venga a cuento; NUNCA una lista de "leé también" al final):\n${ctx.enlaces.map((a) => `- ${a.titulo}: ${a.url}`).join("\n")}`
      : "",
    esBlog && ctx.pilar
      ? `PÁGINA PILAR DE ESTE TERRITORIO: ${ctx.pilar.url} (búsqueda pilar: "${ctx.pilar.keyword}"). Enlazala UNA vez, con texto de ancla natural.`
      : "",
    esBlog && idea.keyword_objetivo
      ? `KEYWORD OBJETIVO: "${idea.keyword_objetivo}". Tiene que aparecer en el title, en el H1, y la pregunta que implica tiene que quedar respondida dentro de las primeras 100 palabras. No la fuerces: si queda antinatural, reformulá la frase alrededor.`
      : "",
    esBlog
      ? `Para un artículo de blog generás DOS cosas: (1) el ARTÍCULO para la web y (2) su VERSIÓN LinkedIn.
- El ARTÍCULO (campo "contenido") es para la web (Markdown, estructura de blog).
- El post de LinkedIn (campo "linkedin_post") sigue la ESTRUCTURA DE ESTA PIEZA de arriba y LLEVA LA SUSTANCIA del artículo (su argumento central desarrollado, no un teaser vacío ni el markdown copiado). SIN links, SIN "leé el artículo" ni derivar a la web: es una pieza completa por sí misma.
Devolvé SOLO JSON: {"contenido":"<artículo en Markdown: ## H2, ### H3, intro que responde en 100 palabras, un H2 de respuesta directa (TL;DR), 3-6 H2, FAQ con H3=pregunta>","blog":{"title":"<=60 car keyword al inicio","slug":"kebab","meta_description":"<=155 car dolor+solución+CTA","seo_keywords":["principal","2-4 secundarias"],"read_time_minutes":<palabras/200>,"linkedin_post":"<el post siguiendo la ESTRUCTURA, 1500-2500 car, sin links>","linkedin_primer_comentario":"<seguí la instrucción de PRIMER COMENTARIO de arriba>","linkedin_hashtags":["#...", 3 a 5]}}`
      : `Devolvé SOLO JSON: {"contenido":"<el post de LinkedIn COMPLETO siguiendo la ESTRUCTURA DE ESTA PIEZA, 1500-2500 car, con saltos de línea>","primer_comentario":"<seguí la instrucción de PRIMER COMENTARIO de arriba>","hashtags":["#...", 3 a 5]}`,
    `Devolvé SOLO el JSON, sin texto extra ni fences.`,
  ].filter(Boolean).join("\n\n");
  // maxTokens al techo (MAX_TOKENS_TECHO): el thinking adaptivo de Sonnet 5 consume una parte
  // variable del presupuesto de salida (medido hasta ~4900 tokens de thinking en pruebas), y con
  // menos el JSON del articulo+post de LinkedIn quedaba cortado a mitad de camino.
  const d = extraerJson(await llamar(client, BRAND_SYSTEM + "\n\n" + skillCopywriter(), user, { maxTokens: MAX_TOKENS_TECHO }));
  // El JSON puede parsear perfecto con "contenido":"" — sin esta guarda la idea queda en
  // "en_revision" sin post/articulo y nada lo señala.
  if (!d.contenido?.trim()) throw new Error("desarrollar: contenido vacío");
  return d;
}

// ---------- carrusel (caption + slides) ----------
export async function desarrollarCarrusel(client, idea, ctx) {
  const etapa = idea.funnel ?? "mofu";
  const user = [
    briefIdea(idea),
    bloqueVoz(ctx, etapa),
    ctx.memoria || "",
    bloqueInsights(ctx.insights),
    ajusteIdea(idea),
    `Arma un CARRUSEL de Vakdor (5 a 8 slides) + su DESCRIPCION de posteo. Al pie del copywriter (Resultado, 2a persona, sin emojis).
SLIDES: una idea por slide.
- Slide 1 = PORTADA: gancho fuerte con calificador, sin bullets ni parrafo largo.
- Slides intermedias: UN concepto cada una. O un "parrafo" corto (1-2 frases) O 2-4 "bullets", NUNCA ambos.
- Ultima slide = cierre + CTA.
- Titulos cortos (<= 6 palabras). Bullets cortos.
DESCRIPCION ("contenido"): es el POST de LinkedIn que acompaña al carrusel — seguí la ESTRUCTURA DE ESTA PIEZA de arriba. NO es un pie de foto. El cierre puede invitar a deslizar el carrusel. Sin links.`,
    `Devolvé SOLO JSON: {"contenido":"<la descripcion del posteo: hook + storytelling + cierre, con saltos de linea>","slides":[{"eyebrow":"<opcional, 1-3 palabras>","title":"<titulo corto>","parrafo":"<opcional>","bullets":["<opcional>"],"cta":"<solo en la ultima: cierre acorde a la etapa del embudo>"}],"primer_comentario":"<seguí la instrucción de PRIMER COMENTARIO de arriba; el link a vakdor.com va aca si corresponde>","hashtags":["#...", 3 a 5]}`,
    `Devolvé SOLO el JSON, sin texto extra ni fences.`,
  ].filter(Boolean).join("\n\n");
  const d = extraerJson(await llamar(client, BRAND_SYSTEM + "\n\n" + skillCopywriter() + "\n\n" + skillCarousel(), user, { maxTokens: MAX_TOKENS_TECHO }));
  // El JSON puede parsear perfecto con "contenido":"" junto a slides bien formadas — sin esta
  // guarda el carrusel se sube completo y la idea queda sin caption de LinkedIn.
  if (!d.contenido?.trim()) throw new Error("desarrollarCarrusel: contenido vacío");
  if (!Array.isArray(d.slides) || d.slides.length === 0) throw new Error("carrusel sin slides");
  // El CTA final depende de la etapa del embudo (bloqueVoz); si el modelo lo omite, no hay
  // fallback seguro que inventar acá — mejor fallar la generación que dejar pasar un CTA
  // equivocado (ver render.mjs, que ya no rellena con el string viejo hardcodeado).
  if (!d.slides[d.slides.length - 1]?.cta?.trim()) throw new Error("carrusel: la ultima slide no tiene cta");
  return d;
}

// ---------- lead magnet (caption + markdown del PDF) ----------
export async function desarrollarMagnet(client, idea, ctx) {
  const etapa = idea.funnel ?? "mofu";
  const user = [
    briefIdea(idea),
    bloqueVoz(ctx, etapa),
    ctx.memoria || "",
    bloqueInsights(ctx.insights),
    ajusteIdea(idea),
    `Arma un LEAD MAGNET de Vakdor como HERRAMIENTA (no articulo) + la DESCRIPCION del posteo que lo ofrece. Arquetipo por defecto: Scorecard / autoauditoria (M1).
El magnet comparte el MISMO dolor y el MISMO calificador de ICP que la pieza. Densidad de ICP, no volumen.
Anatomia FIJA del Markdown (en este orden, con ## por seccion):
1. Quick win inmediato (valor en los primeros 60s).
2. La herramienta: scorecard/checklist/calculadora para USAR — tabla Markdown con casillas "[ ]" y/o campos en blanco para completar.
3. Prueba intercalada (un numero real o mini-caso).
4. La revelacion del gap (uh-oh): sin culpa, el resultado completo requiere sistema/tiempo/expertise.
5. CTA calificador de diagnostico/aplicacion (NO ruego).
Sin emojis. 2a persona. Tablas Markdown reales.`,
    `La DESCRIPCION ("contenido") es el posteo que OFRECE el magnet — seguí la ESTRUCTURA DE ESTA PIEZA de arriba. Sin links (van en el primer comentario).`,
    `Devolvé SOLO JSON: {"contenido":"<la descripcion del posteo: hook + storytelling + cierre, sin links>","kicker":"Lead Magnet","title":"<promesa especifica <=60 car>","subtitle":"Para directores de inmobiliarias con +30 asesores","markdown":"<el magnet COMPLETO en Markdown siguiendo la anatomia fija>","primer_comentario":"<seguí la instrucción de PRIMER COMENTARIO de arriba; el link a vakdor.com va aca si corresponde>","hashtags":["#...", 3 a 5]}`,
    `Devolvé SOLO el JSON, sin texto extra ni fences.`,
  ].filter(Boolean).join("\n\n");
  const d = extraerJson(await llamar(client, BRAND_SYSTEM + "\n\n" + skillCopywriter() + "\n\n" + skillLeadMagnet(), user, { maxTokens: MAX_TOKENS_TECHO }));
  // El JSON puede parsear perfecto con "contenido":"" junto a un markdown bien formado — sin
  // esta guarda el magnet se sube completo y la idea queda sin caption que lo ofrezca.
  if (!d.contenido?.trim()) throw new Error("desarrollarMagnet: contenido vacío");
  if (!d.markdown || d.markdown.length < 200) throw new Error("magnet sin markdown");
  return d;
}
