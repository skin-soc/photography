import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import { ADMIN_COOKIE, verifySessionToken } from './lib/admin-auth'

const intlMiddleware = createMiddleware(routing)

const CANONICAL_HOST = 'gusmcewan.com'

export default async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  // 301 every non-canonical host (gusmcewan.uk, www.*, etc.) to gusmcewan.com,
  // preserving path + query so Google consolidates signals on a single domain.
  if (host && host !== CANONICAL_HOST && host.endsWith('gusmcewan.uk')) {
    const url = new URL(request.url)
    url.host = CANONICAL_HOST
    url.protocol = 'https:'
    url.port = ''
    return NextResponse.redirect(url, 301)
  }

  const { pathname } = request.nextUrl
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    // The login page itself is public; everything else under /admin requires a
    // valid session cookie. The admin tree is outside i18n routing, so it must
    // bypass intlMiddleware entirely.
    if (pathname === '/admin/login') return NextResponse.next()
    const token = request.cookies.get(ADMIN_COOKIE)?.value
    if (await verifySessionToken(token, process.env.ADMIN_PASSWORD ?? '')) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    // Match all paths except: api routes, Next internals, and any path with a dot (files like .svg, .ico, .webp)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
}
