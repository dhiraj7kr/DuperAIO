const palette = {
  primary: '#2563EB',       // blue
  primaryDark: '#1D4ED8',
  background: '#F9FAFB',    // light grey
  card: '#FFFFFF',          // white cards
  border: '#E5E7EB',        // light border
  text: '#111827',          // dark text
  textSecondary: '#6B7280', // grey text
  accent: '#F59E0B',        // amber
  danger: '#DC2626'         // red
};

export const theme = {
  colors: palette,
  spacing: (factor: number) => factor * 8,
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    xxl: 26
  }
};

export type Theme = typeof theme;
