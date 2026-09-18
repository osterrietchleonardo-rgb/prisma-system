/**
 * Chat web · Quién puede ver la bandeja, y qué parte.
 *
 * Regla de Leonardo (17/9): la bandeja del chat web la ven **los directores**, y **el asesor que
 * el director eligió en el desplegable** del formulario. Nadie más.
 *
 * No es una formalidad: ahí adentro hay nombres, teléfonos y emails de gente que entró a la web
 * de la inmobiliaria y todavía no es cliente de nadie. Que todo el equipo pueda mirarlos —y
 * llamarlos— es exactamente lo que no queremos.
 *
 * El asesor elegido lo fue para UNA cosa: recibir a los que quieren sumarse al equipo. Así que ve
 * esas conversaciones y nada más; las de compradores y vendedores son del director. Si esto tiene
 * que cambiar, se cambia acá y en la política de la base, que dice lo mismo.
 */

export interface Mirando {
  id: string
  rol: string | null | undefined
}

export interface WidgetDeLaAgencia {
  perfil_equipo_id: string | null
}

export function puedeVerBandejaWeb(quien: Mirando, widget: WidgetDeLaAgencia | null): boolean {
  if (quien.rol === "director") return true
  if (quien.rol !== "asesor") return false
  return Boolean(widget?.perfil_equipo_id) && widget!.perfil_equipo_id === quien.id
}

export type FiltroBandeja = { todas: true } | { todas: false; objetivo: string }

/** Qué conversaciones ve. `null` = no ve nada (y el endpoint no tiene que devolver ninguna). */
export function filtroDeBandeja(quien: Mirando, widget: WidgetDeLaAgencia | null): FiltroBandeja | null {
  if (!puedeVerBandejaWeb(quien, widget)) return null
  if (quien.rol === "director") return { todas: true }
  // Al asesor lo eligieron para los "quiero sumarme al equipo": ve esos.
  return { todas: false, objetivo: "sumarse_equipo" }
}
