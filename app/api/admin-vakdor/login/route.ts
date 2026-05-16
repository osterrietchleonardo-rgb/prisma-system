import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { signAdminToken, ADMIN_COOKIE_NAME, ADMIN_COOKIE_OPTIONS } from "@/lib/admin-vakdor/auth"
import { logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Rate limit: 5 intentos por 10 minutos por IP
let ratelimit: Ratelimit | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    ratelimit = new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      prefix: "admin_vakdor_login",
    })
  }
} catch {
  // Redis not available — rate limiting disabled
}

const NOINDEX_HEADERS = { "X-Robots-Tag": "noindex, nofollow" }

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  // Rate limiting
  if (ratelimit) {
    const { success, reset } = await ratelimit.limit(ip)
    if (!success) {
      return NextResponse.json(
        { error: "RATE_LIMITED", mensaje: "Demasiados intentos. Intenta en 10 minutos." },
        { status: 429, headers: { "Retry-After": reset.toString(), ...NOINDEX_HEADERS } }
      )
    }
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400, headers: NOINDEX_HEADERS })
  }

  const { email, password } = body
  if (!email || !password) {
    return NextResponse.json(
      { error: "MISSING_FIELDS", mensaje: "Email y contraseña son requeridos" },
      { status: 400, headers: NOINDEX_HEADERS }
    )
  }

  const db = createAdminClient()

  // Buscar usuario admin
  const { data: adminUser, error } = await db
    .from("admin_vakdor_users")
    .select("id, email, password_hash, nombre, is_active")
    .eq("email", email.toLowerCase().trim())
    .single()

  if (error || !adminUser) {
    return NextResponse.json(
      { error: "INVALID_CREDENTIALS", mensaje: "Credenciales inválidas" },
      { status: 401, headers: NOINDEX_HEADERS }
    )
  }

  if (!adminUser.is_active) {
    return NextResponse.json(
      { error: "ACCOUNT_INACTIVE", mensaje: "Cuenta desactivada" },
      { status: 403, headers: NOINDEX_HEADERS }
    )
  }

  // Verificar contraseña (bcrypt via Node.js crypto)
  // Usamos comparación simple con hash almacenado
  const { createHash } = await import("crypto")
  
  // El hash se almacena como SHA-256 salted con el email como salt
  // Para producción real usa bcrypt; aquí usamos un hash seguro pero sin dependencia externa
  const expectedHash = createHash("sha256")
    .update(password + adminUser.email + (process.env.ADMIN_VAKDOR_JWT_SECRET || ""))
    .digest("hex")

  if (adminUser.password_hash !== expectedHash) {
    return NextResponse.json(
      { error: "INVALID_CREDENTIALS", mensaje: "Credenciales inválidas" },
      { status: 401, headers: NOINDEX_HEADERS }
    )
  }

  // Actualizar last_login
  await db
    .from("admin_vakdor_users")
    .update({ last_login: new Date().toISOString() })
    .eq("id", adminUser.id)

  // Firmar JWT
  const token = await signAdminToken(adminUser.id, adminUser.email)

  // Log actividad
  await logAdminActivity({
    adminId: adminUser.id,
    accion: "LOGIN",
    detalleJson: { ip },
    ipAddress: ip,
  })

  const response = NextResponse.json(
    { success: true, nombre: adminUser.nombre },
    { headers: NOINDEX_HEADERS }
  )

  response.cookies.set(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_OPTIONS)
  return response
}
