import { parsePhoneNumberFromString } from "libphonenumber-js"

/**
 * Normaliza un teléfono argentino al formato que usa WhatsApp (solo dígitos, ej. 5491161328586).
 * Cubre los formatos más variados: con/sin +, con 0 de trunk, con 15 de móvil, y áreas de
 * 2/3/4 dígitos (11, 221, 2227, etc.). Usa libphonenumber-js (default país AR).
 * Devuelve null si no se puede interpretar como un número válido.
 */
export function normalizeArgPhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null

  try {
    const pn = parsePhoneNumberFromString(s, "AR")
    if (pn && pn.isValid()) {
      // E.164 sin '+': +5491161328586 -> 5491161328586
      return pn.number.replace(/\D/g, "")
    }
  } catch {
    /* sigue al fallback */
  }

  // Fallback de último recurso: solo dígitos, si parece tener país + área + número.
  const digits = s.replace(/\D/g, "")
  if (digits.length >= 10) {
    return digits.startsWith("54") ? digits : "54" + digits
  }
  return null
}
