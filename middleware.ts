import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { aiRateLimit } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

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
    const url = request.nextUrl.clone()

    // 1. PUBLIC ROUTES (Login, Register, Landing) - Basic session check
    if (url.pathname.startsWith('/auth')) {
      if (user) {
        // Redirigir a sus áreas respectivas, pero solo si es estrictamente necesario
        // Dejamos que el layout decida el rol para mayor velocidad aquí
        return response
      }
      return response
    }

    // 2. PROTECTED ROUTES - Just check for session
    if (url.pathname.startsWith('/director') || url.pathname.startsWith('/asesor')) {
      if (!user) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
      // El chequeo de ROL (si es director o asesor) ya está implementado en app/(director|asesor)/layout.tsx
      // Eliminar la query a base de datos aquí reduce enormemente la latencia de navegación.
    }
  } catch (e) {
    console.error('Middleware error:', e)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
