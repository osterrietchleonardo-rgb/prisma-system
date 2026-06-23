// Rellena embeddings faltantes en `properties` SIN tocar los existentes.
// Mismo modelo/parametros que lib/gemini.ts: gemini-embedding-001, RETRIEVAL_DOCUMENT, 768 dims.
// Seguro y re-ejecutable: solo procesa filas con embedding NULL.
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const geminiApiKey = process.env.GEMINI_API_KEY

if (!supabaseUrl || !serviceKey || !geminiApiKey) {
  console.error('Faltan variables en .env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function generateEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`
  let attempt = 0
  while (true) {
    attempt++
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: (text || 'propiedad').substring(0, 10000) }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.embedding.values
    }
    // 429 (rate limit) o 5xx -> backoff y reintento
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      const wait = 2000 * attempt
      console.log(`   ...${res.status}, esperando ${wait}ms (intento ${attempt})`)
      await sleep(wait)
      continue
    }
    const detail = await res.text().catch(() => '')
    throw new Error(`Embedding failed ${res.status}: ${detail.slice(0, 200)}`)
  }
}

async function main() {
  console.log('Buscando propiedades sin embedding...')
  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, title, property_type, address, city, description')
    .is('embedding', null)

  if (error) {
    console.error('Error al leer properties:', error)
    process.exit(1)
  }

  const total = properties?.length || 0
  console.log(`Encontradas ${total} propiedades a procesar.`)
  let ok = 0
  let fail = 0

  for (let i = 0; i < total; i++) {
    const prop = properties[i]
    const textToEmbed = `${prop.title || ''} ${prop.property_type || ''} ${prop.address || ''} ${prop.city || ''} ${prop.description || ''}`.trim()
    try {
      const embedding = await generateEmbedding(textToEmbed)
      let { error: upErr } = await supabase.from('properties').update({ embedding }).eq('id', prop.id)
      // Fallback por si el driver necesita el vector como string '[...]'
      if (upErr) {
        const asString = `[${embedding.join(',')}]`
        const retry = await supabase.from('properties').update({ embedding: asString }).eq('id', prop.id)
        upErr = retry.error
      }
      if (upErr) {
        fail++
        console.log(`[${i + 1}/${total}] FALLO update ${prop.id}: ${upErr.message}`)
      } else {
        ok++
        if ((i + 1) % 10 === 0 || i === total - 1) console.log(`[${i + 1}/${total}] ok (acumulado ${ok})`)
      }
    } catch (e) {
      fail++
      console.log(`[${i + 1}/${total}] FALLO embed ${prop.id}: ${e.message}`)
    }
    await sleep(700) // ~85/min, debajo de limites tipicos
  }

  console.log(`\nLISTO. Exitosas: ${ok} | Fallidas: ${fail} | Total: ${total}`)
}

main()
