"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

/**
 * Valida que quien ejecuta sea un director y que el asesor objetivo pertenezca a
 * SU misma agencia. Devuelve los datos necesarios para operar (id del director,
 * asesor con email, cliente admin). Lanza si algo no cuadra.
 */
async function requireDirectorSobreAsesor(agentId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data: director } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("id", user.id)
    .single()

  if (!director?.agency_id) throw new Error("Perfil sin inmobiliaria")
  if (director.role !== "director") throw new Error("Solo el director puede gestionar asesores")

  const { data: asesor } = await supabase
    .from("profiles")
    .select("id, email, role, agency_id")
    .eq("id", agentId)
    .single()

  if (!asesor || asesor.agency_id !== director.agency_id || asesor.role !== "asesor") {
    throw new Error("Asesor no encontrado en tu inmobiliaria")
  }

  return {
    directorId: user.id,
    agencyId: director.agency_id as string,
    asesor,
    admin: createAdminClient(),
  }
}

/**
 * Registra en equipo_acciones una acción del director sobre un asesor
 * (trazabilidad: qué, a quién, quién, cuándo y por qué). Best-effort: si falla
 * el log no revertimos el cambio de estado ya aplicado, solo lo avisamos.
 */
async function registrarAccion(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    agencyId: string
    asesorId: string
    ejecutadoPor: string
    tipoAccion: "pausa" | "reanudacion" | "desvinculacion"
    motivo?: string | null
  }
) {
  const { error } = await admin.from("equipo_acciones").insert({
    agency_id: params.agencyId,
    asesor_id: params.asesorId,
    ejecutado_por: params.ejecutadoPor,
    tipo_accion: params.tipoAccion,
    motivo: params.motivo?.trim() || null,
  })
  if (error) console.error("No se pudo registrar la acción en equipo_acciones:", error)
}

/**
 * Pausa temporalmente a un asesor: no puede acceder mientras esté pausado.
 * - estado='pausado' + tokens_invalidos_desde=now() → los guards de layout lo
 *   expulsan y el login lo rechaza, sin bloquear el email (puede reanudarse).
 */
export async function pausarAsesor(agentId: string, motivo: string) {
  if (!motivo?.trim()) throw new Error("Escribí el motivo de la pausa")
  const { directorId, agencyId, asesor, admin } = await requireDirectorSobreAsesor(agentId)

  const { error } = await admin
    .from("profiles")
    .update({
      estado: "pausado",
      tokens_invalidos_desde: new Date().toISOString(),
    })
    .eq("id", agentId)

  if (error) {
    console.error("Error pausando asesor:", error)
    throw new Error(error.message)
  }

  await registrarAccion(admin, {
    agencyId,
    asesorId: asesor.id,
    ejecutadoPor: directorId,
    tipoAccion: "pausa",
    motivo,
  })

  revalidatePath("/director/asesores")
  return { success: true }
}

/**
 * Reanuda a un asesor pausado: vuelve a tener acceso normal.
 * - estado='activo' + tokens_invalidos_desde=null.
 */
export async function reanudarAsesor(agentId: string) {
  const { directorId, agencyId, asesor, admin } = await requireDirectorSobreAsesor(agentId)

  const { error } = await admin
    .from("profiles")
    .update({
      estado: "activo",
      tokens_invalidos_desde: null,
    })
    .eq("id", agentId)

  if (error) {
    console.error("Error reanudando asesor:", error)
    throw new Error(error.message)
  }

  await registrarAccion(admin, {
    agencyId,
    asesorId: asesor.id,
    ejecutadoPor: directorId,
    tipoAccion: "reanudacion",
  })

  revalidatePath("/director/asesores")
  return { success: true }
}

/**
 * Desvincula a un asesor de la agencia: lo deja sin acceso al sistema con ese email.
 * - estado='eliminado' + tokens_invalidos_desde=now() → los guards de layout fuerzan logout.
 * - registra el email en emails_bloqueados para impedir el reingreso.
 * - deja la acción registrada en equipo_acciones (trazabilidad).
 * Solo lo puede ejecutar un director sobre un asesor de SU misma agencia.
 */
export async function desvincularAsesor(agentId: string, motivo?: string) {
  const { directorId, agencyId, asesor, admin } = await requireDirectorSobreAsesor(agentId)
  const now = new Date().toISOString()

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      estado: "eliminado",
      tokens_invalidos_desde: now,
      deleted_at: now,
      deleted_by: directorId,
    })
    .eq("id", agentId)

  if (updateError) {
    console.error("Error desvinculando asesor:", updateError)
    throw new Error(updateError.message)
  }

  // Bloquear el email para impedir reingreso (best-effort; no rompe si falla).
  if (asesor.email) {
    const { error: blockError } = await admin.from("emails_bloqueados").insert({
      email: asesor.email,
      tipo_entidad: "asesor",
      entidad_id: agentId,
      razon: motivo?.trim() || "Desvinculado por el director",
      bloqueado_por: directorId,
      bloqueado_at: now,
    })
    if (blockError) console.error("No se pudo registrar el email bloqueado:", blockError)
  }

  await registrarAccion(admin, {
    agencyId,
    asesorId: asesor.id,
    ejecutadoPor: directorId,
    tipoAccion: "desvinculacion",
    motivo,
  })

  revalidatePath("/director/asesores")
  return { success: true }
}

/**
 * Devuelve la última acción de pausa vigente de un asesor (para mostrar el motivo
 * mientras está pausado): motivo, fecha y nombre de quién lo pausó.
 * Si la última acción no es una pausa (p. ej. ya se reanudó), devuelve null.
 */
export async function getUltimaAccionPausa(agentId: string) {
  const { agencyId, admin } = await requireDirectorSobreAsesor(agentId)

  const { data, error } = await admin
    .from("equipo_acciones")
    .select("tipo_accion, motivo, created_at, ejecutado_por")
    .eq("asesor_id", agentId)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data || data.tipo_accion !== "pausa") return null

  let ejecutadoPorNombre: string | null = null
  if (data.ejecutado_por) {
    const { data: quien } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", data.ejecutado_por)
      .maybeSingle()
    ejecutadoPorNombre = quien?.full_name ?? null
  }

  return {
    motivo: data.motivo as string | null,
    created_at: data.created_at as string,
    ejecutado_por_nombre: ejecutadoPorNombre,
  }
}
