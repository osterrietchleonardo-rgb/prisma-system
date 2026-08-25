import type { Candidato } from "./tipos"

/** El nombre válido es SOLO el de metricas (jamás el del perfil de WhatsApp) y con 3+ letras
 *  (decisión 25/8: "K" o "" = sin nombre; se sigue igual, sin nombrarlo). */
export function nombreValido(c: Candidato): string | null {
  const n = String(c.metricas?.nombre ?? "").trim()
  return n.length >= 3 ? n : null
}

/** El user-message inicial del loop. Mínimo: el agente investiga el resto con herramientas. */
export function renderizarSemilla(
  c: Candidato,
  score: number,
  compromisosActivos: number,
  ahoraISO: string,
  clasificacion: string | null = null
): string {
  const metricas =
    Object.entries(c.metricas ?? {})
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `  - ${k}: ${String(v)}`)
      .join("\n") || "  (sin datos capturados)"

  return [
    `Fecha y hora actual (Argentina): ${ahoraISO}`,
    // El nombre válido es SOLO el de metricas (jamás el del perfil de WhatsApp)
    `Lead: ${nombreValido(c) ?? "sin nombre (NO lo pidas ni lo inventes: si contesta, el conversacional se lo pedirá)"} · etapa: ${c.funnel_status} · score interno: ${score}`,
    `Origen del contacto: ${clasificacion ?? "desconocido"} (Whatsapp-Consulta = consultó él; Reclutamiento* = entró por un envío masivo de reclutamiento, NO es lead de propiedades)`,
    `Último mensaje (de cualquiera): ${c.last_message_at ?? "nunca"}`,
    `Intentos de seguimiento ya enviados: ${c.follow_ups_sent}`,
    `Compromisos activos: ${compromisosActivos} (el detalle con leer_compromisos)`,
    ...(String(c.metricas?.fue_derivado_a_humano) === "true" || String(c.metricas?.etapa) === "handoff"
      ? [`ATENCIÓN: este lead fue DERIVADO a un asesor humano. Verificá en los mensajes si algún [human] le escribió. Si nadie lo atendió, la acción correcta es "escalar" (no "contactar": el sistema bloquea seguimientos automáticos a leads en handoff).`]
      : []),
    `Datos capturados del lead:\n${metricas}`,
    `Investigá con tus herramientas lo que necesites y emití tu decisión con emitir_decision.`,
  ].join("\n\n")
}
