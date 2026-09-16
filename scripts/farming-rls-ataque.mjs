// scripts/farming-rls-ataque.mjs
//
// Farming · el ataque contra producción que tiene que fallar (revisión final, Important 1).
//
// Desde 20260912130000_farming_zonas_sin_escritura_directa.sql, `authenticated` y `anon` NO
// tienen INSERT/UPDATE/DELETE en farming_zonas ni en farming_zonas_compartidas: toda la
// escritura de la app pasa por createAdminClient (service_role, que se saltea RLS) con los
// filtros de agencia/dueño puestos a mano en cada endpoint. Este script prueba que, por
// PostgREST directo con la clave ANON (o sea con la sesión de un asesor real, RLS puesta),
// ya no se puede escribir nada — ni la política vieja del `with check` (que dejaba a un
// asesor moverse la zona a otra agencia) importa: no hay grant, así que ni siquiera se llega
// a evaluar la política.
//
// A y B son los dos asesores de prueba de PRISMAIA - VAKDOR (mismos que
// scratch/farming-prueba-credenciales.json, pero las credenciales NUNCA se leen de un
// archivo acá: entran por variables de entorno, así no quedan escritas en ningún lado que se
// versione).
//
// Etapa 2 (20260916120000_farming_avisos.sql, revisión "Needs fixes", Important 1): se suman
// los mismos ataques sobre farming_avisos_marca, la única tabla nueva de esa migración
// alcanzable por PostgREST con la sesión de un asesor. La marca se siembra con service_role
// sobre la MISMA zona de A que ya usan los ataques de arriba; si la migración todavía no está
// aplicada (la tabla no existe) esos cuatro casos se saltean con un aviso, en vez de tirar
// abajo todo el script.
//
// Uso (PowerShell):
//   $env:A_EMAIL="..."; $env:A_PASS="..."; $env:B_EMAIL="..."; $env:B_PASS="..."; node scripts/farming-rls-ataque.mjs
//
// La URL, la clave anon y la de service_role SÍ se leen del .env del repo (no son secretos de
// una persona, son la config del proyecto). No se corre solo: alguien tiene que ejecutarlo a
// mano después de aplicar la migración, con el OK de Leonardo.
import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => {
    const i = l.indexOf("=")
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]
  }),
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY

const { A_EMAIL, A_PASS, B_EMAIL, B_PASS } = process.env
if (!A_EMAIL || !A_PASS || !B_EMAIL || !B_PASS) {
  console.error("Faltan A_EMAIL / A_PASS / B_EMAIL / B_PASS. Ver el comentario de uso arriba.")
  process.exit(1)
}

const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } })

async function entrar(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return { c, uid: data.user.id }
}

const cuadrado = { type: "Polygon", coordinates: [[[-58.99, -34.99], [-58.98, -34.99], [-58.98, -34.98], [-58.99, -34.98], [-58.99, -34.99]]] }
const resultados = []
const espera = (nombre, ok) => { resultados.push({ nombre, ok }); console.log(ok ? "  OK " : "  FALLA", nombre) }

const A = await entrar(A_EMAIL, A_PASS)
const B = await entrar(B_EMAIL, B_PASS)

const { data: perfilA, error: ePerfilA } = await admin.from("profiles").select("agency_id").eq("id", A.uid).single()
if (ePerfilA) throw new Error(`no se pudo leer el perfil de A: ${ePerfilA.message}`)
const { data: perfilB, error: ePerfilB } = await admin.from("profiles").select("agency_id").eq("id", B.uid).single()
if (ePerfilB) throw new Error(`no se pudo leer el perfil de B: ${ePerfilB.message}`)
if (perfilA.agency_id !== perfilB.agency_id) {
  console.error("A y B tienen que ser de la misma agencia para que este ataque tenga sentido.")
  process.exit(1)
}

console.log("Seed: la zona de A se crea con service_role (bypasea RLS a propósito: no es lo que se prueba acá)")
const { data: zona, error: eSeed } = await admin
  .from("farming_zonas")
  .insert({ agency_id: perfilA.agency_id, owner_user_id: A.uid, nombre: "ATAQUE-RLS (borrar)", geojson: cuadrado, area_km2: 1, estado: "activa" })
  .select("id, nombre, agency_id, geojson")
  .single()
if (eSeed) throw new Error(`no se pudo sembrar la zona de A: ${eSeed.message}`)
const original = { nombre: zona.nombre, agency_id: zona.agency_id, geojson: JSON.stringify(zona.geojson) }

console.log("Control positivo: A ve su propia zona por PostgREST")
const { data: rA } = await A.c.from("farming_zonas").select("id").eq("id", zona.id)
espera("A ve la zona", rA?.length === 1)

console.log("Control positivo: B ve el contorno de A (misma agencia)")
const { data: rB } = await B.c.from("farming_zonas").select("id").eq("id", zona.id)
espera("B ve la zona de A", rB?.length === 1)

console.log("ATAQUE 1: A intenta renombrar su propia zona por PostgREST (tiene que pasar por la app, no por acá)")
const { error: eA1 } = await A.c.from("farming_zonas").update({ nombre: "PWNED" }).eq("id", zona.id)
espera("A NO pudo escribir directo (sin permiso)", !!eA1)

console.log("ATAQUE 2: A intenta mover su propia zona a otra agencia por PostgREST")
const { error: eA2 } = await A.c.from("farming_zonas").update({ agency_id: "00000000-0000-0000-0000-000000000000" }).eq("id", zona.id)
espera("A NO pudo cambiarse el agency_id", !!eA2)

console.log("ATAQUE 3: A intenta reescribir el geojson de su zona por PostgREST (salteando los topes de la app)")
const otroPoligono = { type: "Polygon", coordinates: [[[-58, -34], [-57.9, -34], [-57.9, -33.9], [-58, -33.9], [-58, -34]]] }
const { error: eA3 } = await A.c.from("farming_zonas").update({ geojson: otroPoligono, area_km2: 999 }).eq("id", zona.id)
espera("A NO pudo reescribir el geojson", !!eA3)

console.log("ATAQUE 4: B intenta editar la zona de A")
const { error: eB1 } = await B.c.from("farming_zonas").update({ nombre: "PWNED" }).eq("id", zona.id)
espera("B NO pudo editar", !!eB1)

console.log("ATAQUE 5: B intenta sumarse solo a la zona de A")
const { error: eB2 } = await B.c.from("farming_zonas_compartidas").insert({ zona_id: zona.id, user_id: B.uid, agregado_por: B.uid })
espera("B NO pudo compartirse", !!eB2)

console.log("ATAQUE 6: B intenta crear una zona a nombre de A")
const { error: eB3 } = await B.c.from("farming_zonas").insert({ agency_id: perfilA.agency_id, owner_user_id: A.uid, nombre: "PWNED", geojson: cuadrado, area_km2: 1, estado: "activa" })
espera("B NO pudo crear a nombre de A", !!eB3)

console.log("ATAQUE 7: B intenta borrar la zona de A")
const { error: eB4, count } = await B.c.from("farming_zonas").delete({ count: "exact" }).eq("id", zona.id)
espera("B NO pudo borrar", !!eB4 || count === 0)

console.log("Verificación: la fila sigue exactamente como la sembró el service_role")
const { data: fila, error: eFinal } = await admin.from("farming_zonas").select("nombre, agency_id, geojson").eq("id", zona.id).single()
if (eFinal) throw new Error(`no se pudo releer la zona: ${eFinal.message}`)
espera("nombre sin cambios", fila.nombre === original.nombre)
espera("agency_id sin cambios", fila.agency_id === original.agency_id)
espera("geojson sin cambios", JSON.stringify(fila.geojson) === original.geojson)

console.log("Seed: se comparte la zona de A con B (para el control positivo de la marca, etapa 2)")
const { error: eCompartir } = await admin
  .from("farming_zonas_compartidas")
  .insert({ zona_id: zona.id, user_id: B.uid, agregado_por: A.uid })
if (eCompartir) throw new Error(`no se pudo compartir la zona de A con B: ${eCompartir.message}`)

console.log("Seed: se crea con service_role una marca de A en su propia zona (etapa 2, farming_avisos_marca)")
const marcaSeed = { zona_id: zona.id, aviso_id: 999999999, aviso_es_dueno_directo: false, user_id: A.uid, estado: "descartado" }
const { error: eSeedMarca } = await admin.from("farming_avisos_marca").insert(marcaSeed)

if (eSeedMarca) {
  console.warn("No se pudo sembrar la marca de prueba (¿todavía no está aplicada 20260916120000_farming_avisos.sql?):", eSeedMarca.message)
  console.warn("Se saltean los 4 casos de farming_avisos_marca.")
} else {
  console.log("ATAQUE 8: B intenta insertar una marca en la zona de A")
  const { error: eB5 } = await B.c
    .from("farming_avisos_marca")
    .insert({ zona_id: zona.id, aviso_id: 888888888, aviso_es_dueno_directo: false, user_id: B.uid, estado: "descartado" })
  espera("B NO pudo insertar una marca en la zona de A", !!eB5)

  console.log("ATAQUE 9: B intenta actualizar la marca de A")
  const { error: eB6 } = await B.c
    .from("farming_avisos_marca")
    .update({ estado: "convertido" })
    .match({ zona_id: zona.id, aviso_id: marcaSeed.aviso_id })
  espera("B NO pudo actualizar la marca de A", !!eB6)

  console.log("ATAQUE 10: B intenta borrar la marca de A")
  const { error: eB7, count: countMarca } = await B.c
    .from("farming_avisos_marca")
    .delete({ count: "exact" })
    .match({ zona_id: zona.id, aviso_id: marcaSeed.aviso_id })
  espera("B NO pudo borrar la marca de A", !!eB7 || countMarca === 0)

  console.log("Control positivo: B SÍ puede ver la marca de A porque la zona está compartida con B")
  const { data: rMarca } = await B.c
    .from("farming_avisos_marca")
    .select("zona_id, aviso_id")
    .match({ zona_id: zona.id, aviso_id: marcaSeed.aviso_id })
  espera("B ve la marca de la zona compartida", rMarca?.length === 1)

  console.log("Verificación: la marca sigue exactamente como la sembró el service_role")
  const { data: filaMarca, error: eFinalMarca } = await admin
    .from("farming_avisos_marca")
    .select("estado")
    .match({ zona_id: zona.id, aviso_id: marcaSeed.aviso_id })
    .single()
  if (eFinalMarca) throw new Error(`no se pudo releer la marca: ${eFinalMarca.message}`)
  espera("estado de la marca sin cambios", filaMarca.estado === marcaSeed.estado)
}

console.log("Limpieza: se borra con service_role")
const { error: eLimpieza } = await admin.from("farming_zonas").delete().eq("id", zona.id)
if (eLimpieza) console.warn("No se pudo limpiar la zona de prueba:", eLimpieza.message, "— borrarla a mano:", zona.id)

const fallas = resultados.filter((r) => !r.ok)
console.log(fallas.length ? `\nX ${fallas.length} FALLAS` : "\nTodo como tiene que ser: los ataques fallan, los controles positivos pasan y la fila no cambió")
process.exit(fallas.length ? 1 : 0)
