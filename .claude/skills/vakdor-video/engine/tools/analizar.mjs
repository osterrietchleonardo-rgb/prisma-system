#!/usr/bin/env node
// Imprime el analisis del guion de una transcripcion ya hecha.
//   node tools/analizar.mjs palabras.json [duracion]
import fs from "node:fs";
import { analizarGuion, reporteDeGuion } from "../lib/guion.mjs";

const [ruta, dur] = process.argv.slice(2);
if (!ruta) { console.error("Uso: node tools/analizar.mjs palabras.json [duracion]"); process.exit(1); }

const crudo = JSON.parse(fs.readFileSync(ruta, "utf8"));
const ws = (Array.isArray(crudo) ? crudo : crudo.palabras ?? crudo.words ?? [])
  .map((w) => ({ texto: w.texto ?? w.word, inicioSec: w.inicioSec ?? w.start, finSec: w.finSec ?? w.end }));

console.log(reporteDeGuion(analizarGuion(ws, { duracion: dur ? Number(dur) : ws.at(-1)?.finSec })));
