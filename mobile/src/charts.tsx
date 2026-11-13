// Charts for the parent-facing "Nudge's brain" screen (react-native-svg, no chart library).
// Palette validated for colour-blind separation: purple #7D4BCC, orange #E25E2A, blue #1C83C6.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { BrainChange, InsightsResponse } from './contract';
import { colors, ff } from './theme';

export const CHART = {
  series: '#E25E2A', // single-series line (orange)
  upgrade: '#7D4BCC', // agent upgrades (purple)
  recipe: '#1C83C6', // saved visuals (blue)
  grid: '#EFEFEF',
  axis: '#A3A3A3',
};
const FONT = 'Nunito_800ExtraBold';

const fmtTime = (s: number | null) => (s == null ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

/**
 * Hints needed per problem, oldest → newest, with a dashed trend line and purple markers where the
 * agent rewrote its own skills. Tap a point for details.
 */
export function HintsChart({ problems, changes, width }: { problems: InsightsResponse['problems']; changes: BrainChange[]; width: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const data = problems.slice(-24);
  const H = 190;
  const padL = 26;
  const padR = 10;
  const padT = 22;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = H - padT - padB;
  const maxY = Math.max(3, ...data.map((d) => d.hints));
  const x = (i: number) => padL + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxY) * plotH;

  // least-squares trend
  const trend = useMemo(() => {
    const n = data.length;
    if (n < 3) return null;
    const xs = data.map((_, i) => i);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = data.reduce((a, d) => a + d.hints, 0) / n;
    const den = xs.reduce((a, xi) => a + (xi - mx) ** 2, 0) || 1;
    const k = xs.reduce((a, xi, i) => a + (xi - mx) * (data[i].hints - my), 0) / den;
    const b = my - k * mx;
    return { y0: Math.max(0, b), y1: Math.max(0, b + k * (n - 1)) };
  }, [data]);

  // where did the agent upgrade itself? place a marker before the first problem after each upgrade
  const upgradeAt = useMemo(() => {
    const idx = new Set<number>();
    for (const c of changes) {
      if (c.kind === 'note') continue;
      const i = data.findIndex((d) => d.ts > c.ts);
      if (i > 0) idx.add(i);
    }
    return [...idx];
  }, [changes, data]);

  if (data.length === 0) return <Text style={styles.empty}>No problems yet. The chart fills in as your child practises.</Text>;

  // smooth the story: a running average over the last 3 problems; single problems are faint dots
  const smooth = data.map((_, i) => {
    const w = data.slice(Math.max(0, i - 2), i + 1);
    return w.reduce((a, d) => a + d.hints, 0) / w.length;
  });
  const line = smooth.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  const ticks = Array.from({ length: maxY + 1 }, (_, i) => i).filter((t) => maxY <= 5 || t % 2 === 0);
  const s = sel !== null ? data[sel] : null;

  return (
    <View style={{ width, height: H }}>
      <Svg width={width} height={H}>
        <Defs>
          <LinearGradient id="hintArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={CHART.series} stopOpacity={0.18} />
            <Stop offset="1" stopColor={CHART.series} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
            <SvgText fontFamily={FONT} x={padL - 8} y={y(t) + 4} fontSize={11} fill={CHART.axis} textAnchor="end">
              {String(t)}
            </SvgText>
          </G>
        ))}
        {upgradeAt.map((i) => {
          const ux = (x(i - 1) + x(i)) / 2;
          return (
            <G key={`u${i}`}>
              <Line x1={ux} x2={ux} y1={padT - 4} y2={padT + plotH} stroke={CHART.upgrade} strokeWidth={1.5} strokeDasharray="3,4" opacity={0.6} />
              <Circle cx={ux} cy={padT - 8} r={5} fill={CHART.upgrade} />
            </G>
          );
        })}
        <Path d={area} fill="url(#hintArea)" />
        {trend && <Line x1={x(0)} y1={y(trend.y0)} x2={x(data.length - 1)} y2={y(trend.y1)} stroke={CHART.axis} strokeWidth={2} strokeDasharray="6,5" />}
        <Path d={line} stroke={CHART.series} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <Circle key={i} cx={x(i)} cy={y(d.hints)} r={sel === i ? 6 : 3.5} fill={CHART.series} opacity={sel === i ? 1 : 0.28} />
        ))}
        {sel !== null && <Circle cx={x(sel)} cy={y(smooth[sel])} r={6} fill={CHART.series} stroke="#fff" strokeWidth={2} />}
        <SvgText fontFamily={FONT} x={padL} y={H - 6} fontSize={11} fill={CHART.axis}>
          first
        </SvgText>
        <SvgText fontFamily={FONT} x={width - padR} y={H - 6} fontSize={11} fill={CHART.axis} textAnchor="end">
          latest
        </SvgText>
      </Svg>
      {/* hit targets bigger than the dots */}
      {data.map((_, i) => {
        const w = data.length <= 1 ? plotW : plotW / (data.length - 1);
        return <Pressable key={i} onPress={() => setSel(sel === i ? null : i)} style={{ position: 'absolute', left: x(i) - w / 2, width: w, top: padT, height: plotH }} />;
      })}
      {s && sel !== null && (
        <View pointerEvents="none" style={[styles.tip, { left: Math.min(width - 150, Math.max(0, x(sel) - 75)), top: Math.max(0, y(s.hints) - 64) }]}>
          <Text style={styles.tipTitle}>
            Problem {problems.length - data.length + sel + 1} · {s.topic.replace('-', ' ')}
          </Text>
          <Text style={styles.tipText}>
            {s.hints} hint{s.hints === 1 ? '' : 's'} · {s.solved ? `solved in ${fmtTime(s.seconds)}` : 'not solved'}
          </Text>
        </View>
      )}
    </View>
  );
}

const STYLE_LABEL: Record<string, string> = { verbal: 'Talking it through', visual: 'Pictures', story: 'Stories', 'smaller-numbers': 'Smaller numbers' };

/** How often each kind of hint led to progress. Single hue; the best one is called out. */
export function StyleBars({ styles: st }: { styles: InsightsResponse['styles'] }) {
  const rows = Object.entries(st).map(([k, v]) => ({ k, used: v.used, rate: v.used ? v.helped / v.used : 0 }));
  const best = rows.filter((r) => r.used >= 2).sort((a, b) => b.rate - a.rate)[0];
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => (
        <View key={r.k} style={styles.barRow}>
          <Text style={[styles.barLabel, best?.k === r.k && { color: colors.ink }]} numberOfLines={1}>
            {STYLE_LABEL[r.k] ?? r.k}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.round(r.rate * 100)}%`, backgroundColor: best?.k === r.k ? CHART.upgrade : '#C9B5EE' }]} />
          </View>
          <Text style={styles.barVal}>{r.used ? `${Math.round(r.rate * 100)}%` : '—'}</Text>
          <Text style={styles.barN}>{r.used}×</Text>
        </View>
      ))}
    </View>
  );
}

/** Simple line diff: removed lines struck through, added lines highlighted. */
export function SkillDiff({ before, after }: { before?: string; after?: string }) {
  const clean = (t?: string) =>
    (t ?? '')
      .split('\n')
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
  const b = clean(before);
  const a = clean(after);
  const removed = b.filter((l) => !a.includes(l));
  const lines = [...removed.map((l) => ({ l, kind: 'del' as const })), ...a.map((l) => ({ l, kind: b.includes(l) ? ('same' as const) : ('add' as const) }))];
  return (
    <View style={{ gap: 3 }}>
      {lines.map((x, i) => (
        <View key={i} style={[styles.diffLine, x.kind === 'add' && styles.diffAdd, x.kind === 'del' && styles.diffDel]}>
          <Text style={[styles.diffMark, x.kind === 'add' && { color: colors.greenDark }, x.kind === 'del' && { color: colors.red }]}>
            {x.kind === 'add' ? '+' : x.kind === 'del' ? '−' : ' '}
          </Text>
          <Text style={[styles.diffText, x.kind === 'del' && styles.diffDelText]}>{x.l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Tiny bar sparkline: upgrades per day. */
export function UpgradeTimeline({ changes, width }: { changes: BrainChange[]; width: number }) {
  const real = changes.filter((c) => c.kind !== 'note').slice().reverse(); // oldest first
  if (!real.length) return null;
  const H = 46;
  const step = real.length > 1 ? (width - 16) / (real.length - 1) : 0;
  return (
    <Svg width={width} height={H}>
      <Line x1={8} x2={width - 8} y1={H / 2} y2={H / 2} stroke={CHART.grid} strokeWidth={3} strokeLinecap="round" />
      {real.map((c, i) => {
        const cx = real.length > 1 ? 8 + i * step : width / 2;
        const col = c.kind === 'recipe-created' ? CHART.recipe : c.kind === 'skill-updated' ? CHART.series : CHART.upgrade;
        return <Rect key={i} x={cx - 5} y={H / 2 - 9} width={10} height={18} rx={4} fill={col} stroke="#fff" strokeWidth={2} />;
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: ff.bold, fontSize: 14, color: colors.inkSoft, paddingVertical: 20, textAlign: 'center' },
  tip: { position: 'absolute', width: 150, backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  tipTitle: { fontFamily: ff.black, fontSize: 12, color: '#fff' },
  tipText: { fontFamily: ff.bold, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 118, fontFamily: ff.bold, fontSize: 13, color: colors.inkSoft },
  barTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: '#F3F3F3', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7 },
  barVal: { width: 38, textAlign: 'right', fontFamily: ff.black, fontSize: 13, color: colors.ink },
  barN: { width: 28, textAlign: 'right', fontFamily: ff.bold, fontSize: 11, color: CHART.axis },
  diffLine: { flexDirection: 'row', gap: 6, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 6 },
  diffAdd: { backgroundColor: '#E6F8EE' },
  diffDel: { backgroundColor: '#FFEEF1' },
  diffMark: { width: 10, fontFamily: ff.black, fontSize: 14, color: CHART.axis },
  diffText: { flex: 1, fontFamily: ff.regular, fontSize: 14, color: colors.ink, lineHeight: 19 },
  diffDelText: { textDecorationLine: 'line-through', color: colors.inkSoft },
});
