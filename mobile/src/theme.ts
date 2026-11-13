import { Platform } from 'react-native';

// Nudge look: clean white screens, chunky "3D" buttons and cards (solid bottom edge),
// a warm orange brand colour that sits well next to the brown otter mascot.
export const colors = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#3C3C3C',
  inkSoft: '#8A8A8A',
  primary: '#FF7A45', // warm orange (brand)
  primaryDark: '#D9572A', // bottom edge of orange buttons
  blue: '#2FA5F0',
  blueDark: '#1C83C6',
  blueLight: '#E3F4FF',
  blueBorder: '#8FD0FA',
  green: '#3CC47C',
  greenDark: '#2A9A5E',
  greenLight: '#E6F8EE',
  yellow: '#FFC93C',
  yellowDark: '#E0A800',
  yellowLight: '#FFF6DA',
  purple: '#A06CF0',
  purpleDark: '#7D4BCC',
  red: '#F0506E',
  redDark: '#C93452',
  line: '#E5E5E5', // borders
  lineDark: '#D2D2D2', // bottom edge of white cards
  track: '#EDEDED', // progress bar track, disabled buttons
  trackText: '#AFAFAF',
  shade: '#5AA9FF',
  unknown: '#FFE3A3',
  otter: '#9A6646',
};

export const radius = 16;

export const font = {
  title: 30,
  big: 22,
  body: 18,
  small: 15,
};

/** Font families (loaded in App.tsx). Use these instead of fontWeight. */
export const ff = {
  regular: 'Nunito_600SemiBold',
  bold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
  display: 'Fredoka_700Bold',
  displayMedium: 'Fredoka_600SemiBold',
};

/** Darker "bottom edge" colour for a given button colour. */
export function edgeOf(color: string): string {
  const map: Record<string, string> = {
    [colors.primary]: colors.primaryDark,
    [colors.blue]: colors.blueDark,
    [colors.green]: colors.greenDark,
    [colors.yellow]: colors.yellowDark,
    [colors.purple]: colors.purpleDark,
    [colors.red]: colors.redDark,
    [colors.card]: colors.lineDark,
  };
  return map[color] ?? 'rgba(0,0,0,0.22)';
}

// Kept for older call sites; the new look uses borders instead of soft shadows.
export const shadow = Platform.select({
  web: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } as object,
  default: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
});

export function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(3)));
}
