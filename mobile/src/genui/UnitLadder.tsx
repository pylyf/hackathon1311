// Unit ladder: a staircase of units; going down multiplies, going up divides. Buttons move the value.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { UnitLadderSpec } from '../contract';
import { colors, ff, fmt } from '../theme';
import { BigButton } from '../ui';
import { VIS, type GenUIProps } from './types';

export default function UnitLadder({ spec, width, onEvent }: GenUIProps<UnitLadderSpec>) {
  const units = spec.units.length ? spec.units : ['?'];
  const startIdx = Math.max(0, spec.fromUnit ? units.indexOf(spec.fromUnit) : 0);
  const [idx, setIdx] = useState(startIdx);
  const [value, setValue] = useState<number | null>(typeof spec.value === 'number' ? spec.value : null);
  const n = units.length;
  const shift = n > 1 ? Math.min(56, (width - 150) / (n - 1)) : 0;

  const move = (dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= n) return;
    let v = value;
    if (v !== null) {
      const f = dir === 1 ? spec.factors[idx] : spec.factors[to];
      if (typeof f === 'number' && f > 0) v = dir === 1 ? v * f : v / f;
      v = parseFloat(v.toPrecision(10));
    }
    setIdx(to);
    setValue(v);
    onEvent?.({ component: 'UnitLadder', action: 'convert', data: { unit: units[to], value: v } });
  };

  return (
    <View style={{ width, gap: 12 }}>
      <View style={{ gap: 0 }}>
        {units.map((u, i) => {
          const active = i === idx;
          const f = spec.factors[i];
          return (
            <View key={i}>
              <View style={[styles.step, { marginLeft: i * shift }, active ? styles.stepOn : null]}>
                <Text style={[styles.unit, active && { color: '#fff' }]}>{active && value !== null ? `${fmt(value)} ${u}` : u}</Text>
              </View>
              {i < n - 1 && typeof f === 'number' && (
                <View style={[styles.between, { marginLeft: i * shift + 22 }]}>
                  <Text style={[styles.op, { color: colors.green }]}>↓ ×{fmt(f)}</Text>
                  <Text style={[styles.op, { color: colors.blue }]}>↑ ÷{fmt(f)}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      {spec.interactive && (
        <View style={styles.row}>
          <BigButton small label="▲ Bigger unit" onPress={() => move(-1)} disabled={idx === 0} variant="outline" color={colors.blue} style={{ flex: 1 }} />
          <BigButton small label="▼ Smaller unit" onPress={() => move(1)} disabled={idx === n - 1} variant="outline" color={colors.green} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  step: {
    alignSelf: 'flex-start',
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: VIS.empty,
    borderBottomWidth: 4,
    borderBottomColor: VIS.emptyEdge,
    alignItems: 'center',
  },
  stepOn: { backgroundColor: colors.primary, borderBottomColor: colors.primaryDark },
  unit: { fontFamily: ff.black, fontSize: 18, color: colors.ink },
  between: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  op: { fontFamily: ff.black, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10 },
});
