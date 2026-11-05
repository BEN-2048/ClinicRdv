export const palette = {
  primary: '#004AC6',
  primaryBright: '#2563EB',
  ink: '#0B1C30',
  inkSoft: '#434655',
  inkMuted: '#737686',
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
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.22, color: palette.inkSoft },
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
