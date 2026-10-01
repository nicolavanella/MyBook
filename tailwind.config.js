/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class', // attivato/disattivato in base a app_settings.theme, vedi useTheme.ts
  theme: {
    extend: {}
  },
  plugins: [require('@tailwindcss/typography')]
}
