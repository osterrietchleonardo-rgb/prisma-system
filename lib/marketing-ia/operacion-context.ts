import type { AdvisorOperation } from "@/types/marketing-ia"
import { CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA, type CampoOperacion } from "./campos-operacion"

const listar = (valores: Record<string, unknown>, campos: CampoOperacion[]): string[] =>
  campos
    .filter((c) => typeof valores?.[c.name] === "string" && (valores[c.name] as string).trim().length > 0)
    .map((c) => `- ${c.etiquetaPrompt}: ${(valores[c.name] as string).trim()}`)

/**
 * Bloque de prompt con la forma real de trabajar del asesor.
 * Devuelve "" si no hay nada cargado: así el prompt queda idéntico al de siempre.
 */
export function buildOperacionDirective(
  op: AdvisorOperation | null | undefined,
  tipoIpc: "captar" | "vender"
): string {
  if (!op) return ""

  const esCaptacion = tipoIpc === "captar"
  const oferta = (esCaptacion ? op.oferta_captacion : op.oferta_venta)?.trim() || ""
  const datos = [
    ...listar(esCaptacion ? op.captacion ?? {} : op.venta ?? {}, esCaptacion ? CAMPOS_CAPTACION : CAMPOS_VENTA),
    ...listar(op.perfil ?? {}, CAMPOS_PERFIL.filter((c) => c.name !== "no_prometer")),
  ]

  if (!oferta && datos.length === 0) return ""

  const noPrometer = op.perfil?.no_prometer?.trim()

  return `
FORMA REAL DE TRABAJAR DEL ASESOR (es lo que lo diferencia de cualquier otra inmobiliaria):
${oferta ? `\nOFERTA IRRESISTIBLE (columna vertebral del mensaje, tiene que estar sí o sí):\n${oferta}\n` : ""}
${datos.length ? `DATOS DUROS VERIFICADOS (la única fuente de números y pruebas):\n${datos.join("\n")}\n` : ""}
REGLAS SOBRE ESTOS DATOS:
- PROHIBIDO inventar cifras, plazos, porcentajes, testimonios, premios o garantías. Si un número no está en la lista de arriba, no existe y no se menciona.
- PROHIBIDO redondear o "mejorar" los números provistos.
- Usá los datos que hagan más fuerte el mensaje; no hace falta meterlos todos.${noPrometer ? `\n- PROHIBIDO prometer, insinuar o dar a entender lo siguiente: ${noPrometer}` : ""}`
}
