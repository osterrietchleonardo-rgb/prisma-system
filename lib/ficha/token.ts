// Token corto y legible (base62, ~12 chars, ~71 bits). No es secreto: identifica una
// ficha pública. Estaba duplicado en app/api/ficha/share y app/api/acm/ficha.
import crypto from "crypto"

const ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

export function generarToken(): string {
  const bytes = crypto.randomBytes(12)
  let t = ""
  for (const b of Array.from(bytes)) t += ALFABETO[b % 62]
  return t
}
