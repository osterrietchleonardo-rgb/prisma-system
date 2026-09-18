/**
 * Mandar UNA plantilla aprobada a UN teléfono. Extraído de lib/seguimiento/avisos.ts el 17/9,
 * cuando el chat web necesitó lo mismo para escribirle al visitante: el transporte tiene varios
 * detalles ganados a los golpes y no puede vivir en dos lugares.
 *
 * Lo que se aprendió y está acá adentro:
 * - Meta directo PRIMERO: es el camino de las campañas, el único con entrega verificada (26/8).
 *   Evolution `sendTemplate` respondió 200 sin id y el mensaje nunca llegó.
 * - En Evolution van `components`, NO `variables`: con `variables` manda la plantilla sin
 *   parámetros, Meta la rechaza (#132000) y Evolution igual responde 201 con el error adentro.
 * - Sin wamid NO es un éxito, aunque el HTTP diga 200.
 * - Si la plantilla no está aprobada, no se intenta: se dice cuál faltó.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type FetchFn = typeof fetch

export interface ResultadoPlantilla {
  resultado: string
  wamid: string | null
  plantilla: string | null
  respuesta?: unknown
}

/** El prefijo de las plantillas de una agencia: `ag` + los primeros 6 del id. */
export function prefijoDePlantillas(agencyId: string): string {
  return `ag${agencyId.replace(/-/g, "").substring(0, 6)}`
}

export async function enviarPlantillaAlTelefono(
  db: SupabaseClient,
  agencyId: string,
  envio: { telefono: string | null | undefined; plantilla: string; variables: string[] },
  fetchFn: FetchFn = fetch
): Promise<ResultadoPlantilla> {
  const telefono = envio.telefono?.replace(/\D/g, "")
  if (!telefono) return { resultado: "omitido_sin_celular", wamid: null, plantilla: null }
  const aviso = { plantilla: envio.plantilla, variables: envio.variables }
  const prefix = `ag${agencyId.replace(/-/g, "").substring(0, 6)}`
  const nombrePlantilla = `${prefix}_${aviso.plantilla}`
  const { data: tpl } = await db
    .from("wa_templates")
    .select("status")
    .eq("agency_id", agencyId)
    .eq("template_name", nombrePlantilla)
    .maybeSingle()
  if (tpl?.status !== "APPROVED")
    return { resultado: "omitido_plantilla_no_aprobada", wamid: null, plantilla: nombrePlantilla }

  const { data: inst } = await db
    .from("whatsapp_instances")
    .select("integration_type, evo_instance_name, phone_number_id, token")
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (!inst) return { resultado: "error_sin_instancia", wamid: null, plantilla: nombrePlantilla }

  const parametros = aviso.variables.map((v) => ({ type: "text", text: v }))
  // Meta directo PRIMERO: es el camino de las campañas, el único con entrega verificada (26/8).
  // Evolution `sendTemplate` respondió 200 sin id y el mensaje nunca llegó (prueba de las 12:45).
  if (inst.phone_number_id && inst.token) {
    const res = await fetchFn(`https://graph.facebook.com/v20.0/${inst.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${inst.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefono,
        type: "template",
        template: {
          name: nombrePlantilla,
          language: { code: "es_AR" },
          components: [{ type: "body", parameters: parametros }],
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok)
      return { resultado: `error_meta_${res.status}`, wamid: null, plantilla: nombrePlantilla, respuesta: data }
    const wamid = data?.messages?.[0]?.id ?? null
    return { resultado: "enviado", wamid, plantilla: nombrePlantilla, respuesta: wamid ? undefined : data }
  }
  if (inst.integration_type === "evolution" && inst.evo_instance_name) {
    const url = process.env.EVOLUTION_API_URL
    const key = process.env.EVOLUTION_API_KEY
    if (!url || !key) return { resultado: "error_evolution_sin_config", wamid: null, plantilla: nombrePlantilla }
    const res = await fetchFn(`${url}/message/sendTemplate/${inst.evo_instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      // `components`, NO `variables` (verificado 26/8 contra el código de Evolution 2.3.7 y con
      // envíos reales): con `variables` Evolution manda la plantilla sin parámetros, Meta la
      // rechaza (#132000) y Evolution igual responde 201 con el error adentro.
      body: JSON.stringify({
        number: telefono,
        name: nombrePlantilla,
        language: "es_AR",
        components: [{ type: "body", parameters: parametros }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { resultado: `error_evolution_${res.status}`, wamid: null, plantilla: nombrePlantilla, respuesta: data }
    if (data?.error_data || data?.code)
      return { resultado: `error_meta_${data.code ?? "?"}`, wamid: null, plantilla: nombrePlantilla, respuesta: data }
    const wamid = data?.key?.id ?? data?.messageId ?? data?.messages?.[0]?.id ?? null
    return { resultado: "enviado", wamid, plantilla: nombrePlantilla, respuesta: wamid ? undefined : data }
  }
  return { resultado: "error_sin_canal", wamid: null, plantilla: nombrePlantilla }
}
