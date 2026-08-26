"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { validarCelularGuardado } from "@/lib/invites/reglas"

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
    .select("id, email, full_name, phone, role, agency_id")
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
    // asesorId va en null SOLO en el borrado definitivo: el perfil deja de
    // existir y la FK impediria guardar la constancia.
    asesorId: string | null
    ejecutadoPor: string
    tipoAccion: "pausa" | "reanudacion" | "desvinculacion" | "eliminacion_definitiva" | "edicion_datos"
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
 * El director corrige el nombre o el celular de un asesor de su inmobiliaria.
 *
 * El email NO se toca: es la cuenta con la que la persona se registró y cambiarlo
 * sería cambiarle el usuario.
 */
export async function actualizarDatosAsesor(
  agentId: string,
  datos: { full_name?: string; phone?: string }
) {
  const { directorId, agencyId, asesor, admin } = await requireDirectorSobreAsesor(agentId)

  const cambios: Record<string, string> = {}
  const detalle: string[] = []

  if (datos.full_name !== undefined) {
    const nombre = datos.full_name.trim()
    if (nombre.length < 3) throw new Error("El nombre es demasiado corto")
    if (nombre !== asesor.full_name) {
      cambios.full_name = nombre
      detalle.push(`nombre: "${asesor.full_name ?? "—"}" → "${nombre}"`)
    }
  }

  if (datos.phone !== undefined) {
    // El valor ya viene en E.164 sin "+", normalizado por la pantalla. Esta
    // función es pública y no puede confiar en que la llamen bien, así que se
    // vuelve a validar acá antes de guardar nada. validarCelularGuardado()
    // vive en lib/invites/reglas.ts, junto con su test: no repetir esta línea
    // acá evita que este consumidor y generateAgencyInvite() diverjan.
    const phone = validarCelularGuardado(datos.phone)
    if (!phone) throw new Error("El celular no parece válido")
    if (phone !== asesor.phone) {
      cambios.phone = phone
      detalle.push(`celular: "${asesor.phone ?? "—"}" → "${phone}"`)
    }
  }

  if (Object.keys(cambios).length === 0) return { success: true as const }

  const { error } = await admin.from("profiles").update(cambios).eq("id", agentId)
  if (error) {
    console.error("Error actualizando datos del asesor:", error)
    throw new Error(error.message)
  }

  await registrarAccion(admin, {
    agencyId,
    asesorId: asesor.id,
    ejecutadoPor: directorId,
    tipoAccion: "edicion_datos",
    motivo: detalle.join(" · "),
  })

  revalidatePath("/director/asesores")
  return { success: true as const }
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

  // Bloquear el email para impedir reingreso.
  //
  // `bloqueado_por` va en NULL a proposito: es una FK contra `admin_vakdor_users`
  // (los admins internos de Vakdor), NO contra `profiles`. Pasarle el id del
  // director hacia fallar el INSERT con violacion de FK (23503) en TODAS las
  // desvinculaciones, y como es best-effort fallaba mudo: la tabla quedaba
  // vacia y el email nunca se bloqueaba de verdad. Quien ejecuto la accion ya
  // queda registrado en `equipo_acciones` (abajo), asi que no se pierde nada.
  if (asesor.email) {
    const { error: blockError } = await admin.from("emails_bloqueados").insert({
      email: asesor.email,
      tipo_entidad: "asesor",
      entidad_id: agentId,
      razon: motivo?.trim() || "Desvinculado por el director",
      bloqueado_por: null,
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

// Clasificaciones válidas que el director puede asignar a un asesor.
// (no se exporta la constante: en un archivo "use server" solo pueden
// exportarse funciones async; el tipo sí, porque se borra al compilar)
const CLASIFICACIONES_ASESOR = ["client_director", "client_support"] as const
export type ClasificacionAsesor = (typeof CLASIFICACIONES_ASESOR)[number]

/**
 * Asigna (o quita) la clasificación de un asesor: "Client Director" o
 * "Client Support". Pasar null lo deja como "Asesor" (sin clasificación).
 * Solo el director de SU misma agencia puede hacerlo.
 */
export async function setClasificacionAsesor(
  agentId: string,
  clasificacion: ClasificacionAsesor | null
) {
  if (clasificacion !== null && !CLASIFICACIONES_ASESOR.includes(clasificacion)) {
    throw new Error("Clasificación inválida")
  }

  const { admin } = await requireDirectorSobreAsesor(agentId)

  const { error } = await admin
    .from("profiles")
    .update({ clasificacion })
    .eq("id", agentId)

  if (error) {
    console.error("Error clasificando asesor:", error)
    throw new Error(error.message)
  }

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

// ─── Borrado definitivo (duplicados / cargas por error) ─────────────────────
//
// Distinto de desvincular: desvincular marca y conserva el historial; esto
// BORRA la fila. Solo se permite sobre un perfil SIN trabajo real encima,
// porque 7 de las 33 tablas que apuntan a profiles estan en ON DELETE CASCADE
// — entre ellas performance_logs — y borrar a alguien real le destruiria toda
// su actividad registrada en silencio.
//
// Criterio de LISTA BLANCA, no de lista negra: aca van solo las tablas que son
// subproducto de haber tenido una cuenta. TODO lo demas bloquea el borrado.
// Asi, una tabla nueva a futuro bloquea por defecto en vez de ser ignorada.
//
// Los nombres van SIN prefijo de esquema: asesor_huella_datos devuelve
// regclass::text, que con search_path=public da "leads", no "public.leads".
const RASTROS_ADMINISTRATIVOS = new Set([
  "equipo_acciones",        // la auditoria de la propia gestion del perfil
  "agency_invites",         // el codigo de invitacion que consumio
  "notifications",          // notificaciones personales
  "google_calendar_tokens", // token de su calendario
  "whatsapp_ai_settings",   // su configuracion personal
  "system_feedback",        // feedback enviado (queda anonimizado por SET NULL)
])

// Nombre legible para el mensaje que ve el director.
const ETIQUETAS_TABLA: Record<string, string> = {
  leads: "leads",
  properties: "propiedades",
  wa_conversations: "conversaciones de WhatsApp",
  wa_contacts: "contactos de WhatsApp",
  performance_logs: "registros de actividad",
  performance_objectives: "objetivos cargados",
  performance_objective_weights: "pesos de objetivos",
  tracking_pipeline_moves: "movimientos de pipeline",
  closings: "cierres",
  visits: "visitas",
  scheduled_visits: "visitas agendadas",
  valuations: "tasaciones",
  contratos: "contratos",
  contract_templates: "plantillas de contrato",
  contract_template_versions: "versiones de plantilla",
  lead_activities: "actividades de leads",
  acm_searches: "análisis de mercado",
  shared_acm_reports: "informes de ACM compartidos",
  shared_properties: "fichas compartidas",
  agency_documents: "documentos subidos",
  document_folders: "carpetas de documentos",
  wa_campaigns: "campañas de WhatsApp",
  ai_credit_transactions: "consumo de créditos IA",
  agencies: "inmobiliarias a su nombre",
  director_invites: "invitaciones de director",
}

/**
 * Mide que tiene el perfil encima y decide si puede borrarse definitivamente.
 * Se usa para pintar el diálogo ANTES de que el director confirme, y la vuelve
 * a correr `eliminarAsesorDefinitivamente` antes de borrar (el chequeo del
 * diálogo es para mostrar, no para autorizar).
 */
export async function getHuellaDatosAsesor(agentId: string) {
  const { admin } = await requireDirectorSobreAsesor(agentId)

  const { data, error } = await admin.rpc("asesor_huella_datos", { p_id: agentId })
  if (error) {
    console.error("Error midiendo la huella del asesor:", error)
    throw new Error("No se pudo verificar si este asesor tiene datos asociados")
  }

  const filas = (data ?? []) as { tabla: string; columna: string; filas: number }[]

  // Se agrupa por tabla: una misma tabla puede apuntar a profiles por mas de
  // una columna (equipo_acciones lo hace por asesor_id y por ejecutado_por).
  const porTabla = new Map<string, number>()
  for (const f of filas) {
    if (RASTROS_ADMINISTRATIVOS.has(f.tabla)) continue
    porTabla.set(f.tabla, (porTabla.get(f.tabla) ?? 0) + Number(f.filas))
  }

  const bloqueantes = Array.from(porTabla.entries())
    .map(([tabla, n]) => ({ etiqueta: ETIQUETAS_TABLA[tabla] ?? tabla, filas: n }))
    .sort((a, b) => b.filas - a.filas)

  return { puedeBorrarse: bloqueantes.length === 0, bloqueantes }
}

/**
 * Borra DE VERDAD el perfil de un asesor. Para duplicados o cargas por error.
 * Irreversible y sin rastro del perfil: la única constancia queda en
 * `equipo_acciones` con `asesor_id=NULL` y la identidad escrita en el motivo.
 *
 * Se niega si el perfil tiene trabajo real encima (ver getHuellaDatosAsesor).
 */
export async function eliminarAsesorDefinitivamente(agentId: string, motivo: string) {
  if (!motivo?.trim()) throw new Error("Escribí el motivo del borrado")

  const { directorId, agencyId, asesor, admin } = await requireDirectorSobreAsesor(agentId)

  const { puedeBorrarse, bloqueantes } = await getHuellaDatosAsesor(agentId)
  if (!puedeBorrarse) {
    const detalle = bloqueantes.map((b) => `${b.filas} ${b.etiqueta}`).join(", ")
    throw new Error(
      `No se puede eliminar definitivamente: este asesor tiene ${detalle} a su nombre. ` +
        `Eso no es un duplicado. Usá "Desvincular" para que conserve su historial.`
    )
  }

  const identidad = `${asesor.full_name || "(sin nombre)"} <${asesor.email || "sin email"}>`

  // 1. Limpiar los rastros administrativos que bloquearian por FK.
  await admin.from("equipo_acciones").delete().eq("asesor_id", agentId)
  await admin.from("agency_invites").update({ used_by: null }).eq("used_by", agentId)

  // 2. Dejar constancia ANTES de borrar, con asesor_id en null a proposito.
  await registrarAccion(admin, {
    agencyId,
    asesorId: null,
    ejecutadoPor: directorId,
    tipoAccion: "eliminacion_definitiva",
    motivo: `${identidad} — ${motivo.trim()}`,
  })

  // 3. Destrabar el email: si era un duplicado, esa direccion no tiene por que
  //    quedar inutilizable (una desvinculacion previa pudo haberla bloqueado).
  if (asesor.email) {
    await admin.from("emails_bloqueados").delete().eq("email", asesor.email)
  }

  // 4. Borrar el usuario de auth. profiles.id -> auth.users es ON DELETE
  //    CASCADE, asi que la fila de profiles se va sola.
  const { error: authError } = await admin.auth.admin.deleteUser(agentId)
  if (authError) {
    console.error("Error borrando el usuario de auth:", authError)
    throw new Error(`No se pudo borrar la cuenta: ${authError.message}`)
  }

  revalidatePath("/director/asesores")
  return {
    success: true as const,
    borrado: { nombre: asesor.full_name || "", email: asesor.email || "" },
  }
}
