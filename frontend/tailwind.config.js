/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0D0D0D',
          secondary: '#1A1A1A',
          card: '#1E1E1E',
        },
        accent: {
          DEFAULT: '#F5C518',
          dark: '#E0B400',
          muted: '#2E2A12',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#9A9A9A',
        },
        status: {
          ok: '#22c55e',
          atencao: '#f59e0b',
          problema: '#ef4444',
        },
        heat: {
          0: '#1A1A1A',
          1: '#2E2A12',
          2: '#5C5010',
          3: '#8C7A0E',
          4: '#F5C518',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
