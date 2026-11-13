import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import type { BarModelSpec } from '../contract';
import { colors, fmt } from '../theme';
import { SVG_FONT, type GenUIProps } from './types';

const BAR_H = 54;
const LABEL_H = 24;
const GAP = 16;
const PART_COLORS = ['#BFD8FF', '#C8F1DC', '#E3D7FF', '#FFD6C4'];

export default function BarModel({ spec, width, onEvent }: GenUIProps<BarModelSpec>) {
  const [selected, setSelected] = useState<string | null>(null);

  // Size every part on one shared scale so bars can be compared.
  const knownValues = spec.bars.flatMap((b) => b.parts.filter((p) => !p.unknown && typeof p.value === 'number').map((p) => p.value as number));
  const fallback = knownValues.length ? knownValues.reduce((a, b) => a + b, 0) / knownValues.length : 1;
  const sizeOf = (p: BarModelSpec['bars'][number]['parts'][number]) =>
    !p.unknown && typeof p.value === 'number' && p.value > 0 ? p.value : fallback;
  const totals = spec.bars.map((b) => b.parts.reduce((s, p) => s + sizeOf(p), 0));
  const maxTotal = Math.max(1, ...totals);
  const innerW = width - 8;
  const unit = innerW / maxTotal;

  const rowH = LABEL_H + BAR_H + GAP;
  const height = spec.bars.length * rowH;

  const layout = spec.bars.map((b, bi) => {
    let cx = 4;
    return b.parts.map((p, pi) => {
      const w = sizeOf(p) * unit;
      const r = { bi, pi, x: cx, y: bi * rowH + LABEL_H, w, p };
      cx += w;
      return r;
    });
  });

  const tap = (bar: number, part: number) => {
    setSelected(`${bar}-${part}`);
    onEvent?.({ component: 'BarModel', action: 'tap_bar', data: { bar, part } });
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {spec.bars.map((b, bi) => (
          <SvgText fontFamily={SVG_FONT} key={`l${bi}`} x={4} y={bi * rowH + LABEL_H - 6} fontSize={17} fontWeight="bold" fill={colors.ink}>
            {b.label}
          </SvgText>
        ))}
        {layout.flat().map(({ bi, pi, x, y, w, p }) => {
          const isSel = selected === `${bi}-${pi}`;
          const text = p.unknown ? '?' : p.label ?? (typeof p.value === 'number' ? fmt(p.value) : '');
          return (
            <React.Fragment key={`${bi}-${pi}`}>
              <Rect
                x={x}
                y={y}
                width={w}
                height={BAR_H}
                rx={6}
                fill={p.unknown ? colors.unknown : PART_COLORS[(bi + pi) % PART_COLORS.length]}
                stroke={isSel ? colors.primary : colors.ink}
                strokeWidth={isSel ? 5 : 2.5}
                strokeDasharray={p.unknown ? '7,5' : undefined}
              />
              <SvgText fontFamily={SVG_FONT}
                x={x + w / 2}
                y={y + BAR_H / 2 + (p.unknown ? 11 : 7)}
                fontSize={p.unknown ? 32 : w < 50 ? 14 : 20}
                fontWeight="bold"
                fill={p.unknown ? colors.primaryDark : colors.ink}
                textAnchor="middle"
              >
                {text}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      {layout.flat().map(({ bi, pi, x, y, w }) => (
        <Pressable
          key={`p${bi}-${pi}`}
          onPress={() => tap(bi, pi)}
          accessibilityLabel={`Bar ${bi + 1} part ${pi + 1}`}
          style={{ position: 'absolute', left: x, top: y, width: w, height: BAR_H }}
        />
      ))}
    </View>
  );
}
