/** Admin login. Posts to /api/admin/login, which sets the session cookie. */

import Logo from '../../_components/Logo'

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message =
    error === 'unconfigured'
      ? 'Admin access is not configured on the server.'
      : error
        ? 'Incorrect password — try again.'
        : null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-10">
          <Logo height={72} />
          <h1 className="mt-6 font-serif font-light text-3xl tracking-wide">Studio Admin</h1>
          <p className="mt-1 text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white/40">
            Staff access only
          </p>
        </div>

        <form method="post" action="/api/admin/login" className="space-y-4">
          <input
            type="password"
            name="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            className="w-full bg-white/[0.04] border border-white/15 rounded-md px-4 py-3 text-sm tracking-wide outline-none transition-colors focus:border-[#931020] focus:bg-white/[0.06]"
          />
          {message && (
            <p className="text-[13px] text-[#e0566a] tracking-wide">{message}</p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-[#931020] px-4 py-3 text-[11px] font-mono-ibm uppercase tracking-[0.28em] text-white transition-colors hover:bg-[#a8131f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#931020] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  )
}
