import { normalizePhoneE164 } from "@/lib/whatsapp/phone"

/**
 * Normaliza un teléfono argentino al formato que usa WhatsApp (solo dígitos, ej. 5491161328586).
 * Cubre los formatos más variados: con/sin +, con 0 de trunk, con 15 de móvil, áreas de
 * 2/3/4 dígitos (11, 221, 2227, …) y, para celulares cargados sin el 15, inserta el "9" móvil.
 *
 * Delega en `normalizePhoneE164(raw, "AR")` (libphonenumber-js) para tener una ÚNICA fuente de
 * verdad compartida con el alta manual de contactos. Conserva un fallback de último recurso para
 * números que libphonenumber rechaza pero que parecen tener país+área+número (útil en imports
 * de planillas sucias).
 *
 * Devuelve null si no se puede interpretar como un número válido.
 */
export function normalizeArgPhone(raw: string | null | undefined): string | null {
  const normalized = normalizePhoneE164(raw, "AR")
  if (normalized) return normalized

  // Fallback de último recurso: solo dígitos, si parece tener país + área + número.
  if (raw === null || raw === undefined) return null
  const digits = String(raw).replace(/\D/g, "")
  if (digits.length >= 10) {
    let d = digits.startsWith("54") ? digits : "54" + digits
    // Mantener el criterio AR: si quedó como 54+área sin el 9 móvil, agregarlo.
    if (d.startsWith("54") && !d.startsWith("549")) d = "549" + d.slice(2)
    return d
  }
  return null
}
