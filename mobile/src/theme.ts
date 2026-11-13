import { Platform } from 'react-native';

export const colors = {
  bg: '#FFF8EC',
  card: '#FFFFFF',
  ink: '#1F2A44',
  inkSoft: '#5B6785',
  primary: '#FF7A45', // warm orange
  primaryDark: '#E25E2A',
  blue: '#3D7BFF',
  green: '#2DBE7E',
  yellow: '#FFC93C',
  purple: '#8A5CF6',
  red: '#F0506E',
  line: '#E6DFD2',
  shade: '#5AA9FF',
  unknown: '#FFE3A3',
};

export const radius = 22;

export const font = {
  title: 34,
  big: 24,
  body: 19,
  small: 15,
};

export const shadow = Platform.select({
  web: { boxShadow: '0 4px 14px rgba(31,42,68,0.12)' } as object,
  default: {
    shadowColor: '#1F2A44',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});

export function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(3)));
}
