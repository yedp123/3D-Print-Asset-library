/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bambu: {
          dark: '#121417',
          header: '#181B20',
          card: '#1E2228',
          cardHover: '#252B33',
          border: '#2C323B',
          green: '#00AE42',
          greenHover: '#009638',
          textMuted: '#8E9089',
        },
      },
    },
  },
  plugins: [],
}
