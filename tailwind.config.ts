import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{html,svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f6f3',
          100: '#eeece5',
          200: '#d9d4c5',
          300: '#bdb6a0',
          400: '#9c947b',
          500: '#7a7460',
          600: '#5a564a',
          700: '#403d35',
          800: '#2a2823',
          900: '#1a1815'
        },
        accent: {
          500: '#b08968',
          600: '#94704f'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: [forms, typography]
} satisfies Config;
