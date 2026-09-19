/**
 * Seguimiento · a qué operaciones se les avisa al equipo.
 *
 * Kevin, 19/9/2026: «Apaguemos el reporting de cada tantas horas para los alquileres y que haga
 * el Handoff lo más rápido posible». El motivo se ve en los datos: en alquiler casi todo lo que
 * el cliente pregunta —garantía, seguro de caución, honorarios, depósito— solo lo sabe el asesor,
 * así que perseguirlo con avisos a las 2, 5, 10 y 20 h no cambia el resultado y tapa los avisos
 * de venta, que sí valen. En 7 días, 63 de los 240 avisos al equipo fueron de alquileres.
 *
 * Esto NO apaga el email del momento de la derivación (ese lo manda n8n al hacer el handoff):
 * apaga las REPETICIONES. El equipo se sigue enterando de que hay un cliente esperando.
 *
 * Es una regla del producto, no de una agencia: si mañana una inmobiliaria vive del alquiler,
 * esto pasa a ser una columna de `seguimiento_config` y se decide por agencia.
 */

/** Lo que el agente de n8n escribe en `metricas.tipo_operacion`: compra, alquiler, venta, inversion. */
export const OPERACIONES_SIN_AVISO = ["alquiler", "alquilar", "temporal", "temporario"] as const

/**
 * ¿Hay que avisarle al equipo por este lead?
 *
 * Ante la duda, SÍ: si el dato falta, viene vacío o dice algo que no entendemos, el aviso sale.
 * Callar por un campo que no se pudo leer sería perder un lead de venta en silencio.
 */
export function avisaPorEstaOperacion(metricas: Record<string, unknown> | null | undefined): boolean {
  const operacion = String((metricas ?? {}).tipo_operacion ?? "").trim().toLowerCase()
  if (!operacion || operacion === "null" || operacion === "undefined") return true
  return !OPERACIONES_SIN_AVISO.some((sinAviso) => operacion === sinAviso)
}
