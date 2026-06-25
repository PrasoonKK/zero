/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}', './src/index.html'],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", 'Consolas', 'monospace'],
        ui: ["'Hanken Grotesk'", 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
