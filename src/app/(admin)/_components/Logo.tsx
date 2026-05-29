/** Site logo, tinted to the brand red (#931020) — same filter as the site nav. */

const BRAND_RED_FILTER =
  'brightness(0) saturate(100%) invert(12%) sepia(74%) saturate(2800%) hue-rotate(340deg) brightness(85%) contrast(110%) drop-shadow(0 1px 2px rgba(0,0,0,0.2))'

export default function Logo({ height = 56 }: { height?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/logo.svg"
      alt="Gus McEwan Photography"
      draggable={false}
      style={{ height, width: 'auto', filter: BRAND_RED_FILTER }}
    />
  )
}
