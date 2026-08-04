/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B1220',
          900: '#111B2E',
          800: '#1B2A4A',
          700: '#243456',
        },
        paper: '#F7F5F0',
        gold: {
          400: '#E3BE55',
          500: '#D4A72C',
          600: '#B08A1E',
        },
        verdant: {
          400: '#2FBBA8',
          500: '#0F9B8E',
          600: '#0B7A70',
        },
        alert: '#C1432E',
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
