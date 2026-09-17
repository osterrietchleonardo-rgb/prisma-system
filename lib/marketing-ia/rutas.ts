/**
 * Las direcciones de las páginas de Marketing IA, una por lo que antes era una solapa.
 *
 * Están acá y no sueltas en cada componente porque las usan tres lugares: el menú
 * de la barra, la navegación automática (terminó de generar → Historial; "seguir
 * editando" en la galería → HomeStaging) y los links desde otros módulos (ACM).
 */
export type Rol = "director" | "asesor"

export type SeccionMarketing =
  | "crear-anuncio"
  | "homestaging"
  | "clientes-ideales"
  | "mi-adn"
  | "historial"
  | "guia-magica"
  | "configuracion-ia"

/** La página a la que entra alguien que escribe /marketing-ia a secas (la primera solapa de antes). */
export const SECCION_INICIAL_MARKETING: SeccionMarketing = "crear-anuncio"

/** Solo el director configura Marketing IA; el asesor no tenía esa solapa y sigue sin tenerla. */
export const SECCIONES_MARKETING_ASESOR: ReadonlyArray<SeccionMarketing> = [
  "crear-anuncio", "homestaging", "clientes-ideales", "mi-adn", "historial", "guia-magica",
]

export function rutaMarketing(rol: Rol, seccion: SeccionMarketing): string {
  // El asesor ve "Mis Generaciones" donde el director ve "Historial / Galería": mismo
  // componente, distinto nombre, y la dirección acompaña al nombre.
  if (seccion === "historial" && rol === "asesor") return "/asesor/marketing-ia/mis-generaciones"
  return `/${rol}/marketing-ia/${seccion}`
}
