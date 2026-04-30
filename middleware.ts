import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getRouteAccess, getDefaultRoute } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Fail open if Supabase env vars are missing (prevents middleware crash → 404 on all routes)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  let user = null
  let supabase: ReturnType<typeof createServerClient> | null = null
  try {
    supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    return response
  }

  const isDeepLink = /^\/e\//.test(pathname)
  const isAuthRoute = ['/login', '/verify'].includes(pathname)

  if (!user && !isDeepLink && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && supabase) {
    const { data: profile } = await supabase
      .from('users')
      .select('role_flags')
      .eq('id', user.id)
      .single()

    const roleFlags = profile?.role_flags ?? {}
    const access = getRouteAccess(pathname, roleFlags)

    if (access === 'redirect-explore') {
      return NextResponse.redirect(new URL('/explore', request.url))
    }

    if (isAuthRoute) {
      return NextResponse.redirect(new URL(getDefaultRoute(roleFlags), request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
