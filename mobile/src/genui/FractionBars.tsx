import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import type { FractionBarsSpec } from '../contract';
import { colors } from '../theme';
import { SVG_FONT, type GenUIProps } from './types';

const ROW_H = 52;
const GAP = 18;
const COUNT_W = 64;
const ROW_COLORS = [colors.shade, colors.green, colors.purple, colors.primary];

export default function FractionBars({ spec, width, onEvent }: GenUIProps<FractionBarsSpec>) {
  const [cells, setCells] = useState<boolean[][]>(() =>
    spec.rows.map((r) => {
      const den = Math.max(1, Math.min(24, Math.round(r.denominator)));
      return Array.from({ length: den }, (_, i) => i < r.shaded);
    }),
  );

  const LABEL_W = spec.rows.some((r) => r.label) ? 72 : 6;
  const barW = Math.max(120, width - LABEL_W - COUNT_W);
  const height = spec.rows.length * ROW_H + (spec.rows.length - 1) * GAP + 4;

  const toggle = (row: number, idx: number) => {
    if (!spec.interactive) return;
    const next = cells.map((r) => r.slice());
    next[row][idx] = !next[row][idx];
    setCells(next);
    onEvent?.({
      component: 'FractionBars',
      action: 'shade',
      data: { row, shaded: next[row].filter(Boolean).length, of: next[row].length },
    });
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {cells.map((row, r) => {
          const y = 2 + r * (ROW_H + GAP);
          const segW = barW / row.length;
          const color = ROW_COLORS[r % ROW_COLORS.length];
          const count = row.filter(Boolean).length;
          const label = spec.rows[r].label ?? '';
          return (
            <React.Fragment key={r}>
              <SvgText fontFamily={SVG_FONT}
                x={LABEL_W - 10}
                y={y + ROW_H / 2 + 7}
                fontSize={label.length > 5 ? 14 : 20}
                fontWeight="bold"
                fill={colors.ink}
                textAnchor="end"
              >
                {label}
              </SvgText>
              {row.map((on, i) => (
                <Rect
                  key={i}
                  x={LABEL_W + i * segW}
                  y={y}
                  width={segW}
                  height={ROW_H}
                  fill={on ? color : '#FFFFFF'}
                  stroke={colors.ink}
                  strokeWidth={2.5}
                />
              ))}
              <SvgText fontFamily={SVG_FONT}
                x={LABEL_W + barW + 12}
                y={y + ROW_H / 2 + 8}
                fontSize={22}
                fontWeight="bold"
                fill={colors.ink}
              >
                {`${count}/${row.length}`}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      {spec.interactive &&
        cells.map((row, r) =>
          row.map((_, i) => {
            const segW = barW / row.length;
            return (
              <Pressable
                key={`${r}-${i}`}
                onPress={() => toggle(r, i)}
                accessibilityLabel={`Row ${r + 1} piece ${i + 1}`}
                style={{
                  position: 'absolute',
                  left: LABEL_W + i * segW,
                  top: 2 + r * (ROW_H + GAP),
                  width: segW,
                  height: ROW_H,
                }}
              />
            );
          }),
        )}
    </View>
  );
}
