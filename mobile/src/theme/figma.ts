export const palette = {
  primary: '#004AC6',
  primaryBright: '#2563EB',
  ink: '#0B1C30',
  inkSoft: '#434655',
  inkMuted: '#737686',
  outline: '#C3C6D7',
  page: '#F8F9FF',
  surface: '#FFFFFF',
  tint50: '#EFF4FF',
  tint100: '#E5EEFF',
  tint200: '#DCE9FF',
  teal: '#006A61',
  tealDark: '#005049',
  tealSoft: '#89F5E7',
  amberSoft: '#FFDDB8',
  amberDot: '#784B00',
  amberInk: '#653E00',
  amberAccent: '#FFB95F',
  dangerSoft: '#FFDAD6',
  dangerInk: '#93000A',
  alert: '#BA1A1A',
  radioBorder: '#767676',
  white: '#FFFFFF',
  shadow: '#0F172A',
};

export const color = {
  primary: palette.primary,
  primaryBright: palette.primaryBright,
  onPrimary: palette.white,
  primarySoft: palette.tint100,
  primarySubtle: palette.tint50,
  primaryStrong: palette.tint200,
  text: palette.ink,
  textSecondary: palette.inkSoft,
  textMuted: palette.inkMuted,
  page: palette.page,
  surface: palette.surface,
  border: palette.tint200,
  borderStrong: palette.outline,
  success: palette.teal,
  successInk: palette.tealDark,
  successSoft: palette.tealSoft,
  warning: palette.amberDot,
  warningInk: palette.amberInk,
  warningSoft: palette.amberSoft,
  danger: palette.alert,
  dangerInk: palette.dangerInk,
  dangerSoft: palette.dangerSoft,
  overlay: 'rgba(11,28,48,0.4)',
};

export type StatusKey = 'pending' | 'confirmed' | 'cancelled' | 'done';

export const statusTokens: Record<StatusKey, { label: string; bg: string; dot: string; ink: string }> = {
  confirmed: { label: 'Confirmé', bg: palette.tealSoft, dot: palette.teal, ink: palette.tealDark },
  pending: { label: 'En attente', bg: palette.amberSoft, dot: palette.amberDot, ink: palette.amberInk },
  done: { label: 'Terminé', bg: palette.tint100, dot: palette.inkMuted, ink: palette.inkSoft },
  cancelled: { label: 'Annulé', bg: palette.dangerSoft, dot: palette.dangerInk, ink: palette.dangerInk },
};

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
};

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const type = {
  h1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.48, color: palette.ink },
  h2: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.18, color: palette.ink },
  h3: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: palette.ink },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.ink },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0.07, color: palette.ink },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24, color: palette.inkSoft },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2, color: palette.inkSoft },
} as const;

export const shadow = {
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};
