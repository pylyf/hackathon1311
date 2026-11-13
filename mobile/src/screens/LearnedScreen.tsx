// "Nudge's brain" — the parent-facing dashboard. The child never sees this.
// It shows how the agent is improving itself: fewer hints over time, the skills it rewrote (as diffs),
// what helps this child, and what it knows about them.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { api, errMsg } from '../api';
import type { BrainChange, BrainResponse, ChildProfile, Curriculum, InsightsResponse, LearnedResponse, MemoryNote, SessionEndResponse, SystemResponse } from '../contract';
import { TechView } from '../tech';
import { CHART, HintsChart, SkillDiff, StyleBars, UpgradeTimeline } from '../charts';
import { Icon, TOPIC } from '../game';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { colors, ff, font } from '../theme';
import { ErrorBox, Loading, Mascot, TopBar } from '../ui';

type Plan = NonNullable<SessionEndResponse['plan']>;

const KIND: Record<MemoryNote['kind'], { icon: string; label: string }> = {
  misconception: { icon: '🤔', label: 'Tricky' },
  works: { icon: '✅', label: 'Works' },
  'doesnt-work': { icon: '🚫', label: "Doesn't help" },
  interest: { icon: '⭐', label: 'Loves' },
  mastered: { icon: '🏆', label: 'Mastered' },
};
const CHANGE: Record<BrainChange['kind'], { label: string; color: string }> = {
  'skill-created': { label: 'Wrote a new skill', color: CHART.upgrade },
  'skill-updated': { label: 'Rewrote a skill', color: CHART.series },
  'recipe-created': { label: 'Saved a visual that worked', color: CHART.recipe },
  note: { label: 'Note', color: colors.inkSoft },
};

export default function LearnedScreen({ plan, curriculum, onBack }: { newNotes?: MemoryNote[]; changes?: BrainChange[]; plan?: Plan; curriculum?: Curriculum | null; onBack: () => void }) {
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(winW, 720) - 32 - 32; // screen padding + card padding
  const [learned, setLearned] = useState<LearnedResponse | null>(null);
  const [brain, setBrain] = useState<BrainResponse | null>(null);
  const [ins, setIns] = useState<InsightsResponse | null>(null);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [view, setView] = useState<'parent' | 'tech'>('parent');
  const [sys, setSys] = useState<SystemResponse | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, b, i, p, y] = await Promise.all([
        api.learned(),
        api.brain(),
        api.insights(),
        api.profile().catch(() => ({ profile: null })),
        api.system().catch(() => null),
      ]);
      setSys(y);
      setLearned(l);
      setBrain(b);
      setIns(i);
      setProfile(p.profile);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const name = profile?.name?.split(' ')[0] ?? 'your child';
  const ready = learned && brain && ins;

  // headline numbers
  const solved = ins?.problems.filter((p) => p.solved) ?? [];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const firstAvg = avg(solved.slice(0, 3).map((p) => p.hints));
  const lastAvg = avg(solved.slice(-3).map((p) => p.hints));
  const upgrades = brain?.changes.filter((c) => c.kind !== 'note') ?? [];

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Nudge's brain" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.kicker}>FOR PARENTS</Text>
            <Text style={styles.title}>How Nudge is learning to teach {name}</Text>
            <Text style={styles.sub}>After every session Nudge reviews what happened and rewrites its own teaching playbook.</Text>
          </View>
          <Mascot mood="pebble" size={84} />
        </View>

        <View style={styles.toggle}>
          {(
            [
              ['parent', '👪  Parent view'],
              ['tech', '⚙️  Under the hood'],
            ] as const
          ).map(([k, label]) => (
            <Pressable key={k} onPress={() => setView(k)} style={[styles.toggleBtn, view === k && styles.toggleOn]} accessibilityRole="button">
              <Text style={[styles.toggleText, view === k && styles.toggleTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {error && <ErrorBox message={error} onRetry={load} />}
        {!ready && !error && <Loading label="Opening my brain…" />}

        {ready && view === 'tech' && (sys ? <TechView sys={sys} brain={brain!} width={cardW} /> : <Text style={styles.empty}>The server does not expose /system yet.</Text>)}

        {ready && view === 'parent' && (
          <>
            {/* headline numbers */}
            <View style={styles.tiles}>
              <Tile value={`${solved.length}`} label="problems solved" sub={`${ins!.sessions} sessions`} />
              <Tile
                value={solved.length >= 4 ? `${firstAvg.toFixed(1)} → ${lastAvg.toFixed(1)}` : avg(solved.map((p) => p.hints)).toFixed(1)}
                label="hints per problem"
                sub={solved.length >= 4 ? 'first 3 vs last 3' : 'average so far'}
                good={solved.length >= 4 && lastAvg < firstAvg}
              />
              <Tile value={`${upgrades.length}`} label="self-upgrades" sub={`${brain!.skills.length} skills · ${brain!.recipes.length} visuals`} accent={CHART.upgrade} />
              <Tile value={`${ins!.leaksBlocked}`} label="answers kept secret" sub="replies rewritten so the answer never slipped out" />
            </View>

            {/* chart: hints over time, with upgrade markers */}
            <Card title="Fewer hints needed over time" sub="Hints Nudge needed per problem (faint dots), smoothed. Purple marks are moments it rewrote its own skills.">
              <HintsChart problems={ins!.problems} changes={brain!.changes} width={cardW} />
              <View style={styles.legend}>
                <Legend color={CHART.series} label="avg of last 3 problems" />
                <Legend color={CHART.axis} label="trend" dashed />
                <Legend color={CHART.upgrade} label="Nudge rewrote its skills" />
              </View>
            </Card>

            {/* what it changed in itself */}
            <Card title="What Nudge changed in itself" sub="Every change it made to its own teaching, and why.">
              <UpgradeTimeline changes={brain!.changes} width={cardW} />
              <View style={[styles.legend, { marginBottom: 6 }]}>
                <Legend color={CHART.upgrade} label="new skill" />
                <Legend color={CHART.series} label="rewrote skill" />
                <Legend color={CHART.recipe} label="saved visual" />
              </View>
              {upgrades.length === 0 && <Text style={styles.empty}>No upgrades yet. They appear after the first finished session.</Text>}
              {upgrades.slice(0, 6).map((c, i) => (
                <View key={i} style={[styles.change, i > 0 && styles.divider]}>
                  <View style={styles.changeHead}>
                    <View style={[styles.dot, { backgroundColor: CHANGE[c.kind].color }]} />
                    <Text style={[styles.changeKind, { color: CHANGE[c.kind].color }]}>{CHANGE[c.kind].label.toUpperCase()}</Text>
                    <Text style={styles.when}>{ago(c.ts)}</Text>
                  </View>
                  <Text style={styles.changeTitle}>{c.title}</Text>
                  <Text style={styles.why}>
                    <Text style={styles.whyLabel}>Why: </Text>
                    {c.why}
                  </Text>
                  {(c.before || c.after) && (
                    <View style={styles.diffBox}>
                      <SkillDiff before={c.before} after={c.after} />
                    </View>
                  )}
                </View>
              ))}
            </Card>

            {/* what helps */}
            <Card title={`What helps ${name}`} sub="Share of each kind of hint that led to progress within two turns.">
              <StyleBars styles={ins!.styles} />
            </Card>

            {/* the skills themselves */}
            <Card title="Skills Nudge wrote for itself" sub="Its own playbook, read before every session.">
              {brain!.skills.length === 0 && <Text style={styles.empty}>None yet.</Text>}
              {brain!.skills.map((s, i) => {
                const open = openSkill === s.id;
                const t = s.topic === 'any' ? null : TOPIC[s.topic];
                return (
                  <Pressable key={s.id} onPress={() => setOpenSkill(open ? null : s.id)} style={[styles.skill, i > 0 && styles.divider]}>
                    <View style={styles.changeHead}>
                      <Text style={{ fontSize: 18 }}>{t?.emoji ?? '🧠'}</Text>
                      <Text style={[styles.changeTitle, { flex: 1 }]} numberOfLines={open ? undefined : 1}>
                        {s.title}
                      </Text>
                      <View style={styles.version}>
                        <Text style={styles.versionText}>v{s.version}</Text>
                      </View>
                      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={CHART.axis} />
                    </View>
                    {open && (
                      <View style={{ gap: 4, marginTop: 6 }}>
                        <Text style={styles.why}>Use when: {s.whenToUse}</Text>
                        {s.body
                          .split('\n')
                          .map((l) => l.replace(/^[-*•]\s*/, '').trim())
                          .filter(Boolean)
                          .map((l, k) => (
                            <Text key={k} style={styles.bullet}>
                              • {l}
                            </Text>
                          ))}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </Card>

            {/* memory */}
            <Card title={`What Nudge knows about ${name}`}>
              {learned!.memory.length === 0 && <Text style={styles.empty}>Nothing yet.</Text>}
              <View style={styles.notes}>
                {learned!.memory.slice(0, 12).map((n) => (
                  <View key={n.id} style={styles.note}>
                    <Text style={styles.noteKind}>
                      {KIND[n.kind]?.icon} {KIND[n.kind]?.label}
                    </Text>
                    <Text style={styles.noteText}>{n.text}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {brain!.recipes.length > 0 && (
              <Card title="Visuals Nudge saved" sub="Pictures that worked, reused on similar problems.">
                {brain!.recipes.slice(0, 3).map((r) => (
                  <View key={r.id} style={{ gap: 6, marginBottom: 10 }}>
                    <Text style={styles.why}>
                      {r.title} · used {r.uses}×
                    </Text>
                    <GenUIRenderer spec={r.scene} maxWidth={cardW} readOnly />
                  </View>
                ))}
              </Card>
            )}

            {plan && (
              <Card title="Plan for next time">
                {plan.changes.map((c, i) => (
                  <Text key={i} style={styles.bullet}>
                    • {c}
                  </Text>
                ))}
                {plan.nextLessonId && (
                  <Text style={styles.bullet}>• Next lesson: {curriculum?.lessons.find((l) => l.id === plan.nextLessonId)?.title ?? plan.nextLessonId}</Text>
                )}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Tile({ value, label, sub, good, accent }: { value: string; label: string; sub?: string; good?: boolean; accent?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, accent ? { color: accent } : null, good ? { color: colors.greenDark } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {sub ? (
        <Text style={styles.tileSub} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 14, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  toggleOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  toggleText: { fontFamily: ff.black, fontSize: 13, color: '#9A9A9A' },
  toggleTextOn: { color: colors.ink },
  scroll: { padding: 16, gap: 14, paddingBottom: 40, backgroundColor: '#FAFAF9' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kicker: { fontFamily: ff.black, fontSize: 11, letterSpacing: 1.2, color: CHART.upgrade },
  title: { fontFamily: ff.display, fontSize: 24, color: colors.ink, lineHeight: 29 },
  sub: { fontFamily: ff.regular, fontSize: 14, color: colors.inkSoft, lineHeight: 19 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#ECECEC', padding: 12, gap: 1 },
  tileValue: { fontFamily: ff.display, fontSize: 26, color: colors.ink },
  tileLabel: { fontFamily: ff.black, fontSize: 13, color: colors.ink },
  tileSub: { fontFamily: ff.regular, fontSize: 11, color: colors.inkSoft, lineHeight: 15 },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5, borderColor: '#ECECEC', padding: 16 },
  cardTitle: { fontFamily: ff.black, fontSize: 17, color: colors.ink },
  cardSub: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 4, borderRadius: 2, borderWidth: 1.5 },
  legendText: { fontFamily: ff.bold, fontSize: 12, color: colors.inkSoft },
  empty: { fontFamily: ff.regular, fontSize: 14, color: colors.inkSoft },
  change: { paddingVertical: 10, gap: 4 },
  divider: { borderTopWidth: 1.5, borderTopColor: '#F0F0F0' },
  changeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  changeKind: { flex: 1, fontFamily: ff.black, fontSize: 11, letterSpacing: 0.8 },
  when: { fontFamily: ff.bold, fontSize: 11, color: CHART.axis },
  changeTitle: { fontFamily: ff.black, fontSize: 15, color: colors.ink },
  why: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  whyLabel: { fontFamily: ff.black, color: colors.ink },
  diffBox: { marginTop: 6, backgroundColor: '#FAFAFA', borderRadius: 10, padding: 6 },
  skill: { paddingVertical: 10 },
  version: { backgroundColor: '#F1ECFB', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  versionText: { fontFamily: ff.black, fontSize: 12, color: CHART.upgrade },
  bullet: { fontFamily: ff.regular, fontSize: 14, color: colors.ink, lineHeight: 20 },
  notes: { gap: 8 },
  note: { gap: 1 },
  noteKind: { fontFamily: ff.black, fontSize: 11, color: colors.inkSoft, letterSpacing: 0.6 },
  noteText: { fontFamily: ff.bold, fontSize: 14, color: colors.ink, lineHeight: 19 },
});
