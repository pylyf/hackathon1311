import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errMsg } from '../api';
import type { Curriculum, HintStyle, LearnedResponse, MemoryNote, SessionEndResponse, Topic } from '../contract';
import { colors, font } from '../theme';
import { BigButton, Card, ErrorBox, Loading, TopBar } from '../ui';
import { TracePanel } from '../trace';

const STYLES: HintStyle[] = ['verbal', 'visual', 'story', 'smaller-numbers'];
const STYLE_LABEL: Record<HintStyle, string> = {
  verbal: '💬 Talking',
  visual: '🎨 Pictures',
  story: '📖 Stories',
  'smaller-numbers': '🔢 Smaller numbers',
};
const STYLE_COLORS: Record<HintStyle, string> = {
  verbal: colors.blue,
  visual: colors.green,
  story: colors.purple,
  'smaller-numbers': colors.primary,
};
const TOPIC_LABEL: Record<Topic, string> = {
  'word-problems': '📝 Word problems',
  fractions: '🍕 Fractions',
  units: '📏 Units',
};
const KIND_ICON: Record<MemoryNote['kind'], string> = {
  misconception: '🤔',
  works: '✅',
  'doesnt-work': '🚫',
  interest: '⭐',
  mastered: '🏆',
};

function NoteRow({ n }: { n: MemoryNote }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteIcon}>{KIND_ICON[n.kind] ?? '•'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.noteText}>{n.text}</Text>
        <Text style={styles.noteMeta}>
          {n.kind} · {n.topic}
          {n.seen > 1 ? ` · seen ${n.seen}×` : ''}
        </Text>
      </View>
    </View>
  );
}

type Plan = NonNullable<SessionEndResponse['plan']>;

function PlanCard({ plan, curriculum }: { plan: Plan; curriculum: Curriculum | null }) {
  const next = plan.nextLessonId ? curriculum?.lessons.find((l) => l.id === plan.nextLessonId) : null;
  return (
    <View style={styles.plan}>
      <Text style={styles.planTitle}>🗓️ Plan for next time</Text>
      {plan.changes.map((c, i) => (
        <Text key={i} style={styles.planChange}>
          • {c}
        </Text>
      ))}
      {plan.nextLessonId && (
        <Text style={styles.planLine}>
          <Text style={styles.bold}>Next lesson: </Text>
          {next?.title ?? plan.nextLessonId}
        </Text>
      )}
      {plan.warmup && (
        <Text style={styles.planLine}>
          <Text style={styles.bold}>🔥 Warm-up: </Text>
          {plan.warmup.message}
        </Text>
      )}
      <TracePanel steps={plan.trace} title="🧠 How Nudge planned this" />
    </View>
  );
}

export default function LearnedScreen({
  newNotes,
  plan,
  curriculum,
  onBack,
}: {
  newNotes?: MemoryNote[];
  plan?: Plan;
  curriculum?: Curriculum | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<LearnedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.learned());
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hints = data?.stats.avgHintsPerSolved ?? [];
  const maxHint = Math.max(1, ...hints);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="What Nudge learned" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {((newNotes && newNotes.length > 0) || plan) && (
          <Card style={styles.newCard}>
            <Text style={styles.h2}>✨ New from today</Text>
            {newNotes?.map((n) => (
              <NoteRow key={n.id} n={n} />
            ))}
            {plan && <PlanCard plan={plan} curriculum={curriculum ?? null} />}
          </Card>
        )}

        {error && <ErrorBox message={error} onRetry={load} />}
        {!data && !error && <Loading label="Looking at my notes…" />}

        {data && (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.stat}>
                <Text style={styles.statNum}>{data.stats.sessions}</Text>
                <Text style={styles.statLabel}>sessions</Text>
              </Card>
              <Card style={styles.stat}>
                <Text style={styles.statNum}>{data.stats.problemsSolved}</Text>
                <Text style={styles.statLabel}>problems solved</Text>
              </Card>
            </View>

            <Card>
              <Text style={styles.h2}>Which hints help most</Text>
              <Text style={styles.sub}>How often each kind of hint helped you make progress</Text>
              {(Object.keys(data.bandit) as Topic[]).map((topic) => {
                const arms = data.bandit[topic];
                if (!arms) return null;
                const rates = STYLES.map((s) => {
                  const [a, b] = arms[s] ?? [1, 1];
                  return { s, rate: a / Math.max(1e-9, a + b), tries: Math.max(0, a + b - 2) };
                });
                const best = rates.reduce((m, r) => (r.rate > m.rate ? r : m), rates[0]);
                return (
                  <View key={topic} style={styles.topic}>
                    <Text style={styles.topicTitle}>{TOPIC_LABEL[topic] ?? topic}</Text>
                    {rates.map(({ s, rate, tries }) => (
                      <View key={s} style={styles.barRow}>
                        <Text style={[styles.barLabel, s === best.s && tries > 0 && { fontWeight: '900' }]}>{STYLE_LABEL[s]}</Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${Math.round(rate * 100)}%`, backgroundColor: STYLE_COLORS[s] }]} />
                        </View>
                        <Text style={styles.barPct}>{Math.round(rate * 100)}%</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </Card>

            <Card>
              <Text style={styles.h2}>Hints needed per problem</Text>
              <Text style={styles.sub}>Each bar is one session (oldest → newest). Lower = solving it more on your own!</Text>
              {hints.length === 0 ? (
                <Text style={styles.empty}>No sessions yet.</Text>
              ) : (
                <View style={styles.chart}>
                  {hints.map((h, i) => (
                    <View key={i} style={styles.col}>
                      <Text style={styles.colVal}>{Math.round(h * 10) / 10}</Text>
                      <View style={[styles.colBar, { height: 8 + (h / maxHint) * 110 }]} />
                      <Text style={styles.colLabel}>S{i + 1}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card>
              <Text style={styles.h2}>Notes about you</Text>
              {data.memory.length === 0 ? (
                <Text style={styles.empty}>Nothing yet — solve a problem and I'll start learning!</Text>
              ) : (
                data.memory.map((n) => <NoteRow key={n.id} n={n} />)
              )}
            </Card>

            <BigButton small label="↻ Refresh" onPress={load} color={colors.blue} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  h2: { fontSize: font.big - 2, fontWeight: '900', color: colors.ink },
  sub: { fontSize: font.small, color: colors.inkSoft, marginTop: 2, marginBottom: 8 },
  newCard: { borderWidth: 3, borderColor: colors.yellow, gap: 4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 40, fontWeight: '900', color: colors.primary },
  statLabel: { fontSize: font.small, color: colors.inkSoft, fontWeight: '700' },
  topic: { marginTop: 12, gap: 6 },
  topicTitle: { fontSize: font.body, fontWeight: '800', color: colors.ink },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 150, fontSize: font.small, color: colors.ink },
  barTrack: { flex: 1, height: 20, backgroundColor: '#F1ECE2', borderRadius: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 10 },
  barPct: { width: 44, textAlign: 'right', fontSize: font.small, fontWeight: '800', color: colors.ink },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 160, paddingTop: 8 },
  col: { alignItems: 'center', flex: 1, maxWidth: 48 },
  colVal: { fontSize: 12, fontWeight: '800', color: colors.ink, marginBottom: 2 },
  colBar: { width: '100%', backgroundColor: colors.purple, borderRadius: 8 },
  colLabel: { fontSize: 12, color: colors.inkSoft, marginTop: 4 },
  empty: { fontSize: font.body, color: colors.inkSoft, marginTop: 8 },
  note: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  noteIcon: { fontSize: 26 },
  noteText: { fontSize: font.body, color: colors.ink },
  plan: { marginTop: 10, gap: 6, backgroundColor: '#F2FBF6', borderRadius: 16, padding: 12, borderWidth: 2, borderColor: '#BDEBD3' },
  planTitle: { fontSize: font.body, fontWeight: '900', color: '#178A57' },
  planChange: { fontSize: font.small + 1, color: colors.ink, lineHeight: 22 },
  planLine: { fontSize: font.small + 1, color: colors.ink, lineHeight: 22 },
  bold: { fontWeight: '800' },
  noteMeta: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
});
