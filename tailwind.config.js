/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  // Only apply `hover:` / `group-hover:` on devices that actually support hover
  // (@media (hover: hover)). On touch, a tap was triggering a sticky :hover —
  // e.g. poster cards lifting and staying lifted. No hover state on touch now.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-serif)', 'ui-monospace', 'monospace'],
      },
      colors: {
        accent: '#931020',
        'accent-bright': '#c9293f',
      },
    },
  },
  plugins: [],
}
