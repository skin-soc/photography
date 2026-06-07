/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
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
