/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Même palette que MonBudgetPro, pour que le module budget garde son apparence.
        brand: { 50: '#f0f9ff', 100: '#e0f2fe', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' },
      },
    },
  },
  plugins: [],
};
