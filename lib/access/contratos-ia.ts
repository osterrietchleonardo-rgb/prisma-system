// Acceso a "Contratos IA" por agencia.
//
// Para esta agencia el módulo "Contratos IA" se muestra DESHABILITADO en el menú
// (director + asesores) y, además, se bloquea el acceso directo por URL.
// Cliente: Kevin Arlandi.
export const CONTRATOS_IA_AGENCIA_DESHABILITADA = "4962bf85-a92c-4c33-ba07-380686bbab76"

/** True si la agencia indicada NO tiene acceso a Contratos IA. */
export function contratosIaDeshabilitado(agencyId?: string | null): boolean {
  return agencyId === CONTRATOS_IA_AGENCIA_DESHABILITADA
}
