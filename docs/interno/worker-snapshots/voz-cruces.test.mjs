// Espejo de los tests de cruces de lib/admin-vakdor/marketing/voz.test.ts.
// Si cambia uno, cambia el otro: voz.mjs y voz.ts tienen que decir lo mismo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  momentoDeEtapa, estructurasCompatibles, claveValida, instruccionComentario,
  CLAVES_ESTRUCTURA, CLAVES_PROPOSITO, MOMENTOS,
} from "./voz.mjs";

test("momentoDeEtapa ata cada etapa del embudo a su momento", () => {
  assert.equal(momentoDeEtapa("tofu"), "dolor");
  assert.equal(momentoDeEtapa("mofu"), "intento_fallido");
  assert.equal(momentoDeEtapa("bofu"), "resuelto");
});

test("momentoDeEtapa no explota con una etapa desconocida", () => {
  // `funnel` es nullable en la base: si llega algo raro, la generacion sigue.
  assert.ok(MOMENTOS.includes(momentoDeEtapa(null)));
});

test("estructurasCompatibles filtra por proposito", () => {
  const banco = [
    { clave: "mito_realidad", propositos: ["convencer"] },
    { clave: "framework_pasos", propositos: ["ensenar"] },
    { clave: "autopsia", propositos: ["ensenar", "probar_con_dato"] },
  ];
  assert.deepEqual(
    estructurasCompatibles(banco, "ensenar").map((e) => e.clave),
    ["framework_pasos", "autopsia"],
  );
  assert.equal(estructurasCompatibles(banco, null).length, 3);
});

test("estructurasCompatibles nunca devuelve vacio", () => {
  const banco = [{ clave: "mito_realidad", propositos: ["convencer"] }];
  // Sin afines devuelve todas: una estructura menos afin es mejor que bloquear la pieza.
  assert.equal(estructurasCompatibles(banco, "reflexionar").length, 1);
  // Y tolera estructuras viejas sin la columna.
  assert.equal(estructurasCompatibles([{ clave: "vieja" }], "ensenar").length, 1);
});

test("claveValida acepta una clave que solo existe en la base", () => {
  assert.equal(claveValida(["confesion", "nueva_de_hoy"], "nueva_de_hoy"), "nueva_de_hoy");
  assert.equal(claveValida(["confesion"], "  CONFESION "), "confesion");
  assert.equal(claveValida(["confesion"], "no_existe"), null);
  assert.equal(claveValida(["confesion"], 42), null);
  assert.equal(claveValida(["confesion"], null), null);
});

test("instruccionComentario usa el detalle de la base", () => {
  assert.match(instruccionComentario("dato_crudo", "tofu", "Texto de la base."), /Texto de la base\./);
});

test("instruccionComentario cae al fallback si el detalle viene vacio", () => {
  assert.match(instruccionComentario("dato_crudo", "tofu", "   "), /Un número real del negocio/);
  assert.match(instruccionComentario("dato_crudo", "tofu", undefined), /Un número real del negocio/);
});

test("instruccionComentario pone el link solo en bofu", () => {
  assert.match(instruccionComentario("matiz", "bofu", null), /vakdor\.com\/demostracion/);
  assert.match(instruccionComentario("matiz", "mofu", null), /Sin links/);
});

test("los catalogos conocidos incluyen lo nuevo", () => {
  assert.equal(CLAVES_ESTRUCTURA.length, 9);
  assert.ok(CLAVES_ESTRUCTURA.includes("framework_pasos"));
  assert.equal(CLAVES_PROPOSITO.length, 5);
});
