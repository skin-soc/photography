import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  matcher: [
    // Match all paths except: api routes, Next internals, and any path with a dot (files like .svg, .ico, .webp)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
}
