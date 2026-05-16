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
        return NextResponse.redirect(new URL('/auth/login', request.url))
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
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
