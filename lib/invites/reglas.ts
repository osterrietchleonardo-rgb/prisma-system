import { normalizePhoneE164 } from "@/lib/whatsapp/phone"
import type { CountryCode } from "libphonenumber-js"

/**
 * Las reglas de un código de invitación, en funciones puras.
 *
 * Viven acá y no adentro del formulario porque las usan los dos lados: el diálogo
 * del director (navegador) y el registro (servidor). Si cada uno tuviera su copia,
 * tarde o temprano dirían cosas distintas sobre el mismo dato.
 */

/** Minúsculas y sin espacios. Es la forma en que el email se guarda y se compara, siempre. */
export function normalizarEmail(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase()
}

// Mismo criterio que usa ManualContactFields: algo, arroba, algo, punto, algo.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValido(raw: string | null | undefined): boolean {
  return EMAIL_REGEX.test(normalizarEmail(raw))
}

export type DatosNuevoCodigo = {
  nombre: string
  email: string
  emailConfirm: string
  phone: string
  phoneConfirm: string
  country: CountryCode
}

export type ResultadoValidacion =
  | { ok: true; datos: { nombre: string; email: string; phone: string } }
  | { ok: false; error: string }

/**
 * Valida todo lo que hace falta para generar un código, y devuelve los datos ya
 * normalizados y listos para guardar. El primer error que encuentra es el que
 * devuelve: al director le sirve más una frase concreta que una lista.
 */
export function validarNuevoCodigo(d: DatosNuevoCodigo): ResultadoValidacion {
  const nombre = d.nombre.trim()
  if (!nombre) return { ok: false, error: "Escribí el nombre de la persona que vas a invitar" }
  if (nombre.length < 3) return { ok: false, error: "El nombre es demasiado corto" }

  const email = normalizarEmail(d.email)
  if (!emailValido(email)) return { ok: false, error: "El email no parece válido" }
  if (email !== normalizarEmail(d.emailConfirm)) {
    return { ok: false, error: "Los dos emails no coinciden" }
  }

  // Se comparan los números normalizados, no el texto: "11 2345-6789" y
  // "011 15 2345 6789" son el mismo celular y tienen que dar iguales.
  const phone = normalizePhoneE164(d.phone, d.country)
  if (!phone) return { ok: false, error: "El celular no parece válido para el país elegido" }
  if (phone !== normalizePhoneE164(d.phoneConfirm, d.country)) {
    return { ok: false, error: "Los dos celulares no coinciden" }
  }

  return { ok: true, datos: { nombre, email, phone } }
}

/**
 * Última barrera para un celular que YA viene en E.164 sin "+" — el formato en el
 * que se guarda `profiles.phone`. La usan generateAgencyInvite (lib/queries/director.ts)
 * y actualizarDatosAsesor (app/actions/asesores.ts) antes de escribir en la base,
 * porque las dos son funciones públicas que no pueden confiar en que las llamen bien.
 *
 * Antepone "+" y vuelve a pasarlo por normalizePhoneE164 SIN fijar país, para que
 * libphonenumber-js lo deduzca del propio número (ej: +525512345678 es México) en
 * vez de asumir uno fijo. Ese "país fijo" es el defecto que apareció cuatro veces
 * en esta rama: funcionaba para Argentina y devolvía null para México, Colombia,
 * Brasil y Uruguay. Estar en un solo lugar, testeado, es lo que evita que los dos
 * consumidores diverjan si alguien toca uno y se olvida del otro.
 */
export function validarCelularGuardado(e164: string): string | null {
  return normalizePhoneE164("+" + e164.trim())
}

/**
 * ¿El que se está registrando es la persona a la que se le mandó el código?
 *
 * Si el código no trae email es uno viejo, anterior a esta función: no hay contra
 * qué validar, así que se comporta como antes y deja pasar. (Spec §5.5)
 */
export function emailCoincideConInvite(
  inviteEmail: string | null | undefined,
  emailDeRegistro: string
): boolean {
  const esperado = normalizarEmail(inviteEmail)
  if (!esperado) return true
  return esperado === normalizarEmail(emailDeRegistro)
}
