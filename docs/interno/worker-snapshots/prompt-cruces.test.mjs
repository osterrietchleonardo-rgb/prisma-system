// Verifica el prompt que se le manda a Claude SIN llamar a la API (cliente falso).
// content.mjs recibe el cliente por parametro justamente para poder hacer esto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { desarrollar } from "./content.mjs";

/** Cliente falso: guarda el prompt y devuelve un JSON minimo valido. */
function clienteEspia(captura) {
  return {
    messages: {
      create: async (params) => {
        captura.system = params.system.map((b) => b.text).join("\n");
        captura.user = params.messages[0].content;
        return {
          stop_reason: "end_turn",
          content: [{
            type: "text",
            text: JSON.stringify({
              contenido: "Un lunes a las nueve entra una consulta y nadie la contesta.",
              blog: { title: "T", slug: "t", meta_description: "m" },
            }),
          }],
        };
      },
    },
  };
}

const RECETA_BASE = {
  canon: "canon-de-prueba",
  estructura: { clave: "framework_pasos", titulo: "El metodo en pasos", detalle: "detalle-estructura" },
  escenas: [{ titulo: "Escena A", detalle: "detalle-escena-a" }],
  comentarioTipo: "dato_crudo",
  comentarioDetalle: "detalle-comentario-de-la-base",
  proposito: { clave: "ensenar", titulo: "Educativo", detalle: "detalle-proposito" },
};

const ideaBlog = {
  fuente: "blog", formato: "articulo_blog", funnel: "mofu",
  titulo: "Titulo", angulo: null, gancho: null, brief: {},
  keyword_objetivo: "seguimiento leads inmobiliaria",
};

test("el prompt lleva el proposito y aclara que la forma la da la estructura", async () => {
  const cap = {};
  await desarrollar(clienteEspia(cap), ideaBlog, { receta: RECETA_BASE, insights: "", memoria: "" });
  assert.match(cap.user, /PROPÓSITO DE ESTA PIEZA — Educativo/);
  assert.match(cap.user, /detalle-proposito/);
  // La regla de oro: un solo bloque manda la forma.
  assert.match(cap.user, /La FORMA de escribirlo la da la ESTRUCTURA de abajo, no este bloque/);
  assert.match(cap.user, /ESTRUCTURA DE ESTA PIEZA — El metodo en pasos/);
});

test("el comentario sale del detalle de la base, no del hardcodeado", async () => {
  const cap = {};
  await desarrollar(clienteEspia(cap), ideaBlog, { receta: RECETA_BASE, insights: "", memoria: "" });
  assert.match(cap.user, /detalle-comentario-de-la-base/);
});

test("un articulo de blog con cluster lleva enlaces internos, pilar y keyword", async () => {
  const cap = {};
  await desarrollar(clienteEspia(cap), ideaBlog, {
    receta: RECETA_BASE, insights: "", memoria: "",
    enlaces: [{ titulo: "Articulo viejo", url: "https://www.vakdor.com/blog/viejo" }],
    pilar: { keyword: "leads inmobiliarios", url: "https://www.vakdor.com/leads-inmobiliarios/" },
  });
  assert.match(cap.user, /Articulo viejo: https:\/\/www\.vakdor\.com\/blog\/viejo/);
  assert.match(cap.user, /PÁGINA PILAR DE ESTE TERRITORIO/);
  assert.match(cap.user, /seguimiento leads inmobiliaria/);
});

test("sin cluster ni enlaces el prompt no dice undefined ni pide pilar", async () => {
  const cap = {};
  await desarrollar(clienteEspia(cap), ideaBlog, { receta: RECETA_BASE, insights: "", memoria: "" });
  assert.doesNotMatch(cap.user, /undefined/);
  assert.doesNotMatch(cap.user, /PÁGINA PILAR/);
  assert.doesNotMatch(cap.user, /ARTÍCULOS YA PUBLICADOS/);
});

test("una pieza de LinkedIn NO pide enlaces internos aunque haya", async () => {
  const cap = {};
  const ideaLinkedin = { ...ideaBlog, fuente: "linkedin", formato: "post_texto" };
  await desarrollar(clienteEspia(cap), ideaLinkedin, {
    receta: RECETA_BASE, insights: "", memoria: "",
    enlaces: [{ titulo: "Articulo viejo", url: "https://www.vakdor.com/blog/viejo" }],
    pilar: { keyword: "k", url: "https://www.vakdor.com/p/" },
  });
  // Los links bajan el alcance en LinkedIn: el cuerpo nunca lleva ninguno.
  assert.doesNotMatch(cap.user, /ARTÍCULOS YA PUBLICADOS/);
  assert.doesNotMatch(cap.user, /PÁGINA PILAR/);
  assert.doesNotMatch(cap.user, /KEYWORD OBJETIVO/);
});

test("sin proposito el prompt sale sin ese bloque y sin undefined", async () => {
  const cap = {};
  const receta = { ...RECETA_BASE, proposito: null, comentarioDetalle: null };
  await desarrollar(clienteEspia(cap), ideaBlog, { receta, insights: "", memoria: "" });
  assert.doesNotMatch(cap.user, /PROPÓSITO DE ESTA PIEZA/);
  assert.doesNotMatch(cap.user, /undefined/);
  // El fallback del comentario tiene que seguir apareciendo.
  assert.match(cap.user, /Un número real del negocio/);
});
