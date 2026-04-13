import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // SleepIQ brand palette (sl- prefix)
        'sl-bg':       '#080D1A',
        'sl-surface':  '#0F172A',
        'sl-surface2': '#1E293B',
        'sl-border':   '#1E293B',
        'sl-blue':     '#3B82F6',
        'sl-blue-dim': '#1D4ED8',
        'sl-violet':   '#8B5CF6',
        'sl-cyan':     '#06B6D4',
        'sl-white':    '#F1F5F9',
        'sl-gray':     '#94A3B8',
        'sl-muted':    '#475569',
        'sl-green':    '#22C55E',
        'sl-yellow':   '#F59E0B',
        'sl-red':      '#EF4444',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [],
};

export default config;
