// Seleccion de escenas por momento del embudo y area del cluster.
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirEscenas } from "./recursos.mjs";

const escena = (id, area, momento, usos = 0) => ({
  id, titulo: id, detalle: id, area, momento, usos, ultimo_uso: null,
});

const BANCO = [
  escena("d1", "ventas", "dolor"),
  escena("d2", "equipo", "dolor"),
  escena("f1", "ventas", "intento_fallido"),
  escena("r1", "ventas", "resuelto"),
  escena("r2", "equipo", "resuelto"),
];

test("la primera escena respeta el momento y la segunda es libre", () => {
  const [a, b] = elegirEscenas(BANCO, { momento: "resuelto", areas: [], excluirIds: [] });
  assert.equal(a.momento, "resuelto");
  assert.notEqual(b.id, a.id);
});

test("da contraste: la segunda puede ser de otro momento", () => {
  const elegidas = elegirEscenas(BANCO, { momento: "resuelto", areas: [], excluirIds: [] });
  assert.equal(elegidas.length, 2);
});

test("sin escenas del momento pedido no bloquea: devuelve dos igual", () => {
  const soloDolor = BANCO.filter((e) => e.momento === "dolor");
  const elegidas = elegirEscenas(soloDolor, { momento: "resuelto", areas: [], excluirIds: [] });
  assert.equal(elegidas.length, 2);
});

test("el area afin ordena primero pero no excluye", () => {
  const [a] = elegirEscenas(BANCO, { momento: "resuelto", areas: ["equipo"], excluirIds: [] });
  assert.equal(a.area, "equipo");
});

test("un area sin escenas del momento no rompe la eleccion", () => {
  const elegidas = elegirEscenas(BANCO, { momento: "resuelto", areas: ["pauta_marketing"], excluirIds: [] });
  assert.equal(elegidas.length, 2);
  assert.equal(elegidas[0].momento, "resuelto");
});

test("con banco de una sola escena devuelve una, sin repetirla", () => {
  const elegidas = elegirEscenas([escena("u1", "ventas", "dolor")], { momento: "dolor", areas: [], excluirIds: [] });
  assert.equal(elegidas.length, 1);
});

test("con banco vacio devuelve vacio y no explota", () => {
  assert.deepEqual(elegirEscenas([], { momento: "dolor", areas: [], excluirIds: [] }), []);
});

test("respeta la rotacion: prefiere las menos usadas", () => {
  const banco = [
    escena("vieja", "ventas", "dolor", 9),
    escena("fresca", "ventas", "dolor", 0),
  ];
  const [a] = elegirEscenas(banco, { momento: "dolor", areas: [], excluirIds: [] });
  assert.equal(a.id, "fresca");
});

test("excluye las escenas usadas por las piezas recientes", () => {
  const banco = [
    escena("usada", "ventas", "dolor", 0),
    escena("libre", "ventas", "dolor", 5),
  ];
  const [a] = elegirEscenas(banco, { momento: "dolor", areas: [], excluirIds: ["usada"] });
  assert.equal(a.id, "libre");
});
