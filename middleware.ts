import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const url = request.nextUrl.clone()

    // Skip middleware for favicon, static files, etc. (should be handled by matcher but just in case)
    if (url.pathname.includes('.') || url.pathname.startsWith('/_next')) {
       return response
    }

    // 1. PUBLIC ROUTES (Login, Register, Landing)
    if (url.pathname.startsWith('/auth')) {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'director') return NextResponse.redirect(new URL('/director/dashboard', request.url))
        if (profile?.role === 'asesor') return NextResponse.redirect(new URL('/asesor/dashboard', request.url))
      }
      return response
    }

    // 2. ROLE-BASED ROUTES PROTECTION
    if (url.pathname.startsWith('/director')) {
      if (!user) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'director') {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }

    if (url.pathname.startsWith('/asesor')) {
      if (!user) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'asesor') {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }
  } catch (e) {
    // If anything fails during middleware (like DB down during build), just proceed
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
