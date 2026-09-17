#!/usr/bin/env node
// ============================================================================
// mercado-sync/matriz.mjs — qué zonas le tocan al refresco de este mes
//
// El workflow de refresco ya no lleva las 48 zonas escritas: le pregunta a
// mercado-sync/plan.mjs cuáles corren este mes y arma la matriz con eso. Así el
// plan de gasto vive en un solo lugar, con sus tests.
//
// Uso:
//   node mercado-sync/matriz.mjs             → matriz=<json>  (para GITHUB_OUTPUT)
//   node mercado-sync/matriz.mjs --humano    → la lista en castellano, para el log
//   node mercado-sync/matriz.mjs --mes 2026-11-03 --humano   → simular otro mes
// ============================================================================

import { matrizDelMes } from './plan.mjs'

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] ?? true) : d }
const mes = arg('mes', null)
const fecha = mes ? new Date(mes) : new Date()
if (Number.isNaN(fecha.getTime())) { console.error(`Fecha inválida: ${mes}`); process.exit(1) }

const matriz = matrizDelMes(fecha)

if (process.argv.includes('--humano')) {
  const refrescan = matriz.filter((e) => e.refrescar)
  console.log(`Mes ${fecha.toISOString().slice(0, 7)}: ${refrescan.length} zonas se releen y ${matriz.length} se verifican.`)
  for (const e of matriz) {
    console.log(`  ${e.zona.padEnd(22)} ${e.refrescar ? `relee ${e.base}` : 'solo verificación'}`)
  }
} else {
  console.log(`matriz=${JSON.stringify(matriz)}`)
}
