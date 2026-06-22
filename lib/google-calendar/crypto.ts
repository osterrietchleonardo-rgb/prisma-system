import crypto from "crypto"

/**
 * Encriptado simétrico del refresh_token de Google (AES-256-GCM).
 *
 * La clave sale de GOOGLE_TOKEN_ENCRYPTION_KEY (32 bytes en base64 o hex, o
 * cualquier string que derivamos a 32 bytes con SHA-256 como fallback).
 *
 * Formato de salida: "<iv_base64>:<authTag_base64>:<ciphertext_base64>"
 */

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY no está configurada")
  }
  // Intentamos base64 (32 bytes) → hex (64 chars) → derivar con sha256
  try {
    const b64 = Buffer.from(raw, "base64")
    if (b64.length === 32) return b64
  } catch {
    /* ignore */
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex")
  }
  return crypto.createHash("sha256").update(raw).digest()
}

export function encryptToken(plain: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":")
}

export function decryptToken(payload: string): string {
  const key = getKey()
  const [ivB64, tagB64, dataB64] = payload.split(":")
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token encriptado con formato inválido")
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  )
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ])
  return plain.toString("utf8")
}
