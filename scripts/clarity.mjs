// CLI para Microsoft Clarity (Data Export API).
// Trae los insights agregados de comportamiento/UX de los ultimos 1-3 dias.
// Uso:
//   node scripts/clarity.mjs                         -> ultimos 3 dias, sin dimension
//   node scripts/clarity.mjs --days 1                -> ultimo dia
//   node scripts/clarity.mjs --dim Device            -> desglosado por 1 dimension
//   node scripts/clarity.mjs --dim OS --dim Country  -> hasta 3 dimensiones
//   node scripts/clarity.mjs --json                  -> imprime el JSON crudo
//
// OJO (limites reales de la API de Clarity):
//   - numOfDays: solo 1, 2 o 3.
//   - hasta 3 dimensiones por consulta.
//   - RATE LIMIT: 10 requests por proyecto por dia. No la llames en loops.
// Dimensiones validas: Browser, Device, Country, OS, Source, Medium, Campaign, Channel, URL, Referrer.
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const token = process.env.CLARITY_API_KEY
if (!token) {
  console.error('Falta CLARITY_API_KEY en .env')
  process.exit(1)
}

// Parseo simple de argumentos.
const args = process.argv.slice(2)
let numOfDays = 3
const dims = []
let rawJson = false
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--days') numOfDays = Number(args[++i])
  else if (a === '--dim') dims.push(args[++i])
  else if (a === '--json') rawJson = true
  else if (a === '-h' || a === '--help') {
    console.log('Uso: node scripts/clarity.mjs [--days 1|2|3] [--dim <Dimension> ...(hasta 3)] [--json]')
    process.exit(0)
  }
}

if (![1, 2, 3].includes(numOfDays)) {
  console.error('--days debe ser 1, 2 o 3 (limite de la API de Clarity)')
  process.exit(1)
}
if (dims.length > 3) {
  console.error('Maximo 3 dimensiones por consulta')
  process.exit(1)
}

const url = new URL('https://www.clarity.ms/export-data/api/v1/project-live-insights')
url.searchParams.set('numOfDays', String(numOfDays))
dims.forEach((d, i) => url.searchParams.set(`dimension${i + 1}`, d))

const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
const text = await res.text()

if (!res.ok) {
  console.error(`Error ${res.status}: ${text}`)
  if (res.status === 400 && /limit/i.test(text)) {
    console.error('\n(Probable rate limit: Clarity permite solo 10 requests por dia por proyecto.)')
  }
  process.exit(1)
}

let data
try {
  data = JSON.parse(text)
} catch {
  console.error('Respuesta no es JSON:', text)
  process.exit(1)
}

if (rawJson) {
  console.log(JSON.stringify(data, null, 2))
  process.exit(0)
}

// Resumen legible.
const label = dims.length ? ` (por ${dims.join(', ')})` : ''
console.log(`\nClarity — ultimos ${numOfDays} dia(s)${label}\n${'='.repeat(48)}`)
for (const metric of data) {
  console.log(`\n# ${metric.metricName}`)
  for (const row of metric.information || []) {
    const dimParts = dims.filter((d) => row[d] != null).map((d) => `${d}=${row[d]}`)
    const dimStr = dimParts.length ? `[${dimParts.join(', ')}] ` : ''
    const fields = Object.entries(row)
      .filter(([k]) => !dims.includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join('  |  ')
    console.log(`  ${dimStr}${fields}`)
  }
}
console.log('')
