// El criterio de keyword temprana entra SOLO cuando hay keyword (articulos de blog).
import { test } from "node:test";
import assert from "node:assert/strict";
import { promptRevision, RUBRICA } from "./voz.mjs";

test("con keyword la rubrica suma el criterio de respuesta temprana", () => {
  const prompt = promptRevision("texto", "mofu", [], { keyword: "leads inmobiliarios" });
  assert.match(prompt, /leads inmobiliarios/);
  assert.match(prompt, /primeras 100 palabras/);
  // Criterio 8: el numerado tiene que seguir despues de los 7 de siempre.
  assert.match(prompt, new RegExp(`${RUBRICA.length + 1}\\. La búsqueda objetivo`));
});

test("sin keyword la rubrica queda igual que hoy", () => {
  const prompt = promptRevision("texto", "mofu", []);
  assert.doesNotMatch(prompt, /primeras 100 palabras/);
  assert.match(prompt, new RegExp(`${RUBRICA.length}\\. `));
});

test("una keyword vacia o de espacios no agrega criterio", () => {
  assert.doesNotMatch(promptRevision("t", "mofu", [], { keyword: "" }), /primeras 100 palabras/);
  assert.doesNotMatch(promptRevision("t", "mofu", [], { keyword: "   " }), /primeras 100 palabras/);
  assert.doesNotMatch(promptRevision("t", "mofu", [], { keyword: null }), /primeras 100 palabras/);
});

test("el criterio extra no pisa la regla de CTA de la etapa", () => {
  const prompt = promptRevision("texto", "bofu", [], { keyword: "kw" });
  assert.match(prompt, /vakdor\.com\/demostracion/);
  assert.match(prompt, /primer comentario no está incluido/);
});
