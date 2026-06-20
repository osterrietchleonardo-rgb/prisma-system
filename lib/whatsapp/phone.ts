import {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js"

/**
 * Normaliza un teléfono al formato que exige la WhatsApp Cloud API (E.164 sin "+",
 * solo dígitos, ej. 5491123456789). Usa libphonenumber-js, que es la librería que el
 * propio WhatsApp usa internamente: resuelve el "9" de Argentina, el "1" de México, el
 * trunk "0", el "15" móvil, etc., según el país indicado.
 *
 * @param raw     Lo que escribió el usuario (formato local, con o sin separadores).
 * @param country País por defecto para interpretar números locales (ISO-2, ej. "AR").
 * @returns       Dígitos en E.164 sin "+", o null si el número no es válido.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  country: CountryCode = "AR"
): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null

  try {
    const pn = parsePhoneNumberFromString(s, country)
    if (pn && pn.isValid()) {
      let digits = pn.number.replace(/\D/g, "") // +5491123456789 -> 5491123456789

      // Argentina: WhatsApp exige el "9" de móvil. Si el asesor escribe el celular sin el
      // "15" ni el "9" (ej. "221 308 9334"), libphonenumber lo deja como 54 + área + número
      // (formato de línea fija). Como estos contactos son siempre celulares de WhatsApp,
      // insertamos el 9 después del código de país. (Regla acotada a AR, aplicada tras validar.)
      if (country === "AR" && digits.startsWith("54") && !digits.startsWith("549")) {
        digits = "549" + digits.slice(2)
      }

      return digits
    }
  } catch {
    /* cae al return null */
  }
  return null
}

/** Devuelve la representación E.164 "linda" (+54 9 11 2345-6789) para mostrar al usuario. */
export function formatPhoneInternational(
  raw: string | null | undefined,
  country: CountryCode = "AR"
): string | null {
  // Formateamos a partir del E.164 ya normalizado, así el preview refleja exactamente
  // lo que se guarda (incluido el "9" móvil de Argentina).
  const e164 = normalizePhoneE164(raw, country)
  if (!e164) return null
  try {
    const pn = parsePhoneNumberFromString("+" + e164)
    if (pn) return pn.formatInternational()
  } catch {
    /* noop */
  }
  return "+" + e164
}

const flagEmoji = (iso: string) =>
  iso
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)))

export interface CountryOption {
  iso: CountryCode
  name: string
  callingCode: string
  flag: string
}

/**
 * Lista de países para el selector telefónico, con nombre localizado (vía Intl.DisplayNames),
 * bandera emoji y código de llamada. Ordenada alfabéticamente con AR/UY/CL/MX/ES/US arriba.
 */
export function getPhoneCountries(locale = "es"): CountryOption[] {
  let regionNames: Intl.DisplayNames | null = null
  try {
    regionNames = new Intl.DisplayNames([locale], { type: "region" })
  } catch {
    regionNames = null
  }

  const list: CountryOption[] = getCountries().map((iso) => ({
    iso,
    name: regionNames?.of(iso) || iso,
    callingCode: getCountryCallingCode(iso),
    flag: flagEmoji(iso),
  }))

  const priority = ["AR", "UY", "CL", "PY", "BO", "MX", "ES", "US"]
  return list.sort((a, b) => {
    const pa = priority.indexOf(a.iso)
    const pb = priority.indexOf(b.iso)
    if (pa !== -1 || pb !== -1) {
      if (pa === -1) return 1
      if (pb === -1) return -1
      return pa - pb
    }
    return a.name.localeCompare(b.name, locale)
  })
}
