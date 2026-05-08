import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

const CANONICAL_HOST = 'gusmcewan.com'

export default function middleware(request: NextRequest) {
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
  return intlMiddleware(request)
}

export const config = {
  matcher: [
    // Match all paths except: api routes, Next internals, and any path with a dot (files like .svg, .ico, .webp)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
}
