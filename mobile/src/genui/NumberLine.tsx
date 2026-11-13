// Number line: a thick rounded track with hops drawn as arcs; tap a number to drop a pin.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { NumberLineSpec } from '../contract';
import { colors, fmt } from '../theme';
import { SVG_FONT, VIS, type GenUIProps } from './types';

const PAD = 22;
const LINE_Y = 118;
const HEIGHT = 178;

/** Rounded label pill drawn inside the SVG. */
function SvgPill({ x, y, text, fill }: { x: number; y: number; text: string; fill: string }) {
  const w = Math.max(30, text.length * 9 + 16);
  return (
    <G>
      <Rect x={x - w / 2} y={y - 13} width={w} height={24} rx={12} fill={fill} />
      <SvgText fontFamily={SVG_FONT} x={x} y={y + 4} fontSize={14} fill="#fff" textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}

export default function NumberLine({ spec, width, onEvent }: GenUIProps<NumberLineSpec>) {
  const [marker, setMarker] = useState<number | null>(null);
  const { min, max } = spec.max > spec.min ? spec : { min: 0, max: 10 };
  const ticks = useMemo(() => {
    let step = spec.step > 0 ? spec.step : 1;
    while ((max - min) / step > 40) step *= 2;
    const out: number[] = [];
    for (let i = 0; min + i * step <= max + 1e-9; i++) out.push(parseFloat((min + i * step).toFixed(6)));
    return out;
  }, [min, max, spec.step]);

  const x = (v: number) => PAD + ((v - min) / (max - min)) * (width - 2 * PAD);
  const labelEvery = Math.ceil(ticks.length / 11);
  const spacing = ticks.length > 1 ? x(ticks[1]) - x(ticks[0]) : width;

  const place = (v: number) => {
    setMarker(v);
    onEvent?.({ component: 'NumberLine', action: 'move_marker', data: { value: v } });
  };

  return (
    <View style={{ width, height: HEIGHT }}>
      <Svg width={width} height={HEIGHT}>
        {/* track */}
        <Rect x={PAD - 10} y={LINE_Y - 5} width={width - 2 * PAD + 20} height={10} rx={5} fill={VIS.empty} />
        {ticks.map((t, i) => {
          const major = i % labelEvery === 0;
          return (
            <G key={`t${i}`}>
              <Rect x={x(t) - 1.5} y={LINE_Y - (major ? 11 : 7)} width={3} height={major ? 22 : 14} rx={1.5} fill={major ? '#BDBDBD' : VIS.line} />
              {major && (
                <SvgText fontFamily={SVG_FONT} x={x(t)} y={LINE_Y + 34} fontSize={15} fill={colors.ink} textAnchor="middle">
                  {fmt(t)}
                </SvgText>
              )}
            </G>
          );
        })}

        {/* hops */}
        {(spec.jumps ?? []).map((j, i) => {
          const c = VIS.series[i % VIS.series.length];
          const x1 = x(j.from);
          const x2 = x(j.to);
          const h = Math.min(66, 22 + Math.abs(x2 - x1) * 0.35);
          const mx = (x1 + x2) / 2;
          return (
            <G key={`j${i}`}>
              <Path d={`M ${x1} ${LINE_Y - 8} Q ${mx} ${LINE_Y - 8 - h * 2} ${x2} ${LINE_Y - 8}`} stroke={c.fill} strokeWidth={4} strokeLinecap="round" fill="none" />
              <Circle cx={x2} cy={LINE_Y - 8} r={5} fill={c.fill} />
              {j.label ? <SvgPill x={mx} y={LINE_Y - 8 - h - 6} text={j.label} fill={c.fill} /> : null}
            </G>
          );
        })}

        {/* marks */}
        {(spec.marks ?? []).map((m, i) => (
          <G key={`m${i}`}>
            <Circle cx={x(m.value)} cy={LINE_Y} r={10} fill={colors.purple} stroke="#fff" strokeWidth={3} />
            {m.label ? (
              <SvgText fontFamily={SVG_FONT} x={x(m.value)} y={LINE_Y + 56} fontSize={13} fill={colors.purple} textAnchor="middle">
                {m.label}
              </SvgText>
            ) : null}
          </G>
        ))}

        {/* the child's pin */}
        {marker !== null && (
          <G>
            <Path d={`M ${x(marker)} ${LINE_Y - 6} l -12 -18 a 14 14 0 1 1 24 0 z`} fill={colors.green} />
            <SvgText fontFamily={SVG_FONT} x={x(marker)} y={LINE_Y - 29} fontSize={12} fill="#fff" textAnchor="middle">
              {fmt(marker)}
            </SvgText>
          </G>
        )}
      </Svg>
      {spec.interactive &&
        ticks.map((t, i) => (
          <Pressable
            key={`p${i}`}
            onPress={() => place(t)}
            accessibilityLabel={`Put a pin at ${fmt(t)}`}
            style={{ position: 'absolute', left: x(t) - Math.max(10, spacing / 2), width: Math.max(20, spacing), top: LINE_Y - 34, height: 74 }}
          />
        ))}
    </View>
  );
}
