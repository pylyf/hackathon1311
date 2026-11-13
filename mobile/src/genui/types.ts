import type { UIEvent } from '../contract';
import { colors } from '../theme';

export interface GenUIProps<S> {
  spec: S;
  width: number;
  onEvent?: (e: UIEvent) => void;
}

// SVG text uses the same rounded font as the rest of the app (loaded by expo-font in App.tsx).
export const SVG_FONT = 'Nunito_800ExtraBold';

/**
 * One visual language for every GenUI block: no black outlines, soft rounded shapes,
 * a darker "bottom edge" on filled shapes (like the app's buttons), the app's colours.
 */
export const VIS = {
  series: [
    { fill: colors.primary, edge: colors.primaryDark, soft: '#FFE3D6' },
    { fill: colors.blue, edge: colors.blueDark, soft: colors.blueLight },
    { fill: colors.green, edge: colors.greenDark, soft: colors.greenLight },
    { fill: colors.purple, edge: colors.purpleDark, soft: '#F0E8FD' },
    { fill: colors.yellow, edge: colors.yellowDark, soft: colors.yellowLight },
  ],
  empty: '#F1F1F1', // unfilled parts
  emptyEdge: '#DEDEDE',
  line: '#D9D9D9', // axes, ticks
  label: colors.inkSoft,
  unknown: colors.yellowLight,
  unknownEdge: colors.yellowDark,
  gap: 3, // gap between parts
  radius: 10,
};
