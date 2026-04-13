import {StyleSheet} from 'react-native';

// ── Palette ───────────────────────────────────────────────────────────────────
export const Colors = {
  background: '#080D1A',      // deepest midnight navy
  surface: '#0F172A',         // slightly lighter navy
  surfaceAlt: '#1E293B',      // card / elevated surface
  border: '#1E293B',
  primary: '#3B82F6',         // electric blue
  primaryDim: '#1D4ED8',
  secondary: '#8B5CF6',       // soft violet
  secondaryDim: '#5B21B6',
  accent: '#06B6D4',          // cyan for REM
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#475569',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  // Sleep phase colours
  deepSleep: '#3B82F6',
  remSleep: '#8B5CF6',
  lightSleep: '#06B6D4',
  awake: '#475569',
  // Score gradient stops
  scoreGood: '#22C55E',
  scoreMid: '#F59E0B',
  scorePoor: '#EF4444',
} as const;

// ── Score colour helper ───────────────────────────────────────────────────────
export function scoreColor(score: number): string {
  if (score >= 80) {return Colors.scoreGood;}
  if (score >= 60) {return Colors.scoreMid;}
  return Colors.scorePoor;
}

// ── Typography ────────────────────────────────────────────────────────────────
export const Typography = {
  hero: {fontSize: 56, fontWeight: '700' as const, letterSpacing: -1},
  h1:   {fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5},
  h2:   {fontSize: 22, fontWeight: '600' as const},
  h3:   {fontSize: 18, fontWeight: '600' as const},
  body: {fontSize: 15, fontWeight: '400' as const, lineHeight: 22},
  small:{fontSize: 13, fontWeight: '400' as const},
  tiny: {fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.5},
  mono: {fontSize: 13, fontFamily: 'Courier New'},
};

// ── Spacing ───────────────────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ── Shared component styles ───────────────────────────────────────────────────
export const SharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
});
