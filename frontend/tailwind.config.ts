import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0D0D0D',
          secondary: '#1A1A1A',
          card: '#1E1E1E',
          elevated: '#252525',
        },
        accent: {
          DEFAULT: '#F5C518',
          dark: '#E0B400',
          muted: '#2E2A12',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#9A9A9A',
          muted: '#555555',
        },
        status: {
          ok: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          na: '#6b7280',
        },
        heat: {
          0: '#1A1A1A',
          1: '#2E2A12',
          2: '#4A4010',
          3: '#7A6A10',
          4: '#B89A10',
          5: '#F5C518',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};

export default config;
