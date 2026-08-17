import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirRecursos, resumirPieza, formatearMemoria, recetaParaIdea } from "./recursos.mjs";
import { chequeosLocales, parsearVeredicto, revisar, limpiarComillasEnvolventes, reescrituraUsable, chequeoCta } from "./revision.mjs";

/** Pieza de referencia: lo bastante larga como para que el piso del 60% tenga sentido. */
const PIEZA = "Te escribe un lunes a las once de la noche por un tres ambientes en Belgrano.\n\nY el asesor contesta el martes al mediodia, cuando el lead ya visito otras dos.";

const r = (id, usos, ultimo_uso) => ({ id, tipo: "escena", clave: null, titulo: `t-${id}`, detalle: `d-${id}`, usos, ultimo_uso });

test("elegirRecursos prioriza el menos usado", () => {
  assert.deepEqual(elegirRecursos([r("a", 5, null), r("b", 1, null)], 1, []).map((x) => x.id), ["b"]);
});

test("elegirRecursos recicla si al excluir no queda ninguno", () => {
  assert.deepEqual(elegirRecursos([r("a", 7, null), r("b", 2, null)], 1, ["a", "b"]).map((x) => x.id), ["b"]);
});

test("chequeosLocales marca la apertura repetida", () => {
  const fallos = chequeosLocales("El lead entró un sábado a la noche\ncuerpo", ["El lead entro un sabado a la noche"]);
  assert.ok(fallos.some((f) => f.startsWith("5:")));
});

test("chequeosLocales marca muletillas y no marca un texto limpio", () => {
  assert.ok(chequeosLocales("Hoy mas que nunca hay que mover", []).some((f) => f.startsWith("7:")));
  assert.deepEqual(chequeosLocales("Te escribe por un tres ambientes y le mandás un menú.", []), []);
});

test("parsearVeredicto lee el JSON aunque venga con texto alrededor", () => {
  assert.deepEqual(parsearVeredicto('bla {"aprobado": false, "fallos": ["1: abre con tesis"]} chau'),
    { aprobado: false, fallos: ["1: abre con tesis"] });
});

test("parsearVeredicto con basura aprueba (falla suave, no bloquea la pieza)", () => {
  assert.deepEqual(parsearVeredicto("no hay json aca"), { aprobado: true, fallos: [] });
});

test("revisar no reescribe si aprueba y no hay fallos locales", async () => {
  const llamar = async () => '{"aprobado": true, "fallos": []}';
  const out = await revisar(llamar, "Te escribe un sábado a la noche.\ncuerpo", "tofu", []);
  assert.equal(out.reintentos, 0);
  assert.equal(out.aprobado, true);
  assert.ok(out.texto.startsWith("Te escribe"));
});

test("revisar reescribe UNA sola vez cuando hay fallos", async () => {
  // La reescritura tiene que superar el piso del 60% del original, si no se descarta.
  const CORREGIDA = "Entra un lead un sabado a las diez de la noche por un dos ambientes.\n\nY nadie contesta hasta el lunes.";
  let n = 0;
  const llamar = async () => { n++; return n === 1 ? '{"aprobado": false, "fallos": ["1: abre con tesis"]}' : CORREGIDA; };
  const out = await revisar(llamar, "La sistematizacion es clave.\ncuerpo", "mofu", []);
  assert.equal(out.reintentos, 1);
  assert.equal(out.texto, CORREGIDA);
  assert.equal(out.reescrituraDescartada, false);
  assert.equal(n, 2);
});

// ---------- C1: la reescritura NO pisa al original si vuelve rota ----------

test("revisar descarta la reescritura si el saneo la deja vacia (el modelo devolvio solo comillas)", async () => {
  // `"""` no es falsy: sobrevive al `|| texto` y recien limpiarComillasEnvolventes lo vacia.
  let n = 0;
  const llamar = async () => { n++; return n === 1 ? '{"aprobado": false, "fallos": ["1: abre con tesis"]}' : '"""'; };
  const out = await revisar(llamar, PIEZA, "mofu", []);
  assert.equal(out.texto, PIEZA, "tiene que conservar el texto original, no guardar un vacio");
  assert.equal(out.reescrituraDescartada, true);
  assert.equal(out.reintentos, 1);
  assert.equal(out.aprobado, false);
});

test("revisar descarta la reescritura truncada (mucho mas corta que el original)", async () => {
  let n = 0;
  const llamar = async () => { n++; return n === 1 ? '{"aprobado": false, "fallos": ["1: abre con tesis"]}' : "Te escribe un lunes a las on"; };
  const out = await revisar(llamar, PIEZA, "bofu", []);
  assert.equal(out.texto, PIEZA, "una pieza cortada a la mitad no debe pisar a una completa");
  assert.equal(out.reescrituraDescartada, true);
});

test("revisar conserva el original si la llamada de reescritura tira (p.ej. max_tokens)", async () => {
  let n = 0;
  const llamar = async () => {
    n++;
    if (n === 1) return '{"aprobado": false, "fallos": ["1: abre con tesis"]}';
    throw new Error("respuesta truncada por max_tokens (8000)");
  };
  const out = await revisar(llamar, PIEZA, "tofu", []);
  assert.equal(out.texto, PIEZA);
  assert.equal(out.reescrituraDescartada, true);
});

test("reescrituraUsable acepta una reescritura algo mas corta pero razonable", () => {
  const original = "x".repeat(2000);
  assert.equal(reescrituraUsable(original, "y".repeat(1400)).usable, true);
  assert.equal(reescrituraUsable(original, "y".repeat(1100)).usable, false);
  assert.equal(reescrituraUsable(original, "   ").usable, false);
});

// ---------- I1: la regla de CTA por etapa, chequeada de forma determinista ----------

test("chequeoCta: BOFU exige el link en el comentario y lo prohibe en el cuerpo", () => {
  const cuerpoOk = "Lo mostre entero en el video de la demostracion.";
  const comentarioOk = "Un numero crudo.\n\nhttps://vakdor.com/demostracion";
  assert.deepEqual(chequeoCta("bofu", cuerpoOk, comentarioOk), []);

  const conLinkEnCuerpo = chequeoCta("bofu", `${cuerpoOk} https://vakdor.com/demostracion`, comentarioOk);
  assert.equal(conLinkEnCuerpo.length, 1);
  assert.ok(conLinkEnCuerpo[0].startsWith("6:"));
  assert.ok(/cuerpo/i.test(conLinkEnCuerpo[0]));

  const sinLinkEnComentario = chequeoCta("bofu", cuerpoOk, "Un numero crudo, sin nada mas.");
  assert.equal(sinLinkEnComentario.length, 1);
  assert.ok(/primer comentario/i.test(sinLinkEnComentario[0]));
  // El fallo alimenta la reescritura del CUERPO: tiene que decir que no meta el link ahi.
  assert.ok(/NO agregues el link al cuerpo/.test(sinLinkEnComentario[0]));
});

test("chequeoCta: TOFU y MOFU no llevan link en ningun lado", () => {
  assert.deepEqual(chequeoCta("tofu", "Cuerpo limpio.", "Comentario limpio."), []);
  assert.equal(chequeoCta("tofu", "Cuerpo limpio.", "Mira vakdor.com/demostracion").length, 1);
  assert.equal(chequeoCta("mofu", "Entra a vakdor.com", "Comentario limpio.").length, 1);
  assert.equal(chequeoCta("mofu", "Entra a vakdor.com", "y vakdor.com tambien").length, 2);
});

test("chequeoCta: sin primer comentario juzga solo el cuerpo (no inventa fallos)", () => {
  assert.deepEqual(chequeoCta("bofu", "Cuerpo sin link.", undefined), []);
  assert.deepEqual(chequeoCta("bofu", "Cuerpo sin link.", "   "), []);
  assert.deepEqual(chequeoCta("tofu", "Cuerpo sin link.", null), []);
});

test("revisar suma el fallo de CTA a los de la rubrica y dispara la reescritura", async () => {
  let promptDeReescritura = "";
  let n = 0;
  const CORREGIDA = "Entra un lead un sabado a las diez de la noche por un dos ambientes en Nunez.\n\nY nadie contesta hasta el lunes al mediodia.";
  const llamar = async (p) => {
    n++;
    if (n === 1) return '{"aprobado": true, "fallos": []}';
    promptDeReescritura = p;
    return CORREGIDA;
  };
  // Cuerpo BOFU con el link adentro: la rubrica aprueba, el chequeo determinista no.
  const out = await revisar(llamar, `${PIEZA}\n\nEntra a https://vakdor.com/demostracion`, "bofu", [], "comentario con https://vakdor.com/demostracion");
  assert.equal(out.reintentos, 1);
  assert.ok(out.fallos.some((f) => f.startsWith("6:")));
  assert.ok(promptDeReescritura.includes("6:"));
});

test("revisar saca las comillas triples que el modelo ecoa al reescribir", async () => {
  let n = 0;
  const llamar = async () => {
    n++;
    return n === 1
      ? '{"aprobado": false, "fallos": ["6: sin CTA"]}'
      : '"""\nEntra un lead un sábado a la noche.\n\nCuerpo con el argumento intacto.\n"""';
  };
  const out = await revisar(llamar, "Un texto cualquiera.\ncuerpo", "bofu", []);
  assert.equal(out.reintentos, 1);
  assert.equal(out.texto, "Entra un lead un sábado a la noche.\n\nCuerpo con el argumento intacto.");
  assert.ok(!out.texto.startsWith('"""'));
  assert.ok(!out.texto.endsWith('"""'));
});

test("limpiarComillasEnvolventes no toca un texto sin comillas envolventes", () => {
  const texto = "Primera línea.\n\nSegunda línea con \"comillas\" internas normales.";
  assert.equal(limpiarComillasEnvolventes(texto), texto);
});

test("limpiarComillasEnvolventes saca comillas triples y blancos pegados al borde", () => {
  const conComillas = '\n"""\n\nHook real.\n\nCuerpo real.\n\n"""\n';
  assert.equal(limpiarComillasEnvolventes(conComillas), "Hook real.\n\nCuerpo real.");
});

// ---------- Pruebas de cobertura: memoria de piezas y exclusión ----------

test("resumirPieza con forma persistida (strings) devuelve estructura y escenas como strings", () => {
  const receta = { estructura: "concesion_vuelta", escenas: ["uuid-1", "uuid-2"], comentarioTipo: "matiz" };
  const resultado = resumirPieza("Te escribe un lunes.\nCuerpo largo", receta);
  assert.equal(resultado.estructura, "concesion_vuelta");
  assert.deepEqual(resultado.escenas, ["uuid-1", "uuid-2"]);
});

test("resumirPieza con forma en-memoria (objetos) degrada sin [object Object]", () => {
  const receta = {
    estructura: { id: "e-1", clave: "concesion_vuelta", titulo: "Cesión" },
    escenas: [{ id: "s-1", clave: "scene-1" }, { id: "s-2", clave: "scene-2" }],
  };
  const resultado = resumirPieza("Contenido\nLargo", receta);
  assert.equal(resultado.estructura, "concesion_vuelta");
  assert.deepEqual(resultado.escenas, ["s-1", "s-2"]);
});

test("formatearMemoria no produce [object Object]", () => {
  const piezas = [
    { hook: "Apertura 1", entrada: "Entrada 1", estructura: "estructura-1", escenas: [] },
    { hook: "Apertura 2", entrada: "Entrada 2", estructura: null, escenas: [] },
  ];
  const memoria = formatearMemoria(piezas);
  assert.ok(!memoria.includes("[object Object]"));
  assert.ok(memoria.includes("estructura-1"));
  assert.ok(memoria.includes("Apertura 1"));
});

test("recetaParaIdea excluye estructuras y escenas de previas", async () => {
  // Stub db con banco donde los items EXCLUIDOS tienen los MENORES usos.
  // Si exclusión falla, ganarían automáticamente. Si funciona, otros items se retornan.
  const stubDb = {
    from: (tabla) => {
      if (tabla === "marketing_recursos") {
        return {
          select: (campos) => ({
            eq: (c1, v1) => ({
              eq: async (c2, v2) => {
                if (v1 === "canon") {
                  return Promise.resolve({ data: [{ id: "canon-id", detalle: "canon-test", usos: 0, ultimo_uso: null }], error: null });
                }
                if (v1 === "estructura") {
                  // exc-1 (excluida) tiene usos: 0 ← GANADOR NATURAL si no se excluye
                  // new-1 tiene usos: 5 ← debe ganador después de exclusión
                  return Promise.resolve({
                    data: [
                      { id: "e-1", clave: "exc-1", usos: 0, ultimo_uso: null },
                      { id: "e-2", clave: "new-1", usos: 5, ultimo_uso: null },
                    ],
                    error: null,
                  });
                }
                if (v1 === "escena") {
                  // s-1 (excluida por id) tiene usos: 0 ← GANADOR NATURAL si no se excluye
                  // s-2, s-3 tienen más usos ← deben ganar después de exclusión
                  return Promise.resolve({
                    data: [
                      { id: "s-1", usos: 0, ultimo_uso: null },
                      { id: "s-2", usos: 4, ultimo_uso: null },
                      { id: "s-3", usos: 5, ultimo_uso: null },
                    ],
                    error: null,
                  });
                }
                if (v1 === "comentario") {
                  return Promise.resolve({
                    data: [{ id: "c-1", clave: "dato_crudo", usos: 0, ultimo_uso: null }],
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: null });
              },
            }),
            in: async () => Promise.resolve({ data: [], error: null }),
          }),
          update: () => ({ eq: async () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    },
  };

  // Previas excluyen: estructura "exc-1" y escena "s-1"
  const previas = [{ estructura: "exc-1", escenas: ["s-1"] }];
  const receta = await recetaParaIdea(stubDb, previas);

  // Si exclusión funciona: estructura debe ser "new-1", NO "exc-1"
  assert.equal(receta.estructura.clave, "new-1", "Exclusión de estructura falla: exc-1 (usos: 0) no debería retornarse");

  // Si exclusión funciona: escenas deben ser s-2 y s-3, NO s-1
  const escenaIds = receta.escenas.map((s) => s.id).sort();
  assert.deepEqual(escenaIds, ["s-2", "s-3"], "Exclusión de escenas falla: s-1 (usos: 0) no debería incluirse");
  assert.ok(!escenaIds.includes("s-1"), "Escena excluida s-1 no debería estar en el resultado");
});

// ---------- I3: una sola instrucción de estructura (la de la idea manda) ----------

/** Stub mínimo de Supabase para recetaParaIdea, con un banco fijo por tipo. */
function stubBanco(porTipo) {
  return {
    from: (tabla) => {
      if (tabla !== "marketing_recursos") return {};
      return {
        select: () => ({
          eq: (c1, tipo) => ({ eq: async () => ({ data: porTipo[tipo] ?? [], error: null }) }),
          in: async () => ({ data: [], error: null }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };
}

const BANCO = {
  canon: [{ id: "canon-id", detalle: "canon-test", usos: 0, ultimo_uso: null }],
  estructura: [
    { id: "e-1", clave: "confesion", usos: 0, ultimo_uso: null, propositos: ["mostrar_detras"] }, // ganaría la rotación
    { id: "e-2", clave: "autopsia", usos: 9, ultimo_uso: null, propositos: ["ensenar"] },
  ],
  escena: [
    { id: "s-1", usos: 0, ultimo_uso: null, area: "ventas", momento: "intento_fallido" },
    { id: "s-2", usos: 1, ultimo_uso: null, area: "equipo", momento: "dolor" },
  ],
  comentario: [{ id: "c-1", clave: "dato_crudo", detalle: "detalle-de-la-base", usos: 0, ultimo_uso: null }],
  proposito: [
    { id: "p-1", clave: "mostrar_detras", usos: 0, ultimo_uso: null },
    { id: "p-2", clave: "ensenar", usos: 4, ultimo_uso: null },
  ],
};

test("recetaParaIdea usa la estructura que trae la idea, no la de la rotacion", async () => {
  const receta = await recetaParaIdea(stubBanco(BANCO), [], { estructura: "autopsia", proposito: "ensenar" });
  assert.equal(receta.estructura.clave, "autopsia", "la estructura de la idea manda sobre la rotación");
});

test("recetaParaIdea cae a la rotacion si la idea no trae estructura o la clave no existe", async () => {
  const conProp = (estructura) => recetaParaIdea(stubBanco(BANCO), [], { estructura, proposito: "mostrar_detras" });
  assert.equal((await conProp(null)).estructura.clave, "confesion");
  assert.equal((await conProp("")).estructura.clave, "confesion");
  assert.equal((await conProp("no_existe")).estructura.clave, "confesion");
});

test("si la estructura de la idea NO es compatible con el proposito, manda el proposito", async () => {
  // "autopsia" solo sirve para "ensenar". Con proposito "mostrar_detras" tiene que ganar
  // la compatible ("confesion"): el prompt no puede llevar dos formas peleandose.
  const receta = await recetaParaIdea(stubBanco(BANCO), [], { estructura: "autopsia", proposito: "mostrar_detras" });
  assert.equal(receta.estructura.clave, "confesion");
});

test("recetaParaIdea sortea el proposito si la idea no lo trae", async () => {
  const receta = await recetaParaIdea(stubBanco(BANCO), [], {});
  // Rotación: gana el menos usado.
  assert.equal(receta.proposito.clave, "mostrar_detras");
});

test("recetaParaIdea devuelve el detalle del comentario para que salga de la base", async () => {
  const receta = await recetaParaIdea(stubBanco(BANCO), [], {});
  assert.equal(receta.comentarioDetalle, "detalle-de-la-base");
});

test("la primera escena sigue el momento de la etapa del embudo", async () => {
  const mofu = await recetaParaIdea(stubBanco(BANCO), [], { funnel: "mofu" });
  assert.equal(mofu.escenas[0].momento, "intento_fallido");
  const tofu = await recetaParaIdea(stubBanco(BANCO), [], { funnel: "tofu" });
  assert.equal(tofu.escenas[0].momento, "dolor");
});
