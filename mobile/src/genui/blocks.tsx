// New GenUI blocks. Everything animates in, and most of it reacts to touch — kids should never stare at a static picture.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type {
  ArrayGridSpec,
  BarChartSpec,
  CalloutSpec,
  ChoiceSpec,
  ClockSpec,
  CompareSpec,
  CountersSpec,
  EquationSpec,
  FractionPieSpec,
  PlaceValueSpec,
  RulerSpec,
  SliderSpec,
} from '../contract';
import { colors, ff, fmt } from '../theme';
import { FracBadge } from './parts';
import { SVG_FONT, VIS, type GenUIProps } from './types';

const PIE_COLORS = [colors.yellow, colors.primary, colors.purple, colors.green];

// ------------------------------------------------------------------ animation helpers

/** 0 -> 1 on mount (after `delay` ms). */
function useEnter(delay = 0, duration = 420) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [v, delay, duration]);
  return v;
}

function PopIn({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: object }) {
  const v = useEnter(delay);
  return (
    <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** A quick squash on tap. */
function useSquash() {
  const v = useRef(new Animated.Value(1)).current;
  const fire = () => {
    v.setValue(0.75);
    Animated.spring(v, { toValue: 1, friction: 3, tension: 200, useNativeDriver: true }).start();
  };
  return { scale: v, fire };
}

function Wiggle({ children, every = 2400 }: { children: React.ReactNode; every?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(every),
        Animated.timing(v, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(v, { toValue: -1, duration: 120, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 90, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, every]);
  return <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) }] }}>{children}</Animated.View>;
}

function Pulse({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>{children}</Animated.View>;
}

// ------------------------------------------------------------------ FractionPie

function slicePath(cx: number, cy: number, r: number, i: number, n: number): string {
  if (n === 1) return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

export function FractionPie({ spec, width, onEvent }: GenUIProps<FractionPieSpec>) {
  const [shaded, setShaded] = useState(() => spec.pies.map((p) => Array.from({ length: p.parts }, (_, i) => i < p.shaded)));
  const n = spec.pies.length;
  const size = Math.min(170, (width - (n - 1) * 14) / n);
  const r = size / 2 - 6;
  const toggle = (pi: number, si: number) => {
    if (!spec.interactive) return;
    const next = shaded.map((row) => row.slice());
    next[pi][si] = !next[pi][si];
    setShaded(next);
    onEvent?.({ component: 'FractionPie', action: 'shade', data: { pie: pi, shaded: next[pi].filter(Boolean).length, of: next[pi].length } });
  };
  return (
    <View style={styles.row}>
      {spec.pies.map((p, pi) => {
        const count = shaded[pi].filter(Boolean).length;
        return (
          <PopIn key={pi} delay={pi * 180} style={{ alignItems: 'center', gap: 6 }}>
            <Svg width={size} height={size + 5}>
              {/* bottom edge, like the app's chunky buttons */}
              <Circle cx={size / 2} cy={size / 2 + 5} r={r} fill={VIS.emptyEdge} />
              {shaded[pi].map((on, si) => (
                <Path
                  key={si}
                  d={slicePath(size / 2, size / 2, r, si, p.parts)}
                  fill={on ? VIS.series[pi % VIS.series.length].fill : VIS.empty}
                  stroke="#fff"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  onPress={() => toggle(pi, si)}
                />
              ))}
            </Svg>
            <FracBadge n={count} d={p.parts} color={VIS.series[pi % VIS.series.length].fill} />
            {p.label ? <Text style={styles.smallLabel}>{p.label}</Text> : null}
          </PopIn>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ Counters

function CounterItem({ emoji, delay, size, n, crossed, onPress }: { emoji: string; delay: number; size: number; n: number | null; crossed: boolean; onPress?: () => void }) {
  const { scale, fire } = useSquash();
  return (
    <PopIn delay={delay}>
      <Pressable
        onPress={() => {
          fire();
          onPress?.();
        }}
        disabled={!onPress}
      >
        <Animated.View style={[styles.counter, { width: size, height: size, transform: [{ scale }] }]}>
          <Text style={{ fontSize: size * 0.82, opacity: crossed ? 0.25 : 1 }}>{emoji}</Text>
          {crossed && <View style={[styles.cross, { width: size * 0.9 }]} />}
          {n !== null && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{n}</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </PopIn>
  );
}

/** Real objects in a tray. More than 10 are laid out in rows of ten, so 36 reads as 3 tens and 6. */
export function Counters({ spec, width, onEvent }: GenUIProps<CountersSpec>) {
  const inner = width - 30;
  const size = Math.max(24, Math.min(40, Math.floor(inner / 10) - 1));
  const [order, setOrder] = useState<string[]>([]);
  let idx = 0;
  const lastG = spec.groups.length - 1;
  return (
    <View style={{ width, gap: 10 }}>
      {spec.groups.map((g, gi) => {
        const c = VIS.series[gi % VIS.series.length];
        const crossOut = gi === lastG ? spec.crossOut ?? 0 : 0;
        const rows: number[][] = [];
        for (let i = 0; i < g.count; i += 10) rows.push(Array.from({ length: Math.min(10, g.count - i) }, (_, k) => i + k));
        return (
          <View key={gi} style={[styles.tray, { backgroundColor: c.soft }]}>
            <View style={styles.trayHead}>
              <Text style={[styles.groupLabel, { color: c.edge }]} numberOfLines={1}>
                {g.label ?? ''}
              </Text>
              <View style={[styles.countPill, { backgroundColor: c.fill }]}>
                <Text style={styles.countPillText}>{crossOut ? `${g.count} − ${crossOut}` : g.count}</Text>
              </View>
            </View>
            {rows.map((row, ri) => (
              <View key={ri} style={styles.tenRow}>
                {row.map((i) => {
                  const id = `${gi}-${i}`;
                  const pos = order.indexOf(id);
                  return (
                    <CounterItem
                      key={id}
                      emoji={g.emoji}
                      delay={Math.min(900, idx++ * 25)}
                      size={size}
                      n={pos >= 0 ? pos + 1 : null}
                      crossed={i >= g.count - crossOut}
                      onPress={
                        spec.interactive
                          ? () => {
                              const next = pos >= 0 ? order.filter((x) => x !== id) : [...order, id];
                              setOrder(next);
                              onEvent?.({ component: 'Counters', action: 'count', data: { counted: next.length } });
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
      {spec.interactive && <Text style={styles.counterHint}>{order.length ? `You counted ${order.length}!` : 'Tap each one to count it'}</Text>}
    </View>
  );
}

// ------------------------------------------------------------------ ArrayGrid

export function ArrayGrid({ spec, width, onEvent }: GenUIProps<ArrayGridSpec>) {
  const cell = Math.min(40, (width - 50) / spec.cols);
  const [lit, setLit] = useState(0); // rows lit so far
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      {Array.from({ length: spec.rows }, (_, r) => (
        <Pressable
          key={r}
          disabled={!spec.interactive}
          onPress={() => {
            const n = r + 1;
            setLit(n);
            onEvent?.({ component: 'ArrayGrid', action: 'count_rows', data: { rows: n, total: n * spec.cols } });
          }}
          style={[styles.gridRow, r < lit && { backgroundColor: colors.yellowLight, borderColor: colors.yellow }]}
        >
          {Array.from({ length: spec.cols }, (_, c) => (
            <PopIn key={c} delay={(r * spec.cols + c) * 25}>
              <Text style={{ fontSize: cell * 0.7, width: cell, textAlign: 'center' }}>{spec.emoji ?? '🔵'}</Text>
            </PopIn>
          ))}
          {r < lit && <Text style={styles.rowCount}>{(r + 1) * spec.cols}</Text>}
        </Pressable>
      ))}
      <Text style={styles.smallLabel}>
        {spec.rows} rows of {spec.cols}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ BarChart

function GrowBar({ h, color, delay, unknown }: { h: number; color: string; delay: number; unknown?: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: h, duration: 650, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v, h, delay]);
  return (
    <Animated.View
      style={[
        styles.chartBar,
        { height: v, backgroundColor: unknown ? colors.unknown : color, borderColor: unknown ? colors.yellowDark : 'transparent', borderStyle: unknown ? 'dashed' : 'solid' },
      ]}
    >
      {unknown ? <Text style={styles.chartQ}>?</Text> : null}
    </Animated.View>
  );
}

export function BarChart({ spec, width }: GenUIProps<BarChartSpec>) {
  const max = Math.max(1, ...spec.bars.map((b) => (b.unknown ? 0 : b.value)), ...spec.bars.filter((b) => b.unknown).map(() => 1));
  const H = 150;
  const colW = Math.min(64, (width - 20) / spec.bars.length - 8);
  const palette = [colors.blue, colors.primary, colors.green, colors.purple, colors.yellow, colors.red];
  return (
    <View style={{ width, gap: 6 }}>
      <View style={[styles.chart, { height: H + 26 }]}>
        {spec.bars.map((b, i) => {
          const h = b.unknown ? H * 0.55 : Math.max(6, (b.value / max) * H);
          return (
            <View key={i} style={{ alignItems: 'center', width: colW, justifyContent: 'flex-end', height: H + 26 }}>
              <Text style={styles.chartVal}>{b.unknown ? '' : `${fmt(b.value)}${spec.unit ? ` ${spec.unit}` : ''}`}</Text>
              <GrowBar h={h} color={palette[i % palette.length]} delay={i * 140} unknown={b.unknown} />
            </View>
          );
        })}
      </View>
      <View style={styles.chartAxis} />
      <View style={styles.chartLabels}>
        {spec.bars.map((b, i) => (
          <View key={i} style={{ width: colW, alignItems: 'center' }}>
            {b.emoji ? <Text style={{ fontSize: 20 }}>{b.emoji}</Text> : null}
            <Text style={styles.chartLabel} numberOfLines={2}>
              {b.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ PlaceValue

export function PlaceValue({ spec, width }: GenUIProps<PlaceValueSpec>) {
  const n = Math.max(0, Math.min(9999, Math.round(spec.number)));
  const digits = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
  const cols = [
    { label: 'Thousands', color: colors.purple },
    { label: 'Hundreds', color: colors.blue },
    { label: 'Tens', color: colors.green },
    { label: 'Ones', color: colors.primary },
  ].map((c, i) => ({ ...c, d: digits[i] }));
  const shown = cols.filter((c, i) => c.d > 0 || i >= cols.findIndex((x) => x.d > 0) || i === 3);
  let k = 0;
  return (
    <View style={{ width, gap: 8 }}>
      <View style={styles.pvRow}>
        {shown.map((c) => (
          <View key={c.label} style={[styles.pvCol, { borderColor: c.color }]}>
            <Text style={[styles.pvHead, { color: c.color }]}>{c.label.toUpperCase()}</Text>
            <View style={styles.pvItems}>
              {Array.from({ length: c.d }, (_, i) => (
                <PopIn key={i} delay={k++ * 60}>
                  {c.label === 'Ones' ? (
                    <View style={[styles.pvOne, { backgroundColor: c.color }]} />
                  ) : c.label === 'Tens' ? (
                    <View style={[styles.pvTen, { backgroundColor: c.color }]} />
                  ) : c.label === 'Hundreds' ? (
                    <View style={[styles.pvHundred, { backgroundColor: c.color }]} />
                  ) : (
                    <View style={[styles.pvThousand, { backgroundColor: c.color }]} />
                  )}
                </PopIn>
              ))}
            </View>
            <Text style={[styles.pvDigit, { color: c.color }]}>{c.d}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ Ruler

export function Ruler({ spec, width, onEvent }: GenUIProps<RulerSpec>) {
  const pad = 16;
  const W = width;
  const H = 110;
  const x = (v: number) => pad + (v / spec.max) * (W - 2 * pad);
  const [pick, setPick] = useState<number | null>(null);
  const ticks = [];
  for (let i = 0; i <= spec.max * 2; i++) ticks.push(i / 2);
  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H}>
        <Rect x={4} y={20} width={W - 8} height={56} rx={8} fill="#FFE7A8" stroke={colors.yellowDark} strokeWidth={2} />
        {ticks.map((t) => {
          const whole = Number.isInteger(t);
          return (
            <G key={t}>
              <Line x1={x(t)} y1={20} x2={x(t)} y2={whole ? 44 : 34} stroke={colors.yellowDark} strokeWidth={whole ? 2.5 : 1.5} strokeLinecap="round" />
              {whole && (
                <SvgText fontFamily={SVG_FONT} x={x(t)} y={62} fontSize={13} fontWeight="bold" fill={colors.ink} textAnchor="middle">
                  {String(t)}
                </SvgText>
              )}
            </G>
          );
        })}
        <SvgText fontFamily={SVG_FONT} x={W - 14} y={72} fontSize={11} fill={colors.inkSoft} textAnchor="end">
          {spec.unit}
        </SvgText>
        {(spec.marks ?? []).map((m, i) => (
          <G key={i}>
            <Path d={`M ${x(m.value)} 18 l -7 -12 h 14 z`} fill={colors.purple} />
            {m.label ? (
              <SvgText fontFamily={SVG_FONT} x={x(m.value)} y={96} fontSize={13} fontWeight="bold" fill={colors.purple} textAnchor="middle">
                {m.label}
              </SvgText>
            ) : null}
          </G>
        ))}
        {pick !== null && (
          <G>
            <Rect x={x(0)} y={80} width={x(pick) - x(0)} height={10} rx={5} fill={colors.green} />
            <SvgText fontFamily={SVG_FONT} x={x(pick)} y={106} fontSize={14} fontWeight="bold" fill={colors.green} textAnchor="middle">
              {`${fmt(pick)} ${spec.unit}`}
            </SvgText>
          </G>
        )}
      </Svg>
      {spec.interactive &&
        ticks
          .filter((t) => Number.isInteger(t))
          .map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                setPick(t);
                onEvent?.({ component: 'Ruler', action: 'measure', data: { value: t } });
              }}
              style={{ position: 'absolute', left: x(t) - 12, width: 24, top: 18, height: 60 }}
            />
          ))}
    </View>
  );
}

// ------------------------------------------------------------------ Clock

export function Clock({ spec }: GenUIProps<ClockSpec>) {
  const S = 180;
  const c = S / 2;
  const minuteDeg = spec.minute * 6;
  const hourDeg = ((spec.hour % 12) + spec.minute / 60) * 30;
  const hv = useRef(new Animated.Value(0)).current;
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = hv.addListener(({ value }) => setT(value));
    Animated.timing(hv, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => hv.removeListener(id);
  }, [hv]);
  const hand = (deg: number, len: number) => {
    const a = ((deg * t - 90) * Math.PI) / 180;
    return { x2: c + len * Math.cos(a), y2: c + len * Math.sin(a) };
  };
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={S} height={S}>
        <Circle cx={c} cy={c} r={c - 4} fill="#fff" stroke={colors.blue} strokeWidth={6} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = ((i * 30 - 60) * Math.PI) / 180;
          return (
            <SvgText key={i} fontFamily={SVG_FONT} x={c + (c - 24) * Math.cos(a)} y={c + (c - 24) * Math.sin(a) + 6} fontSize={16} fontWeight="bold" fill={colors.ink} textAnchor="middle">
              {String(i + 1)}
            </SvgText>
          );
        })}
        <Line x1={c} y1={c} {...hand(hourDeg, c * 0.45)} stroke={colors.ink} strokeWidth={7} strokeLinecap="round" />
        <Line x1={c} y1={c} {...hand(minuteDeg, c * 0.7)} stroke={colors.primary} strokeWidth={5} strokeLinecap="round" />
        <Circle cx={c} cy={c} r={7} fill={colors.ink} />
      </Svg>
    </View>
  );
}

// ------------------------------------------------------------------ Equation

function EqToken({ tok, i }: { tok: string; i: number }) {
  if (tok === '?' || tok === '□') {
    return (
      <Pulse>
        <View style={styles.eqBox}>
          <Text style={styles.eqQ}>?</Text>
        </View>
      </Pulse>
    );
  }
  const op = /^[+\-×x÷=:*/]$/.test(tok);
  return <Text style={[styles.eqTok, op && { color: i % 2 ? colors.primary : colors.blue }]}>{tok === '*' ? '×' : tok}</Text>;
}

export function Equation({ spec }: GenUIProps<EquationSpec>) {
  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      {spec.lines.map((line, li) => {
        const toks = line.replace(/([+\-×÷=*/])/g, ' $1 ').split(/\s+/).filter(Boolean);
        return (
          <PopIn key={li} delay={li * 500} style={styles.eqLine}>
            {toks.map((t, i) => (
              <EqToken key={i} tok={t} i={i} />
            ))}
          </PopIn>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ Compare

export function Compare({ spec }: GenUIProps<CompareSpec>) {
  return (
    <View style={styles.cmpRow}>
      <PopIn style={[styles.cmpCard, { borderColor: colors.blue }]}>
        {spec.leftEmoji ? <Text style={{ fontSize: 36 }}>{spec.leftEmoji}</Text> : null}
        <Text style={[styles.cmpText, { color: colors.blue }]}>{spec.left}</Text>
      </PopIn>
      <Wiggle every={1600}>
        <View style={styles.cmpMid}>
          <Text style={styles.cmpQ}>{'< = >'}</Text>
          <Text style={styles.cmpQBig}>?</Text>
        </View>
      </Wiggle>
      <PopIn delay={200} style={[styles.cmpCard, { borderColor: colors.primary }]}>
        {spec.rightEmoji ? <Text style={{ fontSize: 36 }}>{spec.rightEmoji}</Text> : null}
        <Text style={[styles.cmpText, { color: colors.primary }]}>{spec.right}</Text>
      </PopIn>
    </View>
  );
}

// ------------------------------------------------------------------ Choice

export function Choice({ spec, onEvent }: GenUIProps<ChoiceSpec>) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.choiceQ}>{spec.question}</Text>
      <View style={styles.choiceGrid}>
        {spec.options.map((o, i) => (
          <PopIn key={i} delay={i * 120} style={{ width: '47%', flexGrow: 1 }}>
            <Pressable
              onPress={() => {
                setPicked(i);
                onEvent?.({ component: 'Choice', action: 'choose', data: { option: o } });
              }}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.choice,
                    picked === i && { backgroundColor: colors.blueLight, borderColor: colors.blueBorder },
                    { borderBottomWidth: pressed ? 2 : 5, marginTop: pressed ? 3 : 0 },
                  ]}
                >
                  <Text style={[styles.choiceText, picked === i && { color: colors.blueDark }]}>{o}</Text>
                </View>
              )}
            </Pressable>
          </PopIn>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ Slider

export function Slider({ spec, width, onEvent }: GenUIProps<SliderSpec>) {
  const W = width - 40;
  const steps = Math.round((spec.max - spec.min) / spec.step);
  const [val, setVal] = useState(spec.min + Math.round(steps / 2) * spec.step);
  const valRef = useRef(val);
  const startX = useRef(0);
  const toX = (v: number) => ((v - spec.min) / (spec.max - spec.min)) * W;
  const fromX = (px: number) => {
    const clamped = Math.max(0, Math.min(W, px));
    const k = Math.round((clamped / W) * steps);
    return parseFloat((spec.min + k * spec.step).toFixed(6));
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startX.current = toX(valRef.current);
        },
        onPanResponderMove: (_e, g) => {
          const v = fromX(startX.current + g.dx);
          if (v !== valRef.current) {
            valRef.current = v;
            setVal(v);
          }
        },
        onPanResponderRelease: () => onEvent?.({ component: 'Slider', action: 'set', data: { value: valRef.current } }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [W, steps],
  );
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Text style={styles.sliderVal}>
        {fmt(val)}
        {spec.unit ? ` ${spec.unit}` : ''}
      </Text>
      <View style={{ width: W, height: 48, justifyContent: 'center' }} {...pan.panHandlers}>
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: toX(val) }]} />
        <View style={[styles.sliderThumb, { left: toX(val) - 24 }]}>
          <Text style={{ fontSize: 24 }}>{spec.emoji ?? '🦦'}</Text>
        </View>
      </View>
      <View style={[styles.sliderEnds, { width: W }]}>
        <Text style={styles.smallLabel}>{fmt(spec.min)}</Text>
        <Text style={styles.smallLabel}>{fmt(spec.max)}</Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ Callout

const TONE = {
  idea: { bg: colors.yellowLight, border: '#FFE08A', ink: colors.yellowDark, label: 'BIG IDEA' },
  tip: { bg: colors.blueLight, border: colors.blueBorder, ink: colors.blueDark, label: 'TIP' },
  wow: { bg: '#F3ECFE', border: '#D5BFFA', ink: colors.purpleDark, label: 'WOW' },
  remember: { bg: colors.greenLight, border: '#BDEBD1', ink: colors.greenDark, label: 'REMEMBER' },
};

export function Callout({ spec }: GenUIProps<CalloutSpec>) {
  const t = TONE[spec.tone ?? 'idea'];
  return (
    <View style={[styles.callout, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Wiggle>
        <Text style={{ fontSize: 40 }}>{spec.emoji}</Text>
      </Wiggle>
      <View style={{ flex: 1 }}>
        <Text style={[styles.calloutLabel, { color: t.ink }]}>{t.label}</Text>
        <Text style={styles.calloutText}>{spec.text}</Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ styles

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' },
  smallLabel: { fontFamily: ff.bold, fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  fracBadge: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  fracNum: { fontFamily: ff.black, color: '#fff', fontSize: 16, lineHeight: 19 },
  fracLine: { width: 18, height: 2, backgroundColor: '#fff', borderRadius: 1 },

  tray: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 6, gap: 4 },
  trayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  groupLabel: { flex: 1, fontFamily: ff.black, fontSize: 14 },
  countPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  countPillText: { fontFamily: ff.black, color: '#fff', fontSize: 15 },
  tenRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  tenTag: { position: 'absolute', right: -2, top: -8, fontFamily: ff.black, fontSize: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  counter: { alignItems: 'center', justifyContent: 'center' },
  cross: { position: 'absolute', height: 4, backgroundColor: colors.red, borderRadius: 2, transform: [{ rotate: '-30deg' }] },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  countBadgeText: { fontFamily: ff.black, color: '#fff', fontSize: 11 },
  counterHint: { fontFamily: ff.black, fontSize: 14, color: colors.green, textAlign: 'center' },

  gridRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 10, paddingHorizontal: 4 },
  rowCount: { position: 'absolute', right: -34, fontFamily: ff.black, color: colors.yellowDark, fontSize: 15 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  chartBar: { width: '100%', borderTopLeftRadius: 10, borderTopRightRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  chartQ: { fontFamily: ff.display, fontSize: 28, color: colors.yellowDark },
  chartVal: { fontFamily: ff.black, fontSize: 13, color: colors.ink, marginBottom: 4 },
  chartAxis: { height: 4, backgroundColor: VIS.line, borderRadius: 2 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-around' },
  chartLabel: { fontFamily: ff.bold, fontSize: 12, color: colors.ink, textAlign: 'center' },

  pvRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  pvCol: { flex: 1, borderWidth: 2, borderRadius: 12, padding: 6, alignItems: 'center', gap: 6, minHeight: 150 },
  pvHead: { fontFamily: ff.black, fontSize: 9, letterSpacing: 0.5 },
  pvItems: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center', alignContent: 'flex-start' },
  pvOne: { width: 12, height: 12, borderRadius: 2 },
  pvTen: { width: 8, height: 50, borderRadius: 2 },
  pvHundred: { width: 30, height: 30, borderRadius: 3 },
  pvThousand: { width: 34, height: 34, borderRadius: 4, borderWidth: 3, borderColor: '#fff' },
  pvDigit: { fontFamily: ff.display, fontSize: 30 },

  eqLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  eqTok: { fontFamily: ff.display, fontSize: 32, color: colors.ink },
  eqBox: { width: 52, height: 48, borderRadius: 10, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1EA' },
  eqQ: { fontFamily: ff.display, fontSize: 26, color: colors.primary },

  cmpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  cmpCard: { borderWidth: 3, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', minWidth: 96, backgroundColor: '#fff' },
  cmpText: { fontFamily: ff.display, fontSize: 32 },
  cmpMid: { alignItems: 'center' },
  cmpQ: { fontFamily: ff.black, fontSize: 12, color: colors.trackText },
  cmpQBig: { fontFamily: ff.display, fontSize: 36, color: colors.ink },

  choiceQ: { fontFamily: ff.black, fontSize: 17, color: colors.ink, textAlign: 'center' },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { borderWidth: 2, borderColor: colors.line, borderRadius: 16, paddingVertical: 16, alignItems: 'center', backgroundColor: '#fff' },
  choiceText: { fontFamily: ff.display, fontSize: 22, color: colors.ink },

  sliderVal: { fontFamily: ff.display, fontSize: 36, color: colors.primary },
  sliderTrack: { position: 'absolute', left: 0, right: 0, height: 12, borderRadius: 6, backgroundColor: colors.track },
  sliderFill: { position: 'absolute', left: 0, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  sliderThumb: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderEnds: { flexDirection: 'row', justifyContent: 'space-between' },

  callout: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderRadius: 18, padding: 14 },
  calloutLabel: { fontFamily: ff.black, fontSize: 12, letterSpacing: 1 },
  calloutText: { fontFamily: ff.bold, fontSize: 17, color: colors.ink, lineHeight: 23 },
});
