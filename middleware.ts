import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { aiRateLimit } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const url = request.nextUrl.clone()

  // ============================================================
  // ADMIN LOGIN PAGE — public, no auth required
  // ============================================================
  if (url.pathname === '/admin-login') {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    // If already authenticated, redirect to dashboard
    const existingToken = request.cookies.get('admin_vakdor_token')?.value
    if (existingToken) {
      try {
        const { verifyAdminToken } = await import('@/lib/admin-vakdor/auth')
        const p = await verifyAdminToken(existingToken)
        if (p) return NextResponse.redirect(new URL('/admin-vakdor/dashboard', request.url))
      } catch { /* invalid token, show login */ }
    }
    return response
  }

  // ============================================================
  // ADMIN VAKDOR — Protected Routes (lightweight, no DB query)
  // ============================================================
  if (url.pathname.startsWith('/admin-vakdor')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')

    const adminToken = request.cookies.get('admin_vakdor_token')?.value
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin-login', request.url))
    }

    try {
      const { verifyAdminToken } = await import('@/lib/admin-vakdor/auth')
      const payload = await verifyAdminToken(adminToken)
      if (!payload) {
        const res = NextResponse.redirect(new URL('/admin-login', request.url))
        res.cookies.set('admin_vakdor_token', '', { maxAge: 0, path: '/' })
        return res
      }
    } catch {
      return NextResponse.redirect(new URL('/admin-login', request.url))
    }

    return response
  }

  // API Admin Vakdor — noindex
  if (url.pathname.startsWith('/api/admin-vakdor')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  try {
    const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const isAiEndpoint = request.nextUrl.pathname.startsWith('/api/ai/') || 
                         request.nextUrl.pathname.startsWith('/api/marketing-ia/') || 
                         request.nextUrl.pathname.startsWith('/api/contratos/');
                         
    if (isAiEndpoint && request.method === 'POST') {
      if (aiRateLimit) {
        const { success, reset } = await aiRateLimit.limit(ip)
        if (!success) {
          return NextResponse.json(
            { error: 'Demasiadas peticiones. Por favor, intenta de nuevo más tarde.' }, 
            { status: 429, headers: { 'Retry-After': reset.toString() } }
          )
        }
      }
    }

    // Next.js precarga (prefetch) los links visibles en pantalla: al abrir una
    // página se disparan varios requests en paralelo que no son navegaciones
    // reales. Si cada uno intenta refrescar el token, se rotan varios refresh
    // tokens a la vez y Supabase revoca la familia entera
    // (refresh_token_already_used → refresh_token_not_found), que es lo que
    // echaba a los asesores desde el celular. El layout de cada área protegida
    // valida la sesión igual, así que saltear el prefetch no abre ningún hueco.
    if (request.headers.get('next-router-prefetch') === '1') {
      return response
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // 1. PUBLIC ROUTES
    if (url.pathname.startsWith('/auth')) {
      return response
    }

    // 2. PROTECTED ROUTES
    if (url.pathname.startsWith('/director') || url.pathname.startsWith('/asesor')) {
      if (!user) {
        // Guardamos a dónde quería ir para volver ahí después de iniciar sesión
        // (ej: el link del email de aviso que abre el chat de un lead).
        const loginUrl = new URL('/auth/login', request.url)
        loginUrl.searchParams.set('next', `${url.pathname}${url.search}`)
        return NextResponse.redirect(loginUrl)
      }
      // Link de OTRO rol (27/8): el director que abre /asesor/leads-whatsapp/[id] (o el asesor
      // que abre /director/…) va al MISMO chat en su propia ruta, no al dashboard.
      const rolUsuario = user.user_metadata?.role
      const cruzado = url.pathname.match(/^\/(asesor|director)\/leads-whatsapp\/([^/]+)$/)
      if (cruzado && (rolUsuario === 'director' || rolUsuario === 'asesor') && cruzado[1] !== rolUsuario) {
        return NextResponse.redirect(new URL(`/${rolUsuario}/leads-whatsapp/${cruzado[2]}${url.search}`, request.url))
      }
      // Account status (pausado/eliminado) checked in layout.tsx server components
    }
  } catch (e) {
    console.error('Middleware error:', e)
  }

  return response
}

export const config = {
  matcher: [
    // Los archivos estáticos de /public (logos, og-image, sw.js) no necesitan
    // sesión: hacerlos pasar por acá agregaba una llamada de red a Supabase por
    // cada imagen, sumando refrescos concurrentes del token sin ningún motivo.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$|sw\\.js).*)',
  ],
}
