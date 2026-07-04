import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import { ADMIN_COOKIE, verifySessionToken } from './lib/admin-auth'

const intlMiddleware = createMiddleware(routing)

// NOTE: the gusmcewan.uk → gusmcewan.com canonical 301 is handled at the
// Cloudflare EDGE, by a zone-level Dynamic Redirect rule on the gusmcewan.uk
// zone (which has no Worker route — its apex/www are proxied black-hole
// records). So .uk requests never reach this Worker; a host check here would be
// dead code and just add work to every real request. Verified live: both
// gusmcewan.uk and www.gusmcewan.uk 301 with `server: cloudflare`, no Worker.

export default async function middleware(request: NextRequest) {
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
