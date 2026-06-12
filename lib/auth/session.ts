/**
 * Extrae el claim `iat` (issued-at, en segundos UNIX) del JWT de acceso de Supabase.
 *
 * El objeto `User` de Supabase NO expone `iat`; este claim vive dentro del
 * payload del `access_token`. Se usa para invalidar sesiones emitidas antes de
 * `profiles.tokens_invalidos_desde`.
 *
 * Fail-closed: ante cualquier error de parseo devuelve 0, lo que fuerza el
 * logout (comportamiento defensivo equivalente al `?? 0` previo).
 */
export function getTokenIssuedAt(accessToken: string | undefined | null): number {
  if (!accessToken) return 0
  try {
    const part = accessToken.split(".")[1]
    if (!part) return 0
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/")
    const payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"))
    return typeof payload.iat === "number" ? payload.iat : 0
  } catch {
    return 0
  }
}
