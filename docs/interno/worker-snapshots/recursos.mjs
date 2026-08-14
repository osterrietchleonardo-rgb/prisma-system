// Banco de recursos + memoria de piezas, contra Supabase. El cliente `db` se
// recibe por parámetro (lo crea watch.mjs), no se importa.
import { CANON_FALLBACK, momentoDeEtapa, estructurasCompatibles } from "./voz.mjs";

/** Orden determinista: menos usados primero; a igual uso, el que hace más tiempo no se usa. */
function ordenar(a, b) {
  if (a.usos !== b.usos) return a.usos - b.usos;
  const ta = a.ultimo_uso ? Date.parse(a.ultimo_uso) : 0;
  const tb = b.ultimo_uso ? Date.parse(b.ultimo_uso) : 0;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

/** Si al excluir no queda ninguno, recicla los menos usados: nunca bloquea la generación. */
export function elegirRecursos(candidatos, cantidad, excluirIds) {
  if (!candidatos.length) return [];
  const excluir = new Set(excluirIds);
  const frescos = candidatos.filter((c) => !excluir.has(c.id));
  const pool = frescos.length ? frescos : candidatos;
  return [...pool].sort(ordenar).slice(0, cantidad);
}

/**
 * Elige 2 escenas: la PRIMERA del momento que pide la etapa del embudo, la SEGUNDA libre.
 * Eso da contraste narrativo (por ejemplo dolor -> resuelto en una pieza BOFU) en vez de
 * dos escenas del mismo tono.
 *
 * Ningun filtro bloquea. Si no hay escenas del momento pedido, las dos salen libres; si
 * el area del cluster no tiene, entran las de otras areas. Es el mismo criterio de
 * elegirRecursos, que recicla en vez de devolver vacio.
 */
export function elegirEscenas(escenas, { momento, areas = [], excluirIds = [] }) {
  if (!escenas.length) return [];
  const afin = (e) => areas.length > 0 && areas.includes(e.area);
  // Las del area del cluster primero y el resto despues; dentro de cada grupo, la
  // rotacion de siempre (menos usadas primero).
  const porAfinidad = (lista) => [
    ...elegirRecursos(lista.filter(afin), lista.length, excluirIds),
    ...elegirRecursos(lista.filter((e) => !afin(e)), lista.length, excluirIds),
  ];

  const delMomento = porAfinidad(escenas.filter((e) => e.momento === momento));
  const primera = delMomento[0] ?? elegirRecursos(escenas, 1, excluirIds)[0] ?? null;
  if (!primera) return [];

  const segunda = porAfinidad(escenas.filter((e) => e.id !== primera.id))[0] ?? null;
  return segunda ? [primera, segunda] : [primera];
}

export async function traerRecursos(db, tipo) {
  const { data, error } = await db
    .from("marketing_recursos")
    .select("id, tipo, clave, titulo, detalle, usos, ultimo_uso, area, momento, propositos")
    .eq("tipo", tipo)
    .eq("activo", true);
  if (error) throw new Error(`traerRecursos(${tipo}): ${error.message}`);
  return data ?? [];
}

export async function marcarUsados(db, ids) {
  if (!ids.length) return;
  const { data, error } = await db.from("marketing_recursos").select("id, usos").in("id", ids);
  if (error) {
    // No tiramos: una pieza ya escrita no debe morir porque no se pudo actualizar un contador.
    // Pero tiene que verse: si falla en silencio, la rotacion deja de avanzar y el generador
    // vuelve a repetir estructuras y escenas sin dejar rastro.
    console.error(`marcarUsados(leer): ${error.message}`);
    return;
  }
  const ahora = new Date().toISOString();
  const fallidos = [];
  for (const fila of data ?? []) {
    const { error: errUpdate } = await db
      .from("marketing_recursos")
      .update({ usos: fila.usos + 1, ultimo_uso: ahora })
      .eq("id", fila.id);
    if (errUpdate) fallidos.push(fila.id);
  }
  if (fallidos.length > 0) {
    console.error(`marcarUsados(escribir): fallaron ${fallidos.length}/${(data ?? []).length} recursos: ${fallidos.join(", ")}`);
  }
}

/** El canon vive en la base para poder editarlo sin deploy. Falla suave al fallback. */
export async function canonDeVoz(db) {
  try {
    const filas = await traerRecursos(db, "canon");
    return (filas[0]?.detalle || "").trim() || CANON_FALLBACK;
  } catch {
    return CANON_FALLBACK;
  }
}

/**
 * Arma la receta de una pieza: canon + proposito + estructura + 2 escenas + tipo de comentario.
 * `previas` son las piezas recientes, para no repetir proposito, estructura ni escena.
 *
 * `ctx`:
 *   - `estructura`: la que la idea ya trae elegida. MANDA solo si es compatible con el
 *     proposito; si no lo es, gana el proposito. El prompt tiene que llevar una sola forma
 *     coherente: un cruce incoherente (ej. "enseña un framework" + "escribi una confesion")
 *     se paga en un reintento, que es una llamada paga.
 *   - `proposito`: el de la idea. Si no viene, se sortea con la rotacion de siempre.
 *   - `funnel`: define el momento de la primera escena (tofu->dolor, mofu->intento_fallido,
 *     bofu->resuelto).
 *   - `areas`: las areas afines al cluster de la pieza; sesgan el orden, no excluyen.
 */
export async function recetaParaIdea(db, previas, ctx = {}) {
  const {
    estructura: claveEstructura = null,
    proposito: claveProposito = null,
    funnel = "mofu",
    areas = [],
  } = ctx;

  const canon = await canonDeVoz(db);
  const [estructuras, escenas, comentarios, propositos] = await Promise.all([
    traerRecursos(db, "estructura"),
    traerRecursos(db, "escena"),
    traerRecursos(db, "comentario"),
    traerRecursos(db, "proposito"),
  ]);

  // --- proposito: el de la idea, o sorteado con la rotacion de siempre ---
  const propositosUsados = propositos
    .filter((p) => previas.map((x) => x.proposito).includes(p.clave))
    .map((p) => p.id);
  const pedidoProp = String(claveProposito ?? "").trim().toLowerCase();
  const proposito = propositos.find((p) => String(p.clave ?? "").toLowerCase() === pedidoProp)
    ?? elegirRecursos(propositos, 1, propositosUsados)[0]
    ?? null;

  // --- estructura: dentro de las compatibles con el proposito ---
  const candidatas = estructurasCompatibles(estructuras, proposito?.clave ?? null);
  const estructurasUsadas = previas.map((p) => p.estructura).filter(Boolean);
  const idsEstructurasUsadas = candidatas.filter((e) => estructurasUsadas.includes(e.clave)).map((e) => e.id);

  const pedida = String(claveEstructura ?? "").trim().toLowerCase();
  const deLaIdea = pedida ? candidatas.find((e) => String(e.clave ?? "").toLowerCase() === pedida) : null;
  if (pedida && !deLaIdea) {
    console.error(
      `recetaParaIdea: la estructura "${pedida}" no es compatible con el proposito "${proposito?.clave ?? "(ninguno)"}"; manda el proposito`,
    );
  }
  const estructura = deLaIdea ?? elegirRecursos(candidatas, 1, idsEstructurasUsadas)[0] ?? null;

  // --- escenas: la primera del momento de la etapa, la segunda libre ---
  const elegidas = elegirEscenas(escenas, {
    momento: momentoDeEtapa(funnel),
    areas,
    excluirIds: previas.flatMap((p) => p.escenas ?? []),
  });
  const comentario = elegirRecursos(comentarios, 1, [])[0] ?? null;

  await marcarUsados(
    db,
    [estructura?.id, comentario?.id, proposito?.id, ...elegidas.map((e) => e.id)].filter(Boolean),
  );

  // `estructura` y `proposito` pueden ser null si el banco está vacío. watch.mjs convierte este
  // objeto a la forma persistida (claves string, escenas como ids) antes de guardarlo.
  return {
    canon,
    estructura,
    escenas: elegidas,
    comentarioTipo: comentario?.clave ?? "dato_crudo",
    comentarioDetalle: comentario?.detalle ?? null,
    proposito,
  };
}

// ---------- memoria de piezas ya escritas ----------

const primeraLinea = (texto) => (texto || "").split("\n").map((l) => l.trim()).find((l) => l) ?? "";

/**
 * Extrae clave string de un recurso, manejando ambas formas: en-memoria (objeto con .clave) o persistida (string directo).
 * Devuelve null si no puede extraer, nunca [object Object].
 */
const clave = (x) => (typeof x === "string" ? x : x?.clave ?? null);

/**
 * Extrae id string de un recurso, manejando ambas formas: en-memoria (objeto con .id) o persistida (string directo).
 * Devuelve null si no puede extraer.
 */
const idDe = (x) => (typeof x === "string" ? x : x?.id ?? null);

/**
 * Resume una pieza escrita para la memoria del prompt.
 * `receta` debe ser la forma PERSISTIDA (estructura: "clave", escenas: ["id", "id"]),
 * que lee textosRecientes de marketing_ideas.receta (jsonb).
 * `watch.mjs` es responsable de mapear el objeto retornado por recetaParaIdea a esta forma
 * antes de guardar.
 *
 * Si `receta` viene con la forma en-memoria (objetos), se degrada sin producir [object Object].
 */
export function resumirPieza(contenido, receta) {
  const texto = (contenido || "").trim();
  const estructura = clave(receta?.estructura);
  const escenas = (receta?.escenas ?? []).map(idDe).filter((x) => x !== null);
  return {
    hook: primeraLinea(texto),
    entrada: texto.slice(0, 400),
    estructura,
    // Sin esto la rotacion de propositos no avanza: recetaParaIdea excluye los ya
    // usados leyendo justamente este campo.
    proposito: clave(receta?.proposito),
    escenas,
  };
}

/** Bloque de memoria que se inyecta al prompt. "" si no hay nada que recordar. */
export function formatearMemoria(piezas) {
  if (!piezas.length) return "";
  const items = piezas.map((p, i) => {
    const partes = [
      p.estructura ? `estructura: ${p.estructura}` : "",
      p.proposito ? `proposito: ${p.proposito}` : "",
    ].filter(Boolean);
    const marca = partes.length ? ` [${partes.join(" · ")}]` : "";
    return `${i + 1}.${marca}\n   APERTURA: ${p.hook}\n   ENTRADA: ${p.entrada}`;
  });
  return [
    "PIEZAS QUE YA ESCRIBISTE. No repitas la apertura, el argumento central, la escena ni la estructura de ninguna de éstas:",
    ...items,
  ].join("\n\n");
}

/**
 * Territorio de la pieza. Devuelve null (y no tira) si la idea no tiene cluster o si la
 * tabla no responde: sin territorio el articulo se escribe igual, solo que sin enlazar al pilar.
 */
export async function traerCluster(db, clave) {
  if (!clave) return null;
  const { data, error } = await db
    .from("marketing_clusters")
    .select("clave, titulo, keyword_pilar, url_pilar, areas")
    .eq("clave", clave)
    .maybeSingle();
  if (error) {
    console.error(`traerCluster(${clave}): ${error.message}`);
    return null;
  }
  return data ?? null;
}

/**
 * Articulos de blog ya publicados, para que el nuevo pueda enlazarlos.
 * La url vive en `publicado_en->blogUrl` (la deja publisher.ts al publicar); las piezas
 * sin url se saltean, porque un enlace roto es peor que no enlazar.
 */
export async function articulosPublicados(db, limite = 8) {
  const { data, error } = await db
    .from("marketing_ideas")
    .select("titulo, publicado_en")
    .eq("estado", "publicada")
    .eq("fuente", "blog")
    .order("updated_at", { ascending: false })
    .limit(limite);
  if (error) {
    console.error(`articulosPublicados: ${error.message}`);
    return [];
  }
  return (data ?? [])
    .map((f) => ({ titulo: f.titulo, url: f.publicado_en?.blogUrl ?? null }))
    .filter((a) => typeof a.url === "string" && a.url.startsWith("http"));
}

export async function textosRecientes(db, limite = 15) {
  const { data, error } = await db
    .from("marketing_ideas")
    .select("contenido, receta")
    .not("contenido", "is", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`textosRecientes: ${error.message}`);
  return (data ?? [])
    .filter((f) => (f.contenido || "").trim().length > 0)
    .map((f) => resumirPieza(f.contenido, f.receta));
}
