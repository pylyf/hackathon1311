import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import type { UnitLadderSpec } from '../contract';
import { colors, fmt } from '../theme';
import { BigButton } from '../ui';
import { SVG_FONT, type GenUIProps } from './types';

const STEP_H = 50;
const STEP_GAP = 22;
const STEP_W = 128;

export default function UnitLadder({ spec, width, onEvent }: GenUIProps<UnitLadderSpec>) {
  const units = spec.units.length ? spec.units : ['?'];
  const startIdx = Math.max(0, spec.fromUnit ? units.indexOf(spec.fromUnit) : 0);
  const [idx, setIdx] = useState(startIdx);
  const [value, setValue] = useState<number | null>(typeof spec.value === 'number' ? spec.value : null);

  const n = units.length;
  const stepX = n > 1 ? Math.min(80, (width - STEP_W - 8) / (n - 1)) : 0;
  const height = n * STEP_H + (n - 1) * STEP_GAP + 4;

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
    <View style={{ width, alignItems: 'center' }}>
      <Svg width={width} height={height}>
        {units.map((u, i) => {
          const x = 4 + i * stepX;
          const y = 2 + i * (STEP_H + STEP_GAP);
          const active = i === idx;
          const f = spec.factors[i];
          return (
            <React.Fragment key={i}>
              <Rect
                x={x}
                y={y}
                width={STEP_W}
                height={STEP_H}
                rx={12}
                fill={active ? colors.yellow : '#FFFFFF'}
                stroke={colors.ink}
                strokeWidth={active ? 3.5 : 2}
              />
              <SvgText fontFamily={SVG_FONT} x={x + STEP_W / 2} y={y + STEP_H / 2 + 7} fontSize={active && value !== null ? 18 : 22} fontWeight="bold" fill={colors.ink} textAnchor="middle">
                {active && value !== null ? `${fmt(value)} ${u}` : u}
              </SvgText>
              {i < n - 1 && typeof f === 'number' && (
                <>
                  <SvgText fontFamily={SVG_FONT} x={x + STEP_W + 8} y={y + STEP_H + STEP_GAP / 2 + 6} fontSize={16} fontWeight="bold" fill={colors.green}>
                    {`↓ ×${fmt(f)}`}
                  </SvgText>
                  <SvgText fontFamily={SVG_FONT} x={x + stepX - 8} y={y + STEP_H + STEP_GAP / 2 + 6} fontSize={16} fontWeight="bold" fill={colors.blue} textAnchor="end">
                    {stepX > 60 ? `÷${fmt(f)} ↑` : ''}
                  </SvgText>
                </>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
      {spec.interactive && (
        <View style={styles.row}>
          <BigButton small label="▲ Bigger unit" onPress={() => move(-1)} disabled={idx === 0} color={colors.blue} />
          <BigButton small label="▼ Smaller unit" onPress={() => move(1)} disabled={idx === n - 1} color={colors.green} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
});
