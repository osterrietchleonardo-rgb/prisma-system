/**
 * Clave para cruzar el mismo teléfono entre fuentes distintas.
 *
 * En la base conviven formatos incompatibles para el mismo número: "+54 1150458476",
 * "5491154054949", "1140290585". Los últimos 10 dígitos son la única parte estable
 * (código de área + número), así que esa es la clave.
 *
 * No se usa normalizePhoneE164 de lib/whatsapp/phone: esa función valida y devuelve
 * null para los números guardados sin código de país, que acá igual hay que matchear.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const digitos = String(raw ?? "").replace(/\D/g, "")
  if (digitos.length < 10) return null
  return digitos.slice(-10)
}
