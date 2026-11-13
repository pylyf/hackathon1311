// Bar model for word problems: each quantity is a rounded bar, drawn to scale; the unknown is a dashed "?".
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BarModelSpec } from '../contract';
import { colors, ff, fmt } from '../theme';
import { VIS, type GenUIProps } from './types';

const BAR_H = 50;

export default function BarModel({ spec, width, onEvent }: GenUIProps<BarModelSpec>) {
  const [selected, setSelected] = useState<string | null>(null);

  // Size every part on one shared scale so bars can be compared.
  const known = spec.bars.flatMap((b) => b.parts.filter((p) => !p.unknown && typeof p.value === 'number').map((p) => p.value as number));
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const sizeOf = (p: BarModelSpec['bars'][number]['parts'][number]) => (!p.unknown && typeof p.value === 'number' && p.value > 0 ? p.value : fallback);
  const maxTotal = Math.max(1, ...spec.bars.map((b) => b.parts.reduce((s, p) => s + sizeOf(p), 0)));

  return (
    <View style={{ width, gap: 14 }}>
      {spec.bars.map((b, bi) => {
        const c = VIS.series[bi % VIS.series.length];
        const usable = width - (b.parts.length - 1) * VIS.gap;
        return (
          <View key={bi} style={{ gap: 6 }}>
            <Text style={[styles.barLabel, { color: c.edge }]}>{b.label}</Text>
            <View style={[styles.row, { gap: VIS.gap }]}>
              {b.parts.map((p, pi) => {
                const w = Math.max(36, (sizeOf(p) / maxTotal) * usable);
                const id = `${bi}-${pi}`;
                const text = p.unknown ? '?' : p.label ?? (typeof p.value === 'number' ? fmt(p.value) : '');
                const first = pi === 0;
                const last = pi === b.parts.length - 1;
                return (
                  <Pressable
                    key={pi}
                    onPress={() => {
                      setSelected(id);
                      onEvent?.({ component: 'BarModel', action: 'tap_bar', data: { bar: bi, part: pi } });
                    }}
                  >
                    <View
                      style={[
                        styles.part,
                        {
                          width: w,
                          borderTopLeftRadius: first ? 14 : 5,
                          borderBottomLeftRadius: first ? 14 : 5,
                          borderTopRightRadius: last ? 14 : 5,
                          borderBottomRightRadius: last ? 14 : 5,
                        },
                        p.unknown
                          ? styles.unknown
                          : { backgroundColor: pi % 2 ? c.soft : c.fill, borderBottomColor: c.edge },
                        selected === id && styles.selected,
                      ]}
                    >
                      <Text style={[p.unknown ? styles.q : styles.partText, !p.unknown && pi % 2 ? { color: c.edge } : null]} numberOfLines={1}>
                        {text}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barLabel: { fontFamily: ff.black, fontSize: 14 },
  row: { flexDirection: 'row' },
  part: { height: BAR_H, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4, paddingHorizontal: 4 },
  partText: { fontFamily: ff.black, fontSize: 18, color: '#fff' },
  unknown: { backgroundColor: VIS.unknown, borderWidth: 2, borderStyle: 'dashed', borderColor: VIS.unknownEdge, borderBottomWidth: 2 },
  q: { fontFamily: ff.display, fontSize: 26, color: colors.yellowDark },
  selected: { transform: [{ scale: 1.05 }] },
});
