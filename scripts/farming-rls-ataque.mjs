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
// Etapa 3-A (20260917120000_farming_direcciones.sql, Task 8): se suman los ataques sobre
// farming_direcciones, farming_propietarios y farming_contactos. Acá el orden SÍ importa: la
// dirección de A se siembra y se ataca ANTES de compartir la zona con B (para probar que B no
// ve nada de una zona que no es suya ni le compartieron), y se REPITEN los mismos ataques de
// escritura DESPUÉS de compartir (B ya puede leer, pero tiene que seguir sin poder escribir —
// hoy lo bloquea el `revoke` a lo bruto, pero el día que alguien sume una política de escritura
// condicionada a farming_puede_ver_zona, como pasó con la marca, este es el bloque que tiene que
// empezar a fallar). El control positivo — B lee la dirección, el propietario y el contacto —
// se hace DESPUÉS de compartir, reusando el mismo `compartir` que ya hacía el seed de la etapa 2.
// Las tres tablas comparten una sola función de acceso (farming_puede_ver_zona), así que un
// ataque que entrara acá sería el mismo agujero en las tres.
//
// Etapa 3-B (el tablero): la migración de esta etapa es UN ÍNDICE — ninguna tabla nueva,
// ninguna política nueva. Lo que sí estrena son tres escrituras, y las tres son la firma de
// algo: `etapa`/`orden` (quién movió la tarjeta), `farming_contactos.user_id` (quién anotó el
// contacto) y `farming_propietarios.tracking_log_id` (a quién se pasó al pipeline de Tracking).
// Los ataques 41-43 las prueban con la zona YA compartida, que es el caso más permisivo: si B
// no puede ahí, no puede en ningún lado. El de firmar un contacto como A es el que más importa:
// un historial se lee como prueba de quién estuvo en esa puerta.
//
// La rama del director de farming_puede_ver_zona (agencia + rol, no dueño ni compartido) es
// lógica nueva de esta migración — la política de farming_zonas no la cubre, es "toda la
// agencia lee el contorno" sin mirar el rol — así que se prueba con un tercer usuario, DIR, que
// tiene que leer las tres filas de A y no poder escribir ninguna. Es opcional: si no hay
// DIR_EMAIL/DIR_PASS, ese bloque se saltea con el mismo aviso y el mismo código de salida 2 que
// una migración sin aplicar — no hay forma de que el veredicto final dé verde sin haberlo hecho.
//
// Toda la siembra de dirección/propietario/contacto (y todo lo que se prueba con ellos) vive
// adentro de un try/finally: si algo revienta a mitad de camino, la limpieza igual corre.
// Un crash que deja «ATAQUE-RLS» viva en una base real, sin ni siquiera el aviso de "borrarla a
// mano", es peor que el bug que se estaba probando.
//
// Igual que con la marca: si la migración no está aplicada, se saltea con aviso y el veredicto
// final no puede dar verde.
//
// Uso (PowerShell):
//   $env:A_EMAIL="..."; $env:A_PASS="..."; $env:B_EMAIL="..."; $env:B_PASS="..."; node scripts/farming-rls-ataque.mjs
//   # Opcional, para el bloque del director (rama nueva de farming_puede_ver_zona):
//   $env:DIR_EMAIL="..."; $env:DIR_PASS="..."
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

console.log("Seed: se crea con service_role una dirección de A en su propia zona (etapa 3-A, farming_direcciones)")
let direccionesOmitida = false
let directorOmitido = false
let marcaOmitida = false
let direccion = null
let propietario = null
let contacto = null
let propietarioSeed, contactoSeed
const direccionSeed = { zona_id: zona.id, agency_id: perfilA.agency_id, calle: "ATAQUE-RLS calle (borrar)", altura: "9999", tipo: "casa", origen: "caminata", creada_por: A.uid }
const { data: direccionFila, error: eSeedDireccion } = await admin
  .from("farming_direcciones")
  .insert(direccionSeed)
  .select("id, calle, agency_id, zona_id")
  .single()

if (eSeedDireccion) {
  direccionesOmitida = true
  console.warn("No se pudo sembrar la dirección de prueba (¿todavía no está aplicada 20260917120000_farming_direcciones.sql?):", eSeedDireccion.message)
  console.warn("Se saltean los casos de farming_direcciones, farming_propietarios, farming_contactos y el bloque del director.")
} else {
  direccion = direccionFila
}

// Desde acá puede haber una fila viva en una base real (la dirección, y más abajo quizás el
// propietario y el contacto). Todo lo que sigue va en un try/finally: si algo revienta a mitad
// de camino —compartir, la marca, una relectura que falla—, la limpieza de abajo igual corre.
try {
  if (direccion) {
    console.log("Seed: se crea con service_role un propietario de esa dirección")
    propietarioSeed = { direccion_id: direccion.id, agency_id: perfilA.agency_id, nombre: "ATAQUE-RLS propietario (borrar)", creado_por: A.uid }
    const { data: propietarioFila, error: eSeedPropietario } = await admin
      .from("farming_propietarios")
      .insert(propietarioSeed)
      .select("id, nombre, agency_id")
      .single()

    if (eSeedPropietario) {
      // Misma migración, mismo trato que la dirección: no es un error aparte que amerite tirar
      // abajo el script, es la señal de que 20260917120000 no está aplicada.
      direccionesOmitida = true
      console.warn("No se pudo sembrar el propietario de prueba (¿todavía no está aplicada 20260917120000_farming_direcciones.sql?):", eSeedPropietario.message)
      console.warn("Se saltean los casos de farming_propietarios, farming_contactos y el bloque del director.")
    } else {
      propietario = propietarioFila

      console.log("Seed: se crea con service_role un contacto de esa dirección (etapa 3-B la va a llenar; acá solo se prueba el acceso)")
      contactoSeed = { direccion_id: direccion.id, agency_id: perfilA.agency_id, user_id: A.uid, tipo: "otro" }
      const { data: contactoFila, error: eSeedContacto } = await admin
        .from("farming_contactos")
        .insert(contactoSeed)
        .select("id, tipo, agency_id")
        .single()

      if (eSeedContacto) {
        direccionesOmitida = true
        console.warn("No se pudo sembrar el contacto de prueba (¿todavía no está aplicada 20260917120000_farming_direcciones.sql?):", eSeedContacto.message)
        console.warn("Se saltean los casos de farming_contactos y el bloque del director.")
      } else {
        contacto = contactoFila

        console.log("ATAQUE 11: B intenta leer la dirección de A (la zona todavía NO está compartida)")
        const { data: rDireccionB } = await B.c.from("farming_direcciones").select("id").eq("id", direccion.id)
        espera("B NO ve la dirección de A", (rDireccionB?.length ?? 0) === 0)

        console.log("ATAQUE 12: B intenta insertar una dirección en la zona de A")
        const { error: eB8 } = await B.c
          .from("farming_direcciones")
          .insert({ zona_id: zona.id, agency_id: perfilA.agency_id, calle: "PWNED", tipo: "casa", origen: "caminata", creada_por: B.uid })
        espera("B NO pudo insertar una dirección en la zona de A", !!eB8)

        console.log("ATAQUE 13: B intenta actualizar la dirección de A")
        const { error: eB9 } = await B.c.from("farming_direcciones").update({ calle: "PWNED" }).eq("id", direccion.id)
        espera("B NO pudo actualizar la dirección de A", !!eB9)

        console.log("ATAQUE 14: B intenta borrar la dirección de A")
        const { error: eB10, count: countDireccion } = await B.c
          .from("farming_direcciones")
          .delete({ count: "exact" })
          .eq("id", direccion.id)
        espera("B NO pudo borrar la dirección de A", !!eB10 || countDireccion === 0)

        console.log("ATAQUE 15: B intenta leer el propietario de A (la zona todavía NO está compartida)")
        const { data: rPropietarioB } = await B.c.from("farming_propietarios").select("id").eq("id", propietario.id)
        espera("B NO ve el propietario de A", (rPropietarioB?.length ?? 0) === 0)

        console.log("ATAQUE 16: B intenta insertar un propietario en la dirección de A")
        const { error: eB11 } = await B.c
          .from("farming_propietarios")
          .insert({ direccion_id: direccion.id, agency_id: perfilA.agency_id, nombre: "PWNED", creado_por: B.uid })
        espera("B NO pudo insertar un propietario en la dirección de A", !!eB11)

        console.log("ATAQUE 17: B intenta actualizar el propietario de A")
        const { error: eB12 } = await B.c.from("farming_propietarios").update({ nombre: "PWNED" }).eq("id", propietario.id)
        espera("B NO pudo actualizar el propietario de A", !!eB12)

        console.log("ATAQUE 18: B intenta borrar el propietario de A")
        const { error: eB13, count: countPropietario } = await B.c
          .from("farming_propietarios")
          .delete({ count: "exact" })
          .eq("id", propietario.id)
        espera("B NO pudo borrar el propietario de A", !!eB13 || countPropietario === 0)

        console.log("ATAQUE 19: B intenta leer el contacto de A (la zona todavía NO está compartida)")
        const { data: rContactoB } = await B.c.from("farming_contactos").select("id").eq("id", contacto.id)
        espera("B NO ve el contacto de A", (rContactoB?.length ?? 0) === 0)

        console.log("ATAQUE 20: B intenta insertar un contacto en la dirección de A (zona todavía NO compartida)")
        const { error: eB14 } = await B.c
          .from("farming_contactos")
          .insert({ direccion_id: direccion.id, agency_id: perfilA.agency_id, user_id: B.uid, tipo: "otro" })
        espera("B NO pudo insertar un contacto en la dirección de A", !!eB14)

        console.log("ATAQUE 21: B intenta actualizar el contacto de A")
        const { error: eB15 } = await B.c.from("farming_contactos").update({ nota: "PWNED" }).eq("id", contacto.id)
        espera("B NO pudo actualizar el contacto de A", !!eB15)

        console.log("ATAQUE 22: B intenta borrar el contacto de A")
        const { error: eB16, count: countContacto } = await B.c
          .from("farming_contactos")
          .delete({ count: "exact" })
          .eq("id", contacto.id)
        espera("B NO pudo borrar el contacto de A", !!eB16 || countContacto === 0)

        // ── El director: la otra rama de farming_puede_ver_zona (agencia + rol), que no
        // hereda de ningún lado — la política de farming_zonas es "toda la agencia lee el
        // contorno", sin mirar el rol, así que nada de arriba la ejercita. No depende de
        // compartir (el director entra por agencia + rol, no por farming_zonas_compartidas), así
        // que se prueba acá, antes de compartir con B, para no confundir "lo ve porque es
        // director" con "lo ve porque alguien se lo compartió". Opcional: si no están las
        // credenciales, se saltea con el mismo aviso y el mismo código de salida que una
        // migración sin aplicar.
        const { DIR_EMAIL, DIR_PASS } = process.env
        if (!DIR_EMAIL || !DIR_PASS) {
          directorOmitido = true
          console.warn("Faltan DIR_EMAIL / DIR_PASS: se saltea el bloque del director (la rama nueva de farming_puede_ver_zona).")
        } else {
          const DIR = await entrar(DIR_EMAIL, DIR_PASS)
          const { data: perfilDir, error: ePerfilDir } = await admin.from("profiles").select("agency_id, role").eq("id", DIR.uid).single()
          if (ePerfilDir) throw new Error(`no se pudo leer el perfil del director: ${ePerfilDir.message}`)
          if (perfilDir.role !== "director" || perfilDir.agency_id !== perfilA.agency_id) {
            directorOmitido = true
            console.warn(`DIR_EMAIL no es un director de la agencia de A (role=${perfilDir.role}, agency_id=${perfilDir.agency_id}). Se saltea el bloque del director.`)
          } else {
            console.log("Control positivo: el director SÍ ve la dirección de A (rama de rol, no de compartir)")
            const { data: rDireccionDir } = await DIR.c.from("farming_direcciones").select("id").eq("id", direccion.id)
            espera("el director ve la dirección de A", rDireccionDir?.length === 1)

            console.log("Control positivo: el director SÍ ve el propietario de A")
            const { data: rPropietarioDir } = await DIR.c.from("farming_propietarios").select("id").eq("id", propietario.id)
            espera("el director ve el propietario de A", rPropietarioDir?.length === 1)

            console.log("Control positivo: el director SÍ ve el contacto de A")
            const { data: rContactoDir } = await DIR.c.from("farming_contactos").select("id").eq("id", contacto.id)
            espera("el director ve el contacto de A", rContactoDir?.length === 1)

            console.log("ATAQUE 23: el director intenta insertar una dirección en la zona de A")
            const { error: eD1 } = await DIR.c
              .from("farming_direcciones")
              .insert({ zona_id: zona.id, agency_id: perfilA.agency_id, calle: "PWNED", tipo: "casa", origen: "caminata", creada_por: DIR.uid })
            espera("el director NO pudo insertar una dirección", !!eD1)

            console.log("ATAQUE 24: el director intenta actualizar la dirección de A")
            const { error: eD2 } = await DIR.c.from("farming_direcciones").update({ calle: "PWNED" }).eq("id", direccion.id)
            espera("el director NO pudo actualizar la dirección", !!eD2)

            console.log("ATAQUE 25: el director intenta borrar la dirección de A")
            const { error: eD3, count: countDirDireccion } = await DIR.c
              .from("farming_direcciones")
              .delete({ count: "exact" })
              .eq("id", direccion.id)
            espera("el director NO pudo borrar la dirección", !!eD3 || countDirDireccion === 0)

            console.log("ATAQUE 26: el director intenta insertar un propietario en la dirección de A")
            const { error: eD4 } = await DIR.c
              .from("farming_propietarios")
              .insert({ direccion_id: direccion.id, agency_id: perfilA.agency_id, nombre: "PWNED", creado_por: DIR.uid })
            espera("el director NO pudo insertar un propietario", !!eD4)

            console.log("ATAQUE 27: el director intenta actualizar el propietario de A")
            const { error: eD5 } = await DIR.c.from("farming_propietarios").update({ nombre: "PWNED" }).eq("id", propietario.id)
            espera("el director NO pudo actualizar el propietario", !!eD5)

            console.log("ATAQUE 28: el director intenta borrar el propietario de A")
            const { error: eD6, count: countDirPropietario } = await DIR.c
              .from("farming_propietarios")
              .delete({ count: "exact" })
              .eq("id", propietario.id)
            espera("el director NO pudo borrar el propietario", !!eD6 || countDirPropietario === 0)

            console.log("ATAQUE 29: el director intenta insertar un contacto en la dirección de A")
            const { error: eD7 } = await DIR.c
              .from("farming_contactos")
              .insert({ direccion_id: direccion.id, agency_id: perfilA.agency_id, user_id: DIR.uid, tipo: "otro" })
            espera("el director NO pudo insertar un contacto", !!eD7)

            console.log("ATAQUE 30: el director intenta actualizar el contacto de A")
            const { error: eD8 } = await DIR.c.from("farming_contactos").update({ nota: "PWNED" }).eq("id", contacto.id)
            espera("el director NO pudo actualizar el contacto", !!eD8)

            console.log("ATAQUE 31: el director intenta borrar el contacto de A")
            const { error: eD9, count: countDirContacto } = await DIR.c
              .from("farming_contactos")
              .delete({ count: "exact" })
              .eq("id", contacto.id)
            espera("el director NO pudo borrar el contacto", !!eD9 || countDirContacto === 0)
          }
        }
      }
    }
  }

  console.log("Seed: se comparte la zona de A con B (para los controles positivos de la marca —etapa 2— y de dirección/propietario/contacto —etapa 3-A—)")
  const { error: eCompartir } = await admin
    .from("farming_zonas_compartidas")
    .insert({ zona_id: zona.id, user_id: B.uid, agregado_por: A.uid })
  if (eCompartir) throw new Error(`no se pudo compartir la zona de A con B: ${eCompartir.message}`)

  if (!direccionesOmitida) {
    console.log("Control positivo: B SÍ puede ver la dirección de A porque la zona está compartida con B")
    const { data: rDireccionCompartida } = await B.c.from("farming_direcciones").select("id").eq("id", direccion.id)
    espera("B ve la dirección de la zona compartida", rDireccionCompartida?.length === 1)

    console.log("Control positivo: B SÍ puede ver el propietario de A porque la zona está compartida con B")
    const { data: rPropietarioCompartido } = await B.c.from("farming_propietarios").select("id").eq("id", propietario.id)
    espera("B ve el propietario de la zona compartida", rPropietarioCompartido?.length === 1)

    console.log("Control positivo: B SÍ puede ver el contacto de A porque la zona está compartida con B")
    const { data: rContactoCompartido } = await B.c.from("farming_contactos").select("id").eq("id", contacto.id)
    espera("B ve el contacto de la zona compartida", rContactoCompartido?.length === 1)

    // Se repiten los mismos ataques de escritura de arriba, ahora con la zona YA compartida: B
    // puede leer, pero tiene que seguir sin poder escribir. Hoy el `revoke` de la migración
    // bloquea esto a lo bruto sin mirar ninguna política; el día que alguien sume un `for update`
    // o un `for delete` condicionado a farming_puede_ver_zona, este es el bloque que empieza a
    // fallar si esa política le da a B más de lo que debería.
    console.log("ATAQUE 32: B (con la zona compartida) intenta insertar una dirección en la zona de A")
    const { error: eB17 } = await B.c
      .from("farming_direcciones")
      .insert({ zona_id: zona.id, agency_id: perfilA.agency_id, calle: "PWNED", tipo: "casa", origen: "caminata", creada_por: B.uid })
    espera("B (compartida) NO pudo insertar una dirección", !!eB17)

    console.log("ATAQUE 33: B (con la zona compartida) intenta actualizar la dirección de A")
    const { error: eB18 } = await B.c.from("farming_direcciones").update({ calle: "PWNED" }).eq("id", direccion.id)
    espera("B (compartida) NO pudo actualizar la dirección", !!eB18)

    console.log("ATAQUE 34: B (con la zona compartida) intenta borrar la dirección de A")
    const { error: eB19, count: countB2Direccion } = await B.c
      .from("farming_direcciones")
      .delete({ count: "exact" })
      .eq("id", direccion.id)
    espera("B (compartida) NO pudo borrar la dirección", !!eB19 || countB2Direccion === 0)

    console.log("ATAQUE 35: B (con la zona compartida) intenta insertar un propietario en la dirección de A")
    const { error: eB20 } = await B.c
      .from("farming_propietarios")
      .insert({ direccion_id: direccion.id, agency_id: perfilA.agency_id, nombre: "PWNED", creado_por: B.uid })
    espera("B (compartida) NO pudo insertar un propietario", !!eB20)

    console.log("ATAQUE 36: B (con la zona compartida) intenta actualizar el propietario de A")
    const { error: eB21 } = await B.c.from("farming_propietarios").update({ nombre: "PWNED" }).eq("id", propietario.id)
    espera("B (compartida) NO pudo actualizar el propietario", !!eB21)

    console.log("ATAQUE 37: B (con la zona compartida) intenta borrar el propietario de A")
    const { error: eB22, count: countB2Propietario } = await B.c
      .from("farming_propietarios")
      .delete({ count: "exact" })
      .eq("id", propietario.id)
    espera("B (compartida) NO pudo borrar el propietario", !!eB22 || countB2Propietario === 0)

    console.log("ATAQUE 38: B (con la zona compartida) intenta insertar un contacto en la dirección de A")
    const { error: eB23 } = await B.c
      .from("farming_contactos")
      .insert({ direccion_id: direccion.id, agency_id: perfilA.agency_id, user_id: B.uid, tipo: "otro" })
    espera("B (compartida) NO pudo insertar un contacto", !!eB23)

    console.log("ATAQUE 39: B (con la zona compartida) intenta actualizar el contacto de A")
    const { error: eB24 } = await B.c.from("farming_contactos").update({ nota: "PWNED" }).eq("id", contacto.id)
    espera("B (compartida) NO pudo actualizar el contacto", !!eB24)

    console.log("ATAQUE 40: B (con la zona compartida) intenta borrar el contacto de A")
    const { error: eB25, count: countB2Contacto } = await B.c
      .from("farming_contactos")
      .delete({ count: "exact" })
      .eq("id", contacto.id)
    espera("B (compartida) NO pudo borrar el contacto", !!eB25 || countB2Contacto === 0)

    // ── Etapa 3-B: las tres escrituras que estrena el tablero. No hay tablas ni políticas
    // nuevas (la migración 20260917180000 es un índice), pero sí hay tres columnas que recién
    // ahora se escriben, y las tres son la firma de algo: quién movió la tarjeta, quién anotó
    // el contacto y a quién se pasó al pipeline. Se prueban con la zona YA compartida, que es
    // el caso más permisivo: si acá no se puede, en ningún otro lado tampoco.
    console.log("ATAQUE 41: B (compartida) intenta MOVER la tarjeta de A (etapa/orden), que es la acción central del tablero")
    const { error: eB26 } = await B.c
      .from("farming_direcciones")
      .update({ etapa: "captada", orden: 0 })
      .eq("id", direccion.id)
    espera("B (compartida) NO pudo mover la tarjeta de A", !!eB26)

    console.log("ATAQUE 42: B (compartida) intenta anotar un contacto FIRMADO COMO A (historial a nombre de otro)")
    const { error: eB27 } = await B.c
      .from("farming_contactos")
      .insert({ direccion_id: direccion.id, agency_id: perfilA.agency_id, user_id: A.uid, tipo: "otro", nota: "PWNED" })
    espera("B (compartida) NO pudo firmar un contacto como A", !!eB27)

    console.log("ATAQUE 43: B (compartida) intenta estampar un tracking_log_id en el propietario de A (meterlo en un pipeline ajeno)")
    const { error: eB28 } = await B.c
      .from("farming_propietarios")
      .update({ tracking_log_id: "00000000-0000-0000-0000-000000000001" })
      .eq("id", propietario.id)
    espera("B (compartida) NO pudo estampar un tracking_log_id en el propietario de A", !!eB28)
  }

  console.log("Seed: se crea con service_role una marca de A en su propia zona (etapa 2, farming_avisos_marca)")
  const marcaSeed = { zona_id: zona.id, aviso_id: 999999999, aviso_es_dueno_directo: false, user_id: A.uid, estado: "descartado" }
  const { error: eSeedMarca } = await admin.from("farming_avisos_marca").insert(marcaSeed)

  if (eSeedMarca) {
    marcaOmitida = true
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

  if (!direccionesOmitida) {
    console.log("Verificación: la dirección, el propietario y el contacto siguen exactamente como los sembró el service_role")
    const { data: filaDireccion, error: eFinalDireccion } = await admin
      .from("farming_direcciones")
      .select("calle, agency_id, zona_id")
      .eq("id", direccion.id)
      .single()
    if (eFinalDireccion) throw new Error(`no se pudo releer la dirección: ${eFinalDireccion.message}`)
    espera("calle de la dirección sin cambios", filaDireccion.calle === direccionSeed.calle)
    espera("agency_id de la dirección sin cambios", filaDireccion.agency_id === direccionSeed.agency_id)
    espera("zona_id de la dirección sin cambios", filaDireccion.zona_id === direccionSeed.zona_id)

    const { data: filaPropietario, error: eFinalPropietario } = await admin
      .from("farming_propietarios")
      .select("nombre, agency_id")
      .eq("id", propietario.id)
      .single()
    if (eFinalPropietario) throw new Error(`no se pudo releer el propietario: ${eFinalPropietario.message}`)
    espera("nombre del propietario sin cambios", filaPropietario.nombre === propietarioSeed.nombre)
    espera("agency_id del propietario sin cambios", filaPropietario.agency_id === propietarioSeed.agency_id)

    const { data: filaContacto, error: eFinalContacto } = await admin
      .from("farming_contactos")
      .select("tipo, agency_id")
      .eq("id", contacto.id)
      .single()
    if (eFinalContacto) throw new Error(`no se pudo releer el contacto: ${eFinalContacto.message}`)
    espera("tipo del contacto sin cambios", filaContacto.tipo === contactoSeed.tipo)
    espera("agency_id del contacto sin cambios", filaContacto.agency_id === contactoSeed.agency_id)
  }
} finally {
  if (direccion) {
    console.log("Limpieza: se borra la dirección con service_role (propietario y contacto caen en cascada) — ANTES de la zona, por el RESTRICT de zona_id")
    const { error: eLimpiezaDireccion } = await admin.from("farming_direcciones").delete().eq("id", direccion.id)
    if (eLimpiezaDireccion) {
      console.warn("No se pudo limpiar la dirección de prueba:", eLimpiezaDireccion.message)
      console.warn("Borrar A MANO (el propietario y el contacto no se van a ir solos si esto falló) — dirección:", direccion.id)
    }
  }
}

console.log("Limpieza: se borra con service_role")
const { error: eLimpieza } = await admin.from("farming_zonas").delete().eq("id", zona.id)
if (eLimpieza) console.warn("No se pudo limpiar la zona de prueba:", eLimpieza.message, "— borrarla a mano:", zona.id)

const fallas = resultados.filter((r) => !r.ok)
if (fallas.length) {
  console.log(`\nX ${fallas.length} FALLAS`)
  process.exit(1)
} else if (marcaOmitida || direccionesOmitida || directorOmitido) {
  // Un verde acá sin haber corrido estos ataques es peor que no correr el script: dice "seguro"
  // sin haberlo probado. Distinto código de salida (2) para no confundirlo con el 1 de "un
  // ataque pasó" — acá ningún ataque pasó, simplemente no se corrieron.
  const omitidos = []
  if (marcaOmitida) omitidos.push("4 ataques a farming_avisos_marca (falta 20260916120000_farming_avisos.sql)")
  if (direccionesOmitida) omitidos.push("24 ataques + 3 controles positivos a farming_direcciones/farming_propietarios/farming_contactos, antes y después de compartir, incluidas las tres escrituras que estrena el tablero de la etapa 3-B (falta 20260917120000_farming_direcciones.sql)")
  if (directorOmitido) omitidos.push("9 ataques + 3 controles positivos del bloque del director (faltan DIR_EMAIL/DIR_PASS, o esas credenciales no son de un director de la agencia de A)")
  console.log(`\n⚠ NO se corrieron: ${omitidos.join(" y ")}. Esto NO es un OK.`)
  process.exit(2)
} else {
  console.log("\nTodo como tiene que ser: los ataques fallan, los controles positivos pasan y la fila no cambió")
  process.exit(0)
}
