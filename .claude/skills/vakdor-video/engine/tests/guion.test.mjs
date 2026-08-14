// Pruebas del analista de guion. Ninguna toca la red: se arman transcripciones
// a mano, que ademas permite probar casos que en un video real no se dan cuando
// uno quiere.

import { test } from "node:test";
import assert from "node:assert/strict";
import { partirEnBeats, analizarGuion, buscarDatos, MULETILLAS } from "../lib/guion.mjs";

/** Arma palabras con tiempos: `frase` con un hueco de `pausa` antes de cada parte. */
function hablar(partes, { velocidad = 0.35 } = {}) {
  const ws = [];
  let t = 0;
  for (const { txt, pausa = 0 } of partes) {
    t += pausa;
    for (const p of txt.split(/\s+/)) {
      ws.push({ texto: p, inicioSec: Number(t.toFixed(2)), finSec: Number((t + velocidad).toFixed(2)) });
      t += velocidad;
    }
  }
  return ws;
}

test("los beats se cortan por las pausas reales, no por la puntuacion", () => {
  const ws = hablar([
    { txt: "esto es lo primero que digo" },
    { txt: "y esto es otra cosa distinta", pausa: 0.9 },
  ]);
  const beats = partirEnBeats(ws);
  assert.equal(beats.length, 2, "una pausa de 0.9s tiene que cortar");
  assert.match(beats[0].texto, /primero/);
  assert.match(beats[1].texto, /distinta/);
});

test("un bloque largo se subdivide aunque no haya pausas ni puntuacion", () => {
  // 40 palabras de corrido: sin subdividir seria un beat de 14s, inservible.
  const ws = hablar([{ txt: Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(" ") }]);
  const beats = partirEnBeats(ws, { maxSeg: 6 });
  assert.ok(beats.length > 1, "tiene que partirse");
  for (const b of beats) {
    assert.ok(b.palabras.length >= 4, `beat de ${b.palabras.length} palabras: es un fragmento, no una frase`);
  }
});

test("el contraste gana como placa cuando cae en UN solo beat", () => {
  const ws = hablar([
    { txt: "eso no es tener una empresa. eso es jugar al casino." },
    { txt: "y despues seguimos hablando de otra cosa distinta aca", pausa: 0.8 },
  ]);
  const placa = analizarGuion(ws, { duracion: 20 }).sugerencias.find((s) => s.tipo === "placa");
  assert.ok(placa, "tiene que proponer una placa");
  assert.match(placa.razon, /jugar al casino/);
});

test("el contraste PARTIDO en dos beats tambien se detecta, uniendolos", () => {
  // Este es el caso real: la persona respira en el medio, los dos beats quedan
  // separados y sueltos ninguno puntua alto. Sin unirlos se pierde la mejor
  // linea del video.
  const ws = hablar([
    { txt: "eso no es tener una empresa." },
    { txt: "eso es jugar al casino.", pausa: 0.7 },
    { txt: "y despues seguimos hablando de otra cosa distinta aca", pausa: 0.9 },
  ]);
  const a = analizarGuion(ws, { duracion: 20 });
  const placa = a.sugerencias.find((s) => s.tipo === "placa");
  assert.ok(placa, "tiene que proponer una placa");
  assert.match(placa.razon, /contraste partido/);
  assert.match(placa.razon, /jugar al casino/);
  // y tiene que abarcar las DOS frases, no una
  assert.ok(placa.hasta - placa.desde > 2, `la placa cubre solo ${(placa.hasta - placa.desde).toFixed(1)}s`);
});

test("una enumeracion de 3 items propone panel; una frase con coma no", () => {
  const conLista = hablar([{ txt: "saber cuantos leads entraron, en cuantos minutos respondimos y la tasa de cierre" }]);
  assert.equal(analizarGuion(conLista, { duracion: 10 }).enumeraciones.length, 1);

  const sinLista = hablar([{ txt: "te dicen, fue un buen mes y punto" }]);
  assert.equal(analizarGuion(sinLista, { duracion: 10 }).enumeraciones.length, 0,
    "una coma suelta no es una enumeracion");
});

test("los numeros se detectan con su frase de contexto", () => {
  const ws = hablar([{ txt: "de cada 40 vendedores solo 5 traen el 80% de todo" }]);
  const datos = buscarDatos(ws);
  assert.deepEqual(datos.map((d) => d.valor), ["40", "5", "80%"]);
  const a = analizarGuion(ws, { duracion: 10 });
  assert.ok(a.datos[0].contexto.includes("vendedores"), "cada dato viene con su frase");
});

test("las muletillas se REPORTAN, nunca se cortan solas", () => {
  const ws = hablar([{ txt: "o sea digamos que esto viste es asi" }]);
  const a = analizarGuion(ws, { duracion: 10 });
  assert.ok(a.muletillas.length >= 2, `encontro ${a.muletillas.length}`);
  // La garantia que importa: no existe ninguna sugerencia de CORTAR.
  assert.equal(a.sugerencias.filter((s) => s.tipo === "cortar").length, 0);
  assert.ok(MULETILLAS.includes("digamos"));
});

test("un fragmento de 2 palabras nunca gana como placa", () => {
  const ws = hablar([
    { txt: "que 5" },
    { txt: "esta es una frase de verdad con varias palabras", pausa: 0.9 },
  ]);
  const a = analizarGuion(ws, { duracion: 10 });
  const top = a.fuertes[0];
  assert.ok(top.palabras ? top.palabras.length >= 4 : true, `gano un fragmento: "${top.texto}"`);
  assert.ok(!/^que 5$/.test(top.texto));
});
