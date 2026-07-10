import { NextResponse } from "next/server"

/**
 * Autorización de endpoints cron. Falla CERRADO: si CRON_SECRET no está configurado
 * en el entorno, o el header no coincide, devuelve 401. Nunca deja el endpoint abierto.
 *
 * Uso:
 *   const denied = assertCron(req)
 *   if (denied) return denied
 */
export function assertCron(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // Sin secreto configurado, ningún request puede autenticarse: se rechaza todo.
    return NextResponse.json({ error: "Cron auth not configured" }, { status: 401 })
  }
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
