/**
 * Auth de Google service-account para BigQuery y Analytics, sin dependencias externas.
 * Firma un JWT RS256 y lo canjea por un access token OAuth2.
 * Lee de .env: CLIENT_EMAIL, PRIVATE_KEY (con \n escapados), TOKEN_URI.
 */
import { createSign } from "crypto"

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")

const cachedTokens: Record<string, { token: string; exp: number }> = {}

export async function getGoogleAccessToken(
  scope = "https://www.googleapis.com/auth/bigquery.readonly"
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const existing = cachedTokens[scope]
  if (existing && existing.exp - 60 > now) return existing.token

  const clientEmail = process.env.CLIENT_EMAIL
  const privateKey = (process.env.PRIVATE_KEY || "").replace(/\\n/g, "\n")
  const tokenUri = process.env.TOKEN_URI || "https://oauth2.googleapis.com/token"
  if (!clientEmail || !privateKey) throw new Error("Faltan credenciales de Google (CLIENT_EMAIL / PRIVATE_KEY)")

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(JSON.stringify({ iss: clientEmail, scope, aud: tokenUri, iat: now, exp: now + 3600 }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${claims}`)
  const sig = signer.sign(privateKey).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
  const jwt = `${header}.${claims}.${sig}`

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    cache: "no-store",
  })
  const j = await res.json()
  if (!res.ok || !j.access_token) throw new Error(`Google token ${res.status}: ${JSON.stringify(j).slice(0, 200)}`)

  cachedTokens[scope] = { token: j.access_token, exp: now + (j.expires_in || 3600) }
  return j.access_token
}

export function hasGoogleCreds(): boolean {
  return !!(process.env.CLIENT_EMAIL && process.env.PRIVATE_KEY && process.env.PROJECT_ID)
}
