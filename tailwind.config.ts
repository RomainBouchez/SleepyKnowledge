import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Nightly Genesis palette (ng- prefix)
        'ng-bg':        '#0a0908',
        'ng-surface':   '#131110',
        'ng-surface2':  '#1c1917',
        'ng-border':    '#2a2320',
        'ng-orange':    '#ff6b35',
        'ng-amber':     '#ff8c00',
        'ng-deep':      '#cc3300',   // profond (deep sleep)
        'ng-light':     '#ff9955',   // léger (light sleep)
        'ng-rem':       '#ffb040',   // REM
        'ng-white':     '#f0ebe6',
        'ng-gray':      '#7a6e6a',
        'ng-muted':     '#3d3330',
        'ng-green':     '#4caf78',
        'ng-red':       '#e05a4a',
        // Legacy aliases so old code still compiles
        'sl-bg':        '#0a0908',
        'sl-surface':   '#131110',
        'sl-surface2':  '#1c1917',
        'sl-border':    '#2a2320',
        'sl-blue':      '#ff6b35',
        'sl-blue-dim':  '#cc3300',
        'sl-violet':    '#ff9955',
        'sl-cyan':      '#ffb040',
        'sl-white':     '#f0ebe6',
        'sl-gray':      '#7a6e6a',
        'sl-muted':     '#3d3330',
        'sl-green':     '#4caf78',
        'sl-yellow':    '#ffb040',
        'sl-red':       '#e05a4a',
        'sl-accent':    '#ff6b35',
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
