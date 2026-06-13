/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  // Only apply `hover:` / `group-hover:` on devices that actually support hover
  // (@media (hover: hover)). On touch, a tap was triggering a sticky :hover —
  // e.g. poster cards lifting and staying lifted. No hover state on touch now.
  future: {
    hoverOnlyWhenSupported: true,
  },
  // Theme is driven by the class the server stamps on <html> (`dark` / `light`
  // / `theme-auto`) via CSS variables, so `dark:` variants aren't needed — but
  // enable selector mode for any future per-element dark overrides.
  darkMode: 'selector',
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-serif)', 'ui-monospace', 'monospace'],
      },
      colors: {
        accent: '#931020',
        'accent-bright': '#c9293f',
        // Semantic theme tokens. CSS vars are RGB channel triplets, so the
        // opacity modifier works: `bg-bg`, `text-foreground`, `bg-foreground/5`,
        // `border-foreground/10`, … all follow the active theme and invert.
        bg: 'rgb(var(--bg) / <alpha-value>)',
        foreground: 'rgb(var(--fg) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
