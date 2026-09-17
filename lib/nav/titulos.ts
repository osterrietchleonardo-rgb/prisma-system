/**
 * El título que muestra el header arriba de cada página sale del último tramo
 * de la dirección ("leads-whatsapp" → "Leads whatsapp"). Acá van los tramos cuyo
 * nombre visible no coincide con eso: los que tienen acento, sigla o mayúscula
 * en el medio.
 */
export const TITULOS_POR_SEGMENTO: Record<string, string> = {
  aprobaciones: "Equipo",
  "asesor-ia-whatsapp": "Asesor IA WhatsApp",
  "contratos-ia": "Contratos IA",
  // Difusión
  campanas: "Campañas",
  "configuracion-ia": "Configuración IA",
  // Marketing IA
  "crear-anuncio": "Crear Anuncio",
  homestaging: "HomeStaging",
  "clientes-ideales": "Clientes Ideales (IPC)",
  "mi-adn": "Mi ADN",
  historial: "Historial / Galería",
  "mis-generaciones": "Mis Generaciones",
  "guia-magica": "Guía Mágica",
}

/** "leads-whatsapp" → "Leads whatsapp", salvo que esté en la tabla de arriba. */
export function tituloDelSegmento(segmento: string): string {
  return TITULOS_POR_SEGMENTO[segmento] || segmento.charAt(0).toUpperCase() + segmento.slice(1).replace(/-/g, " ")
}
