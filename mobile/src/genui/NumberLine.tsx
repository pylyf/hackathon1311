import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import type { NumberLineSpec } from '../contract';
import { colors, fmt } from '../theme';
import { SVG_FONT, type GenUIProps } from './types';

const PAD = 26;
const LINE_Y = 120;
const HEIGHT = 190;

export default function NumberLine({ spec, width, onEvent }: GenUIProps<NumberLineSpec>) {
  const [marker, setMarker] = useState<number | null>(null);

  const { min, max } = spec.max > spec.min ? spec : { min: 0, max: 10 };
  const ticks = useMemo(() => {
    let step = spec.step > 0 ? spec.step : 1;
    // keep it readable: at most 40 ticks
    while ((max - min) / step > 40) step *= 2;
    const out: number[] = [];
    for (let i = 0; min + i * step <= max + 1e-9; i++) out.push(parseFloat((min + i * step).toFixed(6)));
    return out;
  }, [min, max, spec.step]);

  const x = (v: number) => PAD + ((v - min) / (max - min)) * (width - 2 * PAD);
  const labelEvery = Math.ceil(ticks.length / 12);
  const tickSpacing = ticks.length > 1 ? x(ticks[1]) - x(ticks[0]) : width;

  const place = (v: number) => {
    setMarker(v);
    onEvent?.({ component: 'NumberLine', action: 'move_marker', data: { value: v } });
  };

  return (
    <View style={{ width, height: HEIGHT }}>
      <Svg width={width} height={HEIGHT}>
        {/* jumps */}
        {(spec.jumps ?? []).map((j, i) => {
          const x1 = x(j.from);
          const x2 = x(j.to);
          const h = Math.min(70, 24 + Math.abs(x2 - x1) * 0.35);
          const mx = (x1 + x2) / 2;
          const cy = LINE_Y - h * 2;
          const dir = x2 >= x1 ? 1 : -1;
          // arrow head at (x2, LINE_Y - 4)
          const ax = x2;
          const ay = LINE_Y - 4;
          return (
            <React.Fragment key={`j${i}`}>
              <Path
                d={`M ${x1} ${LINE_Y - 4} Q ${mx} ${cy} ${x2} ${LINE_Y - 4}`}
                stroke={colors.primary}
                strokeWidth={3.5}
                fill="none"
              />
              <Polygon
                points={`${ax},${ay} ${ax - dir * 11},${ay - 9} ${ax - dir * 2},${ay - 14}`}
                fill={colors.primary}
              />
              {j.label ? (
                <SvgText fontFamily={SVG_FONT} x={mx} y={LINE_Y - h - 6} fontSize={17} fontWeight="bold" fill={colors.primaryDark} textAnchor="middle">
                  {j.label}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}

        {/* main line */}
        <Line x1={PAD - 12} y1={LINE_Y} x2={width - PAD + 12} y2={LINE_Y} stroke={colors.ink} strokeWidth={3} />
        {ticks.map((t, i) => (
          <React.Fragment key={`t${i}`}>
            <Line x1={x(t)} y1={LINE_Y - 10} x2={x(t)} y2={LINE_Y + 10} stroke={colors.ink} strokeWidth={i % labelEvery === 0 ? 3 : 1.5} />
            {i % labelEvery === 0 && (
              <SvgText fontFamily={SVG_FONT} x={x(t)} y={LINE_Y + 32} fontSize={16} fill={colors.ink} textAnchor="middle" fontWeight="bold">
                {fmt(t)}
              </SvgText>
            )}
          </React.Fragment>
        ))}

        {/* marks */}
        {(spec.marks ?? []).map((m, i) => (
          <React.Fragment key={`m${i}`}>
            <Circle cx={x(m.value)} cy={LINE_Y} r={9} fill={colors.purple} stroke="#fff" strokeWidth={2} />
            {m.label ? (
              <SvgText fontFamily={SVG_FONT} x={x(m.value)} y={LINE_Y + 54} fontSize={15} fontWeight="bold" fill={colors.purple} textAnchor="middle">
                {m.label}
              </SvgText>
            ) : null}
          </React.Fragment>
        ))}

        {/* child's marker */}
        {marker !== null && (
          <>
            <Polygon
              points={`${x(marker)},${LINE_Y - 2} ${x(marker) - 13},${LINE_Y - 26} ${x(marker) + 13},${LINE_Y - 26}`}
              fill={colors.green}
              stroke="#fff"
              strokeWidth={2}
            />
            <SvgText fontFamily={SVG_FONT} x={x(marker)} y={LINE_Y - 32} fontSize={20} fontWeight="bold" fill={colors.green} textAnchor="middle">
              {fmt(marker)}
            </SvgText>
          </>
        )}
      </Svg>
      {spec.interactive &&
        ticks.map((t, i) => (
          <Pressable
            key={`p${i}`}
            onPress={() => place(t)}
            accessibilityLabel={`Put marker at ${fmt(t)}`}
            style={{
              position: 'absolute',
              left: x(t) - Math.max(10, tickSpacing / 2),
              width: Math.max(20, tickSpacing),
              top: LINE_Y - 34,
              height: 68,
            }}
          />
        ))}
    </View>
  );
}
