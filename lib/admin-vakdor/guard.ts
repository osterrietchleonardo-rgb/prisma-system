/**
 * Admin Vakdor — Request Guard
 * Verifica el JWT admin en los Route Handlers de API.
 */
import { NextRequest, NextResponse } from "next/server"
import { verifyAdminToken, ADMIN_COOKIE_NAME, type AdminVakdorPayload } from "./auth"

export async function requireAdminVakdor(
  request: NextRequest
): Promise<{ payload: AdminVakdorPayload } | NextResponse> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", mensaje: "Autenticación requerida" },
      { status: 401 }
    )
  }

  const payload = await verifyAdminToken(token)
  if (!payload) {
    return NextResponse.json(
      { error: "TOKEN_INVALID", mensaje: "Token inválido o expirado" },
      { status: 401 }
    )
  }

  return { payload }
}

export function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}
