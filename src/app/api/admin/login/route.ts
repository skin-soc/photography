/**
 * Admin login — verifies the shared password and sets a signed session cookie.
 * Accepts a urlencoded form POST (password) and redirects back to /admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, SESSION_TTL_MS, createSessionToken } from '@/lib/admin-auth'

export async function POST(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD ?? ''
  const form = await request.formData()
  const supplied = String(form.get('password') ?? '')

  const loginUrl = new URL('/admin/login', request.url)
  const adminUrl = new URL('/admin', request.url)

  if (!password) {
    loginUrl.searchParams.set('error', 'unconfigured')
    return NextResponse.redirect(loginUrl, 303)
  }
  if (supplied !== password) {
    loginUrl.searchParams.set('error', '1')
    return NextResponse.redirect(loginUrl, 303)
  }

  const token = await createSessionToken(password)
  const res = NextResponse.redirect(adminUrl, 303)
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  return res
}
