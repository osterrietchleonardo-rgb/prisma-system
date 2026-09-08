// Consulta y DDL contra la base de producción por Management API.
//
// Las migraciones del repo NO se aplican solas: este es el camino. Leer es libre; aplicar DDL
// necesita el OK de Leonardo, y va siempre en transacción con su rollback escrito antes.
//
// La ruta se resuelve con fileURLToPath y no con `new URL(...).pathname`: la carpeta del
// proyecto tiene espacios ("Antigravity - Apps") y pathname los devuelve como %20.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
    })
)

const REF = env.SUPABASE_PROJECT_REF
const KEY = env.SUPABASE_API_KEY_MANAGEMENT

export async function sql(query) {
  if (!REF || !KEY) throw new Error('Faltan SUPABASE_PROJECT_REF o SUPABASE_API_KEY_MANAGEMENT en .env')
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${texto}`)
  return JSON.parse(texto)
}

// Solo corre como script si le pasan la consulta; importado, no hace nada.
if (process.argv[2]) console.log(JSON.stringify(await sql(process.argv[2]), null, 2))
