import { test } from "node:test";
import assert from "node:assert/strict";
import { armarSrt, extraerPalabras, apiKeyDe, transcribir } from "../lib/transcribe.mjs";

// IMPORTANTE: ninguna prueba de este archivo llama a la API de Groq. Solo se
// prueban las partes puras (armado de SRT, extraccion de palabras, resolucion
// de la API key) contra datos de fixture construidos a mano — nunca contra una
// respuesta real. La unica prueba que toca `transcribir` (la funcion que SI
// pega a la red) verifica que rechaza ANTES de tocar ffmpeg/fetch cuando no hay
// API key, así que tampoco llega a hacer ninguna llamada.

test("armarSrt: arma bloques SRT respetando el corte de linea a 46 caracteres", () => {
  // "Este es un segmento bastante largo para forzar el wrap" mide mas de 46
  // caracteres, tiene que partirse en mas de un bloque.
  const segments = [
    { start: 0, end: 3, text: "Este es un segmento bastante largo para forzar el wrap" },
  ];
  const srt = armarSrt(segments);
  const bloques = srt.trim().split(/\n\n+/);
  assert.ok(bloques.length >= 2, `esperaba al menos 2 bloques por el wrap, dio ${bloques.length}`);

  // Formato de cada bloque: "indice\nHH:MM:SS,mmm --> HH:MM:SS,mmm\ntexto"
  const primero = bloques[0].split("\n");
  assert.equal(primero[0], "1");
  assert.match(primero[1], /^\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d$/);
  assert.ok(primero[2].length <= 46, `la linea del SRT no respeto el limite de 46: "${primero[2]}"`);
});

test("armarSrt: los indices son consecutivos entre segmentos distintos", () => {
  const segments = [
    { start: 0, end: 1, text: "hola" },
    { start: 1, end: 2, text: "chau" },
  ];
  const srt = armarSrt(segments);
  const indices = srt.trim().split(/\n\n+/).map((b) => b.split("\n")[0]);
  assert.deepEqual(indices, ["1", "2"]);
});

test("armarSrt: segmentos vacios (sin texto) no generan bloques, y sin segments da string vacio", () => {
  assert.equal(armarSrt([{ start: 0, end: 1, text: "   " }]), "");
  assert.equal(armarSrt([]), "");
});

test("extraerPalabras: mapea texto/start/end de data.words al shape que consume recipe.mjs", () => {
  // Fixture a mano, con la forma real que devuelve Groq cuando se pide
  // timestamp_granularities[]=word (confirmado contra la API el 11-ago-2026:
  // cada palabra trae su start/end propio, no repartido).
  const data = {
    words: [
      { word: "Hola", start: 0.12, end: 0.45 },
      { word: "mundo", start: 0.5, end: 0.98 },
    ],
    segments: [{ start: 0, end: 1, text: "Hola mundo" }],
  };
  const palabras = extraerPalabras(data);
  assert.deepEqual(palabras, [
    { texto: "Hola", inicioSec: 0.12, finSec: 0.45 },
    { texto: "mundo", inicioSec: 0.5, finSec: 0.98 },
  ]);
});

test("extraerPalabras: si data.words viene vacio o ausente, devuelve [] (nunca inventa tiempos)", () => {
  assert.deepEqual(extraerPalabras({ words: [], segments: [] }), []);
  assert.deepEqual(extraerPalabras({ segments: [] }), []);
  assert.deepEqual(extraerPalabras({}), []);
});

test("apiKeyDe: prioriza el parametro explicito sobre la variable de entorno", () => {
  const antes = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "gsk_del_entorno";
  try {
    assert.equal(apiKeyDe("gsk_explicita"), "gsk_explicita");
    assert.equal(apiKeyDe(undefined), "gsk_del_entorno");
  } finally {
    if (antes === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = antes;
  }
});

test("apiKeyDe: sin parametro ni variable de entorno, devuelve null", () => {
  const antes = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    assert.equal(apiKeyDe(undefined), null);
  } finally {
    if (antes !== undefined) process.env.GROQ_API_KEY = antes;
  }
});

test("transcribir: sin API key rechaza ANTES de tocar ffmpeg o la red (no gasta nada)", async () => {
  const antes = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    // "entrada" ni siquiera existe: si la funcion llegara a intentar leerla o
    // extraer audio, fallaria con un error DISTINTO al de la API key. Que el
    // error sea puntualmente el de la key confirma que corta antes de eso.
    await assert.rejects(
      transcribir({ entrada: "C:/no/existe/video.mp4", apiKey: undefined }),
      /API Key de Groq/i
    );
  } finally {
    if (antes !== undefined) process.env.GROQ_API_KEY = antes;
  }
});
