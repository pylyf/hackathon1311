// More GenUI blocks: Picture, Steps, Balance, Money, Shape, Tally. Same visual language as the rest.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { BalanceSpec, MoneySpec, PictureSpec, ShapeSpec, StepsSpec, TallySpec } from '../contract';
import { colors, ff } from '../theme';
import { SVG_FONT, VIS, type GenUIProps } from './types';

function useIn(delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
  }, [v, delay]);
  return v;
}

function Pop({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: object }) {
  const v = useIn(delay);
  return <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>{children}</Animated.View>;
}

// ------------------------------------------------------------------ Picture: a tiny illustrated story scene

export function Picture({ spec, width }: GenUIProps<PictureSpec>) {
  const n = spec.items.length;
  const cell = Math.min(110, (width - (n - 1) * 8) / n);
  return (
    <View style={[styles.picture, { width }]}>
      {spec.items.map((it, i) => {
        const c = VIS.series[i % VIS.series.length];
        return (
          <Pop key={i} delay={i * 140} style={{ width: cell, alignItems: 'center', gap: 4 }}>
            <View style={[styles.picBubble, { width: cell * 0.82, height: cell * 0.82, backgroundColor: c.soft }]}>
              <Text style={{ fontSize: cell * 0.42 }}>{it.emoji}</Text>
              {it.count && it.count > 1 ? (
                <View style={[styles.picCount, { backgroundColor: c.fill }]}>
                  <Text style={styles.picCountText}>×{it.count}</Text>
                </View>
              ) : null}
            </View>
            {it.label ? (
              <Text style={[styles.picLabel, { color: c.edge }]} numberOfLines={1}>
                {it.label}
              </Text>
            ) : null}
          </Pop>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ Steps: the method as a checklist

export function Steps({ spec, width }: GenUIProps<StepsSpec>) {
  const cur = Math.max(0, Math.min(spec.steps.length - 1, spec.current ?? 0));
  return (
    <View style={{ width, gap: 0 }}>
      {spec.steps.map((st, i) => {
        const done = i < cur;
        const on = i === cur;
        return (
          <Pop key={i} delay={i * 120}>
            <View style={styles.stepRow}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.stepDot, done && styles.stepDone, on && styles.stepOn]}>
                  <Text style={[styles.stepNum, (done || on) && { color: '#fff' }]}>{done ? '✓' : i + 1}</Text>
                </View>
                {i < spec.steps.length - 1 && <View style={[styles.stepLine, done && { backgroundColor: colors.green }]} />}
              </View>
              <View style={[styles.stepCard, on && styles.stepCardOn]}>
                <Text style={[styles.stepText, done && { color: colors.inkSoft }, on && { color: colors.ink }]}>{st}</Text>
              </View>
            </View>
          </Pop>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ Balance: which side is heavier?

export function Balance({ spec, width }: GenUIProps<BalanceSpec>) {
  const W = Math.min(width, 320);
  const H = 200;
  const tilt = spec.tilt === 'left' ? -1 : spec.tilt === 'right' ? 1 : 0;
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (spec.tilt === 'unknown') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(rot, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(rot, { toValue: -1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    Animated.spring(rot, { toValue: tilt, friction: 4, tension: 40, delay: 300, useNativeDriver: true } as never).start();
  }, [rot, tilt, spec.tilt]);
  const deg = rot.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] });
  const pan = (s: BalanceSpec['left'], c: (typeof VIS.series)[number]) => (
    <View style={styles.panWrap}>
      <View style={[styles.panLoad, { backgroundColor: c.soft }]}>
        {s.emoji ? <Text style={{ fontSize: 30 }}>{s.emoji}</Text> : null}
        <Text style={[styles.panLabel, { color: c.edge }]} numberOfLines={1}>
          {s.label}
        </Text>
      </View>
      <View style={[styles.pan, { backgroundColor: c.fill, borderBottomColor: c.edge }]} />
    </View>
  );
  return (
    <View style={{ width, alignItems: 'center' }}>
      <View style={{ width: W, height: H }}>
        {/* stand */}
        <View style={[styles.stand, { left: W / 2 - 6 }]} />
        <View style={[styles.base, { left: W / 2 - 50 }]} />
        {/* beam with pans; pans counter-rotate so they hang level */}
        <Animated.View style={[styles.beam, { width: W - 120, left: 60, transform: [{ rotate: deg }] }]}>
          <Animated.View style={[styles.panSlot, { left: -50, transform: [{ rotate: rot.interpolate({ inputRange: [-1, 1], outputRange: ['12deg', '-12deg'] }) }] }]}>
            {pan(spec.left, VIS.series[1])}
          </Animated.View>
          <Animated.View style={[styles.panSlot, { right: -50, transform: [{ rotate: rot.interpolate({ inputRange: [-1, 1], outputRange: ['12deg', '-12deg'] }) }] }]}>
            {pan(spec.right, VIS.series[0])}
          </Animated.View>
        </Animated.View>
        {spec.tilt === 'unknown' && (
          <View style={[styles.balQ, { left: W / 2 - 18 }]}>
            <Text style={styles.balQText}>?</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ Money: coins and notes

function Coin({ value, currency, delay }: { value: number; currency: string; delay: number }) {
  const note = value >= 500;
  const label = note ? `${currency}${value / 100}` : value >= 100 ? `${currency}${value / 100}` : `${value}${currency === '£' ? 'p' : 'c'}`;
  const gold = value >= 100 && !note;
  const size = value >= 100 ? 54 : value >= 20 ? 48 : 40;
  return (
    <Pop delay={delay}>
      {note ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>{label}</Text>
        </View>
      ) : (
        <View
          style={[
            styles.coin,
            { width: size, height: size, borderRadius: size / 2 },
            gold ? { backgroundColor: '#FFD15C', borderColor: '#E0A800' } : { backgroundColor: '#E2E6EA', borderColor: '#B9C0C7' },
          ]}
        >
          <Text style={[styles.coinText, { color: gold ? '#8A5A00' : '#5B6470' }]}>{label}</Text>
        </View>
      )}
    </Pop>
  );
}

export function Money({ spec, width }: GenUIProps<MoneySpec>) {
  let k = 0;
  return (
    <View style={[styles.money, { width }]}>
      {spec.coins.map((c, i) => Array.from({ length: c.count }, (_, j) => <Coin key={`${i}-${j}`} value={c.value} currency={spec.currency} delay={k++ * 90} />))}
    </View>
  );
}

// ------------------------------------------------------------------ Shape: perimeter labels / area grid

export function Shape({ spec, width }: GenUIProps<ShapeSpec>) {
  const W = Math.min(width, 300);
  const pad = 34;
  const isTri = spec.shape === 'triangle';
  const cols = spec.cols ?? (spec.shape === 'square' ? 4 : 5);
  const rows = spec.rows ?? (spec.shape === 'square' ? 4 : 3);
  const innerW = W - 2 * pad;
  const innerH = spec.shape === 'square' ? innerW : isTri ? innerW * 0.8 : innerW * (rows / cols);
  const H = innerH + 2 * pad;
  const c = VIS.series[2];
  const label = (i: number) => spec.sides[i] ?? '';
  const pill = (x: number, y: number, t: string) => {
    if (!t) return null;
    const unknown = t.trim() === '?';
    const w = Math.max(30, t.length * 9 + 14);
    return (
      <G>
        <Rect x={x - w / 2} y={y - 12} width={w} height={24} rx={12} fill={unknown ? colors.yellow : '#fff'} stroke={unknown ? colors.yellowDark : c.edge} strokeWidth={2} />
        <SvgText fontFamily={SVG_FONT} x={x} y={y + 5} fontSize={13} fill={unknown ? '#8A5A00' : c.edge} textAnchor="middle">
          {t}
        </SvgText>
      </G>
    );
  };
  return (
    <View style={{ width, alignItems: 'center' }}>
      <Svg width={W} height={H}>
        {isTri ? (
          <>
            <Polygon points={`${W / 2},${pad} ${W - pad},${H - pad} ${pad},${H - pad}`} fill={c.soft} stroke={c.fill} strokeWidth={4} strokeLinejoin="round" />
            {pill((W / 2 + pad) / 2 - 8, (pad + H - pad) / 2, label(0))}
            {pill((W / 2 + W - pad) / 2 + 8, (pad + H - pad) / 2, label(1))}
            {pill(W / 2, H - pad, label(2))}
          </>
        ) : (
          <>
            <Rect x={pad} y={pad} width={innerW} height={innerH} rx={6} fill={c.soft} stroke={c.fill} strokeWidth={4} />
            {spec.grid &&
              Array.from({ length: cols - 1 }, (_, i) => (
                <Line key={`c${i}`} x1={pad + ((i + 1) * innerW) / cols} y1={pad} x2={pad + ((i + 1) * innerW) / cols} y2={pad + innerH} stroke="#fff" strokeWidth={2.5} />
              ))}
            {spec.grid &&
              Array.from({ length: rows - 1 }, (_, i) => (
                <Line key={`r${i}`} x1={pad} y1={pad + ((i + 1) * innerH) / rows} x2={pad + innerW} y2={pad + ((i + 1) * innerH) / rows} stroke="#fff" strokeWidth={2.5} />
              ))}
            {pill(W / 2, pad, label(0))}
            {pill(W - pad, pad + innerH / 2, label(1))}
            {pill(W / 2, pad + innerH, label(2))}
            {pill(pad, pad + innerH / 2, label(3))}
          </>
        )}
      </Svg>
    </View>
  );
}

// ------------------------------------------------------------------ Tally: marks in groups of five

function TallyGroup({ n, color }: { n: number; color: string }) {
  return (
    <View style={styles.tallyGroup}>
      {Array.from({ length: Math.min(4, n) }, (_, i) => (
        <View key={i} style={[styles.tallyMark, { backgroundColor: color }]} />
      ))}
      {n === 5 && <View style={[styles.tallySlash, { backgroundColor: color }]} />}
    </View>
  );
}

export function Tally({ spec, width }: GenUIProps<TallySpec>) {
  return (
    <View style={{ width, gap: 8 }}>
      {spec.rows.map((r, i) => {
        const c = VIS.series[i % VIS.series.length];
        const groups: number[] = [];
        for (let left = r.count; left > 0; left -= 5) groups.push(Math.min(5, left));
        return (
          <Pop key={i} delay={i * 120}>
            <View style={[styles.tallyRow, { backgroundColor: c.soft }]}>
              <Text style={{ fontSize: 22 }}>{r.emoji ?? '•'}</Text>
              <Text style={[styles.tallyLabel, { color: c.edge }]} numberOfLines={1}>
                {r.label}
              </Text>
              <View style={styles.tallyMarks}>
                {r.unknown ? <Text style={[styles.tallyQ, { color: c.edge }]}>?</Text> : groups.map((g, k) => <TallyGroup key={k} n={g} color={c.fill} />)}
              </View>
            </View>
          </Pop>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  picture: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  picBubble: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  picCount: { position: 'absolute', right: -4, bottom: -2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 2, borderColor: '#fff' },
  picCountText: { fontFamily: ff.black, color: '#fff', fontSize: 12 },
  picLabel: { fontFamily: ff.black, fontSize: 13 },

  stepRow: { flexDirection: 'row', gap: 10 },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: VIS.empty, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: colors.green },
  stepOn: { backgroundColor: colors.primary },
  stepNum: { fontFamily: ff.black, fontSize: 14, color: colors.inkSoft },
  stepLine: { width: 3, flex: 1, minHeight: 10, backgroundColor: VIS.empty, borderRadius: 2 },
  stepCard: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 8, borderRadius: 12 },
  stepCardOn: { backgroundColor: '#FFF1EA' },
  stepText: { fontFamily: ff.bold, fontSize: 16, color: colors.inkSoft, lineHeight: 21 },

  stand: { position: 'absolute', top: 70, width: 12, height: 100, borderRadius: 6, backgroundColor: '#D7D7D7' },
  base: { position: 'absolute', bottom: 8, width: 100, height: 14, borderRadius: 7, backgroundColor: '#C9C9C9' },
  beam: { position: 'absolute', top: 64, height: 10, borderRadius: 5, backgroundColor: '#BDBDBD' },
  panSlot: { position: 'absolute', top: 5, width: 100, alignItems: 'center' },
  panWrap: { alignItems: 'center' },
  panLoad: { alignItems: 'center', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6, minWidth: 80 },
  panLabel: { fontFamily: ff.black, fontSize: 14 },
  pan: { width: 96, height: 12, borderRadius: 6, borderBottomWidth: 3, marginTop: 4 },
  balQ: { position: 'absolute', top: 18, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  balQText: { fontFamily: ff.display, fontSize: 22, color: '#fff' },

  money: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center' },
  coin: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderBottomWidth: 5 },
  coinText: { fontFamily: ff.black, fontSize: 13 },
  note: { width: 92, height: 50, borderRadius: 10, backgroundColor: '#BFE8CF', borderWidth: 3, borderColor: colors.green, borderBottomWidth: 5, alignItems: 'center', justifyContent: 'center' },
  noteText: { fontFamily: ff.display, fontSize: 20, color: colors.greenDark },

  tallyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  tallyLabel: { width: 70, fontFamily: ff.black, fontSize: 14 },
  tallyMarks: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  tallyGroup: { flexDirection: 'row', gap: 4, height: 26, alignItems: 'center' },
  tallyMark: { width: 4, height: 26, borderRadius: 2 },
  tallySlash: { position: 'absolute', left: -4, right: -4, top: 11, height: 4, borderRadius: 2, transform: [{ rotate: '-25deg' }] },
  tallyQ: { fontFamily: ff.display, fontSize: 22 },
});
