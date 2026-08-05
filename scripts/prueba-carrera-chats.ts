// Prueba de concurrencia del "buscar o crear chat".
//
// Simula lo que pasó el 4-ago-2026: varios mensajes del mismo lead atendidos en
// paralelo. Corre dos veces sobre una tabla CLON (nunca sobre la real):
//   1) sin el índice único  -> tiene que duplicar (reproduce el bug)
//   2) con el índice único  -> tiene que quedar un solo chat y no perder ninguno
//
//   node scripts/prueba-carrera-chats.ts
//
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { buscarOCrearConversacion } from '../lib/whatsapp/conversations.ts'

const ENV_PATH = 'C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM/.env'
const env = Object.fromEntries(
  fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
) as Record<string, string>

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// DDL por la Management API (crear/borrar la tabla clon).
async function sql(query: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_API_KEY_MANAGEMENT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!r.ok) throw new Error(JSON.stringify(await r.json()).slice(0, 300))
  return r.json()
}

const TABLA = 'wa_conversations_prueba_carrera'
const TELEFONO = '5490000000001'
const EN_PARALELO = 6

async function correr(conIndice: boolean, agency_id: string, instance_id: string) {
  await sql(`drop table if exists public.${TABLA};
             create table public.${TABLA} (like public.wa_conversations including defaults including constraints);`)
  if (conIndice) {
    await sql(`create unique index ${TABLA}_agency_phone_key on public.${TABLA} (agency_id, contact_phone);`)
  }

  // PostgREST cachea el esquema: hasta que no lo recarga, la tabla recién creada
  // "no existe" para el cliente JS y todos los INSERT fallan (falso negativo).
  await sql(`notify pgrst, 'reload schema';`)
  for (let i = 0; i < 30; i++) {
    const { error } = await supabase.from(TABLA).select('id').limit(1)
    if (!error) break
    await new Promise(r => setTimeout(r, 1000))
  }

  const resultados = await Promise.all(
    Array.from({ length: EN_PARALELO }, (_, i) =>
      buscarOCrearConversacion<{ id: string }>(supabase, {
        agency_id,
        contact_phone: TELEFONO,
        columnas: 'id',
        tabla: TABLA,
        nueva: { instance_id, contact_name: `Prueba ${i}`, status: 'active', bot_active: false, unread_count: 1 },
      })
    )
  )

  const [{ count }] = await sql(`select count(*)::int as count from public.${TABLA}`)
  const distintos = new Set(resultados.map(r => r.conv?.id).filter(Boolean)).size
  const creadas = resultados.filter(r => r.creada).length
  const perdidas = resultados.filter(r => !r.conv).length
  await sql(`drop table if exists public.${TABLA};`)

  const etiqueta = conIndice ? 'CON indice unico' : 'SIN indice unico (como estaba ayer)'
  console.log(`\n--- ${EN_PARALELO} mensajes simultaneos del mismo lead, ${etiqueta} ---`)
  console.log(`  chats creados en la base : ${count}`)
  console.log(`  chats distintos devueltos: ${distintos}`)
  console.log(`  mensajes sin chat        : ${perdidas}`)
  return { count, distintos, creadas, perdidas }
}

async function main() {
  const { data: instance } = await supabase
    .from('whatsapp_instances').select('id, agency_id').limit(1).single()
  if (!instance) throw new Error('No hay instancia de WhatsApp para probar')

  const sinIndice = await correr(false, instance.agency_id as string, instance.id as string)
  const conIndice = await correr(true, instance.agency_id as string, instance.id as string)

  const reproduce = sinIndice.count > 1
  const arregla = conIndice.count === 1 && conIndice.distintos === 1 && conIndice.creadas === 1 && conIndice.perdidas === 0

  console.log('\n==================== RESULTADO ====================')
  console.log(`  ${reproduce ? 'OK' : 'MAL'} - sin indice se duplica (${sinIndice.count} chats): el bug se reproduce`)
  console.log(`  ${arregla ? 'OK' : 'MAL'} - con indice queda 1 solo chat y 0 mensajes perdidos`)
  console.log(`\n  ${reproduce && arregla ? 'PASA' : 'FALLA'}`)
  process.exit(reproduce && arregla ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
