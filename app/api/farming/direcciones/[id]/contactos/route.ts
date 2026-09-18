// app/api/farming/direcciones/[id]/contactos/route.ts
//
// Farming · el historial FIRMADO de una tarjeta (`farming_contactos`). Cada fila es un
// movimiento real: qué se hizo, a qué columna pasó, quién lo hizo y cuándo. Es la mitad que
// convierte el tablero en un método y no en una pared de colores — la otra mitad son los
// nueve indicadores del GET de la lista (misma tabla, la cuenta agregada).
//
// `direccionAccesible(..., "leer")` es el único candado: una zona ARCHIVADA sí deja leer su
// historial (se mira, no se trabaja — es la promesa del cartel al archivar).
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { direccionAccesible, rechazoDeDireccion, responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    // "leer": la zona archivada sí contesta acá, igual que `propietarios` y el GET de
    // `direcciones`. El motivo de rechazo (404/403/409) lo traduce `rechazoDeDireccion`.
    const no = rechazoDeDireccion(await direccionAccesible(admin, params.id, agencyId, userId, "leer"))
    if (no) return no

    // `agency_id` además de `direccion_id`: la misma defensa que el resto de Farming contra
    // una fila con la columna denormalizada mal escrita — falla cerrada, no se filtra.
    // Orden fecha desc, created_at desc: lo más reciente primero, y el desempate por el
    // instante real en que se guardó cuando dos movimientos comparten la fecha.
    const { data, error } = await admin
      .from("farming_contactos")
      .select("*")
      .eq("direccion_id", params.id)
      .eq("agency_id", agencyId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) throw error

    const filas = data || []

    // El nombre sale de `profiles`, en UNA sola consulta por el conjunto de autores —nunca una
    // por fila—. Si el historial está vacío no hay ni que preguntar.
    const idsAutores = [...new Set(filas.map((f: any) => f.user_id as string))]
    const { data: perfiles, error: ePerfiles } = idsAutores.length
      ? await admin.from("profiles").select("id, full_name").in("id", idsAutores).eq("agency_id", agencyId)
      : { data: [], error: null }
    if (ePerfiles) throw ePerfiles

    // Nunca un uuid crudo en pantalla: si el perfil no aparece (se fue de la agencia, o nunca
    // se cargó), el nombre es una frase, no el id.
    const nombreDeAutor = (userId: string) => {
      const nombre = (perfiles || []).find((p: any) => p.id === userId)?.full_name?.trim()
      return nombre || "un colega"
    }

    const contactos = filas.map((f: any) => ({ ...f, quien: nombreDeAutor(f.user_id) }))

    return NextResponse.json({ contactos })
  } catch (e) {
    return responderError(e, "historial de la tarjeta")
  }
}
