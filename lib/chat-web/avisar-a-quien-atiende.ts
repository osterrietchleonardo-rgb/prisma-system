/**
 * Chat web · El aviso por WhatsApp a quien va a atender el lead (Leonardo, 17/9).
 *
 * El email ya sale, pero un email se lee tarde y un contacto de la web se enfría en minutos. Este
 * es el aviso que suena en el teléfono.
 *
 * Va a UNA sola persona, la que le toca según el reparto:
 * - si la consulta es de un asesor de PRISMA, a su celular, con el link al chat EN PRISMA;
 * - si es del contacto de afuera, a su WhatsApp, con el link para escribirle al visitante.
 *
 * Lo que se manda es lo mínimo para decidir si atenderlo ahora: qué necesita, su teléfono y el
 * link. El detalle completo está en el email y en la bandeja.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { enviarPlantillaAlTelefono } from "@/lib/whatsapp/enviar-plantilla"
import { telefonoUsable, type DatosVisitante, type ObjetivoDerivacion } from "./derivar"

export const PLANTILLA_AVISO = "web_lead_nuevo"

const QUE_NECESITA: Record<ObjetivoDerivacion, string> = {
  busca_propiedad: "busca una propiedad",
  vender_propiedad: "quiere vender o alquilar su propiedad",
  sumarse_equipo: "quiere sumarse al equipo",
  consulta_empresa: "tiene una consulta",
  reclamo: "trae un reclamo",
}

/** El resumen que entra en un WhatsApp: qué necesita y cómo ubicarlo. Sin HTML y sin vueltas. */
export function resumenParaElAviso(
  objetivo: ObjetivoDerivacion,
  datos: DatosVisitante,
  detalle: string
): string {
  const nombre = String(datos.nombre ?? "").replace(/<[^>]*>/g, "").trim() || "Alguien"
  const tel = telefonoUsable(datos.telefono)
  const como = tel ? `Tel: +${tel}.` : datos.email ? `Email: ${String(datos.email).trim()}.` : "Sin datos de contacto."
  const extra = String(detalle ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
  return `${nombre} ${QUE_NECESITA[objetivo]}. ${extra ? `${extra} ` : ""}${como}`.slice(0, 380)
}

export async function avisarPorWhatsApp(
  db: SupabaseClient,
  aviso: {
    agencyId: string
    /** El celular de quien atiende: el del asesor, o el que el director cargó en el formulario. */
    telefonoDestino: string | null | undefined
    /** Cómo saludarlo. */
    nombreDestino: string
    objetivo: ObjetivoDerivacion
    datos: DatosVisitante
    detalle: string
    /** El chat en PRISMA, o el wa.me del visitante. Sin link no se manda: el aviso no serviría. */
    link: string | null
  },
  fetchFn: typeof fetch = fetch
): Promise<{ resultado: string; wamid: string | null }> {
  if (!aviso.link) return { resultado: "omitido_sin_link", wamid: null }
  const telefono = telefonoUsable(aviso.telefonoDestino)
  if (!telefono) return { resultado: "omitido_sin_celular", wamid: null }

  const r = await enviarPlantillaAlTelefono(
    db,
    aviso.agencyId,
    {
      telefono,
      plantilla: PLANTILLA_AVISO,
      variables: [
        (aviso.nombreDestino || "").split(" ")[0] || "¿cómo estás?",
        resumenParaElAviso(aviso.objetivo, aviso.datos, aviso.detalle),
        aviso.link,
      ],
    },
    fetchFn
  )
  return { resultado: r.resultado, wamid: r.wamid }
}
