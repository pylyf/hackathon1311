import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { UIEvent, UISpec } from '../contract';
import { colors, font, radius, shadow } from '../theme';
import BarModel from './BarModel';
import FractionBars from './FractionBars';
import NumberLine from './NumberLine';
import UnitLadder from './UnitLadder';

export function GenUIRenderer({ spec, onEvent }: { spec: UISpec; onEvent?: (e: UIEvent) => void }) {
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW - 64, 560);
  // Re-mount when the spec changes so local state (shading, marker…) resets.
  const key = JSON.stringify(spec);

  let body: React.ReactNode;
  switch (spec.type) {
    case 'FractionBars':
      body = <FractionBars key={key} spec={spec} width={width} onEvent={onEvent} />;
      break;
    case 'NumberLine':
      body = <NumberLine key={key} spec={spec} width={width} onEvent={onEvent} />;
      break;
    case 'BarModel':
      body = <BarModel key={key} spec={spec} width={width} onEvent={onEvent} />;
      break;
    case 'UnitLadder':
      body = <UnitLadder key={key} spec={spec} width={width} onEvent={onEvent} />;
      break;
    default:
      body = <Text style={styles.caption}>(I can't draw that one yet.)</Text>;
  }

  const interactive = spec.type === 'BarModel' || spec.interactive;

  return (
    <View style={[styles.wrap, shadow]}>
      {spec.caption ? <Text style={styles.caption}>{spec.caption}</Text> : null}
      <View style={{ alignItems: 'center' }}>{body}</View>
      {interactive && <Text style={styles.tapHint}>{spec.type === 'UnitLadder' ? '👆 Use the buttons to move!' : '👆 Tap the picture to try!'}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 16,
    gap: 12,
    borderWidth: 3,
    borderColor: colors.yellow,
  },
  caption: { fontSize: font.body, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  tapHint: { fontSize: font.small, color: colors.inkSoft, textAlign: 'center' },
});

export default GenUIRenderer;
