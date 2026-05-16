/**
 * Admin Vakdor — JWT Authentication
 * Totalmente independiente de Supabase Auth.
 * Usa Web Crypto API (disponible en Next.js Edge/Node).
 */

const ALGORITHM = "HS256"
const JWT_SECRET = process.env.ADMIN_VAKDOR_JWT_SECRET!
const EXPIRY_HOURS = 8

export interface AdminVakdorPayload {
  sub: string       // admin_vakdor_users.id
  email: string
  role: "admin_vakdor"
  iat: number
  exp: number
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
  const padding = (4 - (padded.length % 4)) % 4
  const base64 = padded + "=".repeat(padding)
  const binary = atob(base64)
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)))
}

async function getKey(): Promise<CryptoKey> {
  if (!JWT_SECRET) {
    throw new Error("ADMIN_VAKDOR_JWT_SECRET is not set")
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function signAdminToken(adminId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: AdminVakdorPayload = {
    sub: adminId,
    email,
    role: "admin_vakdor",
    iat: now,
    exp: now + EXPIRY_HOURS * 3600,
  }

  const header = base64url(JSON.stringify({ alg: ALGORITHM, typ: "JWT" }))
  const body = base64url(JSON.stringify(payload))
  const signingInput = `${header}.${body}`

  const key = await getKey()
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${base64url(new Uint8Array(signature))}`
}

export async function verifyAdminToken(token: string): Promise<AdminVakdorPayload | null> {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    const [header, body, sig] = parts
    const signingInput = `${header}.${body}`

    const key = await getKey()
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlDecode(sig),
      new TextEncoder().encode(signingInput)
    )

    if (!valid) return null

    const payload: AdminVakdorPayload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(body))
    )

    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    if (payload.role !== "admin_vakdor") return null

    return payload
  } catch {
    return null
  }
}

export const ADMIN_COOKIE_NAME = "admin_vakdor_token"
export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: EXPIRY_HOURS * 3600,
  path: "/",
}
