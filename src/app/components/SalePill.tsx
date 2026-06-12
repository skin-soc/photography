/**
 * Red "on sale" pill, e.g. −40%. Shows the discount off the normal price for a
 * red-labelled photo. A bare number + % (no words), so it needs no translation.
 * Presentational only — safe in server and client components alike.
 */
export default function SalePill({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <span
      className={`pointer-events-none inline-flex items-center rounded-full bg-[#931020] px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-white shadow-sm ${className}`}
    >
      −{pct}%
    </span>
  )
}
