// Chocolate-bar strips: equal rounded pieces with small gaps; tap a piece to colour it.
import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FractionBarsSpec } from '../contract';
import { colors, ff } from '../theme';
import { FracBadge } from './parts';
import { VIS, type GenUIProps } from './types';

const ROW_H = 46;

function Piece({ on, color, edge, w, first, last, onPress }: { on: boolean; color: string; edge: string; w: number; first: boolean; last: boolean; onPress?: () => void }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => {
        s.setValue(0.85);
        Animated.spring(s, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start();
        onPress?.();
      }}
    >
      <Animated.View
        style={{
          width: w,
          height: ROW_H,
          backgroundColor: on ? color : VIS.empty,
          borderBottomWidth: 4,
          borderBottomColor: on ? edge : VIS.emptyEdge,
          borderTopLeftRadius: first ? 12 : 4,
          borderBottomLeftRadius: first ? 12 : 4,
          borderTopRightRadius: last ? 12 : 4,
          borderBottomRightRadius: last ? 12 : 4,
          transform: [{ scale: s }],
        }}
      />
    </Pressable>
  );
}

export default function FractionBars({ spec, width, onEvent }: GenUIProps<FractionBarsSpec>) {
  const [cells, setCells] = useState<boolean[][]>(() =>
    spec.rows.map((r) => {
      const den = Math.max(1, Math.min(24, Math.round(r.denominator)));
      return Array.from({ length: den }, (_, i) => i < r.shaded);
    }),
  );
  const hasLabels = spec.rows.some((r) => r.label);
  // short labels ("1/2") sit left of the bar; longer ones go above it so they are never cut off
  const labelsAbove = spec.rows.some((r) => (r.label ?? '').length > 4);
  const labelW = hasLabels && !labelsAbove ? 54 : 0;
  const barW = width - labelW - 56;

  const toggle = (row: number, idx: number) => {
    const next = cells.map((r) => r.slice());
    next[row][idx] = !next[row][idx];
    setCells(next);
    onEvent?.({ component: 'FractionBars', action: 'shade', data: { row, shaded: next[row].filter(Boolean).length, of: next[row].length } });
  };

  return (
    <View style={{ width, gap: 14 }}>
      {cells.map((row, r) => {
        const c = VIS.series[r % VIS.series.length];
        const n = row.length;
        const w = (barW - (n - 1) * VIS.gap) / n;
        return (
          <View key={r} style={{ gap: 4 }}>
            {labelsAbove && spec.rows[r].label ? <Text style={[styles.above, { color: c.edge }]}>{spec.rows[r].label}</Text> : null}
          <View style={styles.row}>
            {hasLabels && !labelsAbove && (
              <Text style={styles.label} numberOfLines={2}>
                {spec.rows[r].label ?? ''}
              </Text>
            )}
            <View style={[styles.bar, { width: barW, gap: VIS.gap }]}>
              {row.map((on, i) => (
                <Piece
                  key={i}
                  on={on}
                  color={c.fill}
                  edge={c.edge}
                  w={w}
                  first={i === 0}
                  last={i === n - 1}
                  onPress={spec.interactive ? () => toggle(r, i) : undefined}
                />
              ))}
            </View>
            <FracBadge n={row.filter(Boolean).length} d={n} color={c.fill} />
          </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 44, fontFamily: ff.black, fontSize: 14, color: colors.ink, textAlign: 'right' },
  bar: { flexDirection: 'row' },
  above: { fontFamily: ff.black, fontSize: 14 },
});
