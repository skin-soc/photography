/** Admin logout — clears the session cookie and returns to the login page. */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/admin-auth'

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/admin/login', request.url), 303)
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
