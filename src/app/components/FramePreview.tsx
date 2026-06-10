/**
 * In-frame preview — composites the artwork inside a CSS frame + mount mockup.
 *
 * Prodigi's API returns no mockup images (confirmed), so we render the framed
 * result ourselves from the chosen frame attributes. Pure presentational (no
 * hooks) so it can render server-side. Frame colours mirror Prodigi's `color`
 * attribute values for framed products (GLOBAL-CFPM-*). See
 * docs/fap-print-fulfilment.md §2.
 */

export type FrameColor =
  | 'black' | 'white' | 'natural' | 'brown'
  | 'dark grey' | 'light grey' | 'gold' | 'silver'

/** Frame moulding finish per Prodigi colour — a subtle gradient gives depth. */
const FRAME_FINISH: Record<FrameColor, { base: string; light: string; dark: string }> = {
  black:        { base: '#1a1a1a', light: '#3a3a3a', dark: '#000000' },
  white:        { base: '#f4f4f2', light: '#ffffff', dark: '#d4d4d0' },
  natural:      { base: '#c8a877', light: '#e3c79a', dark: '#a07f4f' },
  brown:        { base: '#5a3b22', light: '#7a5435', dark: '#3a2414' },
  'dark grey':  { base: '#4a4a4a', light: '#666666', dark: '#2e2e2e' },
  'light grey': { base: '#b8b8b8', light: '#d6d6d6', dark: '#969696' },
  gold:         { base: '#b8922f', light: '#e6c768', dark: '#8a6b1d' },
  silver:       { base: '#b9bcc0', light: '#e2e4e7', dark: '#8e9196' },
}

export default function FramePreview({
  src,
  alt,
  frameColor = 'black',
  matted = true,
  className = '',
}: {
  src: string
  alt: string
  frameColor?: FrameColor
  /** Show a mount/mat board between the frame and the artwork. */
  matted?: boolean
  className?: string
}) {
  const f = FRAME_FINISH[frameColor] ?? FRAME_FINISH.black
  // Moulding rendered as a gradient border via padding + layered backgrounds.
  const frameStyle: React.CSSProperties = {
    padding: '6.5%',
    background: `linear-gradient(135deg, ${f.light} 0%, ${f.base} 45%, ${f.dark} 100%)`,
    boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.4)',
    borderRadius: '2px',
  }
  const matStyle: React.CSSProperties = matted
    ? { padding: '8%', background: '#f7f6f2', boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.18)' }
    : {}

  return (
    <div className={className} style={frameStyle}>
      {/* inner lip — a thin dark rabbet line inside the moulding */}
      <div style={{ padding: '1px', background: 'rgba(0,0,0,0.35)' }}>
        <div style={matStyle}>
          {/* Server Component: no event handlers (onContextMenu) — they throw at
              render. draggable={false} + pointer-events-none suffice. */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="block w-full h-auto select-none pointer-events-none"
            style={{ boxShadow: matted ? '0 1px 4px rgba(0,0,0,0.25)' : 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
