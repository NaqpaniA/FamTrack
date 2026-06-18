/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.tsx', './*.ts'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
