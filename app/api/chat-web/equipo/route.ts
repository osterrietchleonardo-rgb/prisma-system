/**
 * Chat web · La lista del equipo para el desplegable de la tarjeta.
 *
 * El director elige a quién le llegan los "quiero sumarme al equipo" de una lista, en vez de
 * escribir su número a mano (Leonardo, 17/9): si la persona ya está en PRISMA, pedirle el celular
 * al director es pedirle un error de tipeo.
 *
 * Devuelve SOLO lo necesario para elegir: nombre, rol y si tiene email y celular cargados. Ni el
 * número ni el correo salen de acá: los usa el servidor cuando manda el aviso.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"

export async function GET() {
  try {
    const { agencyId, role } = await requireTenant()
    if (role !== "director")
      return NextResponse.json({ error: "Solo los directores." }, { status: 403 })

    const db = createAdminClient()
    const { data, error } = await db
      .from("profiles")
      .select("id, full_name, role, email, phone")
      .eq("agency_id", agencyId)
      .eq("estado", "activo")
      .is("deleted_at", null)
      .order("full_name")
    if (error) throw new Error(error.message)

    return NextResponse.json({
      equipo: (data ?? []).map((p) => ({
        id: p.id,
        nombre: p.full_name ?? "(sin nombre)",
        rol: p.role,
        tieneEmail: Boolean(p.email),
        tieneCelular: Boolean(p.phone),
      })),
    })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error"
    return NextResponse.json({ error: mensaje }, { status: mensaje === "Unauthorized" ? 401 : 500 })
  }
}
