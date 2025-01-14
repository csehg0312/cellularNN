/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,js,jsx,ts,tsx}', 
    './pages/**/*.{html,js,ts,jsx,tsx}',
    './components/**/*.{html,js,ts,jsx,tsx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        'custom-darkGray': '#1F1F1F',
        'custom-navyBlue': '#0D1B2A',
        'custom-graphite': '#2C2C2C',
        'custom-white': '#f0f0f0',
        'custom-amber': '#FFC107',
        'custom-goldenYellow': '#FFB400',
        'custom-deepOrange': '#FF5722',
        'custom-tangerine': '#FF6F00',
      },
    },
  },
  plugins: [],
}