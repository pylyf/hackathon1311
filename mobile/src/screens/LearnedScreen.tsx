// "Nudge's brain": what the agent knows about the child, the skills it wrote for itself,
// the visual recipes it invented, and a changelog of how it improved.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errMsg } from '../api';
import type { BrainChange, BrainResponse, Curriculum, HintStyle, LearnedResponse, MemoryNote, SessionEndResponse, Skill, Topic } from '../contract';
import { TracePanel } from '../trace';
import { Icon, TOPIC } from '../game';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { colors, ff, font } from '../theme';
import { ErrorBox, Loading, Mascot, SpeechBubble, BubbleText, TopBar } from '../ui';

type Tab = 'you' | 'skills' | 'visuals' | 'changes';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'you', label: 'You', icon: 'account-heart' },
  { key: 'skills', label: 'Skills', icon: 'brain' },
  { key: 'visuals', label: 'Visuals', icon: 'palette' },
  { key: 'changes', label: 'Changes', icon: 'history' },
];

const STYLES: HintStyle[] = ['verbal', 'visual', 'story', 'smaller-numbers'];
const STYLE_LABEL: Record<HintStyle, string> = { verbal: '💬 Talking', visual: '🎨 Pictures', story: '📖 Stories', 'smaller-numbers': '🔢 Small numbers' };
const STYLE_COLORS: Record<HintStyle, string> = { verbal: colors.blue, visual: colors.green, story: colors.purple, 'smaller-numbers': colors.primary };
const KIND: Record<MemoryNote['kind'], { icon: string; label: string; color: string }> = {
  misconception: { icon: '🤔', label: 'Tricky for you', color: colors.red },
  works: { icon: '✅', label: 'Works for you', color: colors.green },
  'doesnt-work': { icon: '🚫', label: "Doesn't help", color: colors.inkSoft },
  interest: { icon: '⭐', label: 'You love', color: colors.yellowDark },
  mastered: { icon: '🏆', label: 'Mastered', color: colors.purple },
};
const CHANGE_ICON: Record<BrainChange['kind'], { icon: string; color: string; verb: string }> = {
  'skill-created': { icon: 'creation', color: colors.purple, verb: 'Wrote a new skill' },
  'skill-updated': { icon: 'pencil', color: colors.blue, verb: 'Improved a skill' },
  'recipe-created': { icon: 'palette', color: colors.green, verb: 'Invented a visual' },
  note: { icon: 'note-text', color: colors.inkSoft, verb: 'Noted' },
};

type Plan = NonNullable<SessionEndResponse['plan']>;

/** What the planner agent decided for next time (lessons / warm-up from the textbook curriculum). */
function PlanCard({ plan, curriculum }: { plan: Plan; curriculum: Curriculum | null }) {
  const next = plan.nextLessonId ? curriculum?.lessons.find((l) => l.id === plan.nextLessonId) : null;
  return (
    <View style={styles.plan}>
      <Text style={styles.planTitle}>🗓️ Plan for next time</Text>
      {plan.changes.map((c, i) => (
        <Text key={i} style={styles.planLine}>
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
  changes: fresh,
  plan,
  curriculum,
  onBack,
}: {
  newNotes?: MemoryNote[];
  changes?: BrainChange[];
  plan?: Plan;
  curriculum?: Curriculum | null;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>(fresh?.length ? 'changes' : 'you');
  const [learned, setLearned] = useState<LearnedResponse | null>(null);
  const [brain, setBrain] = useState<BrainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, b] = await Promise.all([api.learned(), api.brain()]);
      setLearned(l);
      setBrain(b);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const headline = fresh?.length
    ? `I just improved myself ${fresh.length} way${fresh.length > 1 ? 's' : ''}! Look!`
    : newNotes?.length
      ? 'I learned new things about you today!'
      : 'This is my brain. I rewrite it after every session to teach you better!';

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Nudge's brain" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Mascot mood={fresh?.length ? 'excited' : 'love'} size={96} />
          <SpeechBubble style={{ flex: 1 }}>
            <BubbleText>{headline}</BubbleText>
          </SpeechBubble>
        </View>

        {plan && <PlanCard plan={plan} curriculum={curriculum ?? null} />}

        {brain && learned && (
          <View style={styles.counts}>
            <Count n={learned.memory.length} label="things about you" color={colors.yellowDark} icon="account-heart" />
            <Count n={brain.skills.length} label="skills I wrote" color={colors.purple} icon="brain" />
            <Count n={brain.recipes.length} label="visuals I made" color={colors.green} icon="palette" />
          </View>
        )}

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, on && styles.tabOn]}>
                <Icon name={t.icon as never} size={18} color={on ? '#fff' : colors.inkSoft} />
                <Text style={[styles.tabText, on && { color: '#fff' }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error && <ErrorBox message={error} onRetry={load} />}
        {(!learned || !brain) && !error && <Loading label="Opening my brain…" />}

        {learned && brain && tab === 'you' && <AboutYou learned={learned} newNotes={newNotes} />}
        {brain && tab === 'skills' && <Skills skills={brain.skills} />}
        {brain && tab === 'visuals' && <Visuals brain={brain} />}
        {brain && tab === 'changes' && <Changes changes={brain.changes} freshCount={fresh?.length ?? 0} />}
      </ScrollView>
    </View>
  );
}

function Count({ n, label, color, icon }: { n: number; label: string; color: string; icon: string }) {
  return (
    <View style={[styles.count, { borderColor: color }]}>
      <Icon name={icon as never} size={20} color={color} />
      <Text style={[styles.countNum, { color }]}>{n}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Mascot mood="sleepy" size={110} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- tabs

function AboutYou({ learned, newNotes }: { learned: LearnedResponse; newNotes?: MemoryNote[] }) {
  const freshIds = new Set((newNotes ?? []).map((n) => n.id));
  const byKind = (Object.keys(KIND) as MemoryNote['kind'][]).map((k) => ({ k, notes: learned.memory.filter((n) => n.kind === k) })).filter((g) => g.notes.length);
  return (
    <View style={{ gap: 14 }}>
      {byKind.length === 0 && <Empty text="I don't know much about you yet. Solve a problem with me!" />}
      {byKind.map(({ k, notes }) => (
        <View key={k} style={styles.noteGroup}>
          <Text style={[styles.groupTitle, { color: KIND[k].color }]}>
            {KIND[k].icon} {KIND[k].label.toUpperCase()}
          </Text>
          {notes.map((n, i) => (
            <SlideIn key={n.id} delay={i * 60}>
              <View style={[styles.note, freshIds.has(n.id) && styles.noteNew]}>
                <Text style={styles.noteText}>{n.text}</Text>
                <View style={styles.noteMeta}>
                  {n.topic !== 'any' && <Text style={[styles.topicChip, { color: TOPIC[n.topic].dark, backgroundColor: TOPIC[n.topic].light }]}>{TOPIC[n.topic].label}</Text>}
                  {n.seen > 1 && <Text style={styles.seen}>seen {n.seen}×</Text>}
                  {freshIds.has(n.id) && <Text style={styles.newTag}>NEW</Text>}
                </View>
              </View>
            </SlideIn>
          ))}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.h3}>Which hints help you most</Text>
        {(Object.keys(learned.bandit) as Topic[]).map((topic) => {
          const arms = learned.bandit[topic];
          if (!arms) return null;
          return (
            <View key={topic} style={{ gap: 6, marginTop: 10 }}>
              <Text style={[styles.topicChip, { color: TOPIC[topic].dark, backgroundColor: TOPIC[topic].light }]}>
                {TOPIC[topic].emoji} {TOPIC[topic].label}
              </Text>
              {STYLES.map((s) => {
                const [a, b] = arms[s] ?? [1, 1];
                const rate = a / Math.max(1e-9, a + b);
                return (
                  <View key={s} style={styles.barRow}>
                    <Text style={styles.barLabel}>{STYLE_LABEL[s]}</Text>
                    <View style={styles.barTrack}>
                      <GrowWidth pct={rate} color={STYLE_COLORS[s]} />
                    </View>
                    <Text style={styles.barPct}>{Math.round(rate * 100)}%</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Skills({ skills }: { skills: Skill[] }) {
  if (!skills.length) return <Empty text="I haven't written any skills yet. After our first session I'll write my own teaching playbook for you!" />;
  return (
    <View style={{ gap: 12 }}>
      {skills.map((s, i) => {
        const t = s.topic === 'any' ? null : TOPIC[s.topic];
        return (
          <SlideIn key={s.id} delay={i * 80}>
            <View style={[styles.skill, { borderLeftColor: t?.color ?? colors.purple }]}>
              <View style={styles.skillHead}>
                <Text style={styles.skillIcon}>{t?.emoji ?? '🧠'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.skillTitle}>{s.title}</Text>
                  <Text style={styles.skillWhen}>Use when: {s.whenToUse}</Text>
                </View>
                <View style={styles.version}>
                  <Text style={styles.versionText}>v{s.version}</Text>
                </View>
              </View>
              <View style={styles.skillBody}>
                {s.body
                  .split('\n')
                  .map((l) => l.replace(/^[-*•]\s*/, '').trim())
                  .filter(Boolean)
                  .map((l, k) => (
                    <View key={k} style={styles.bullet}>
                      <View style={[styles.bulletDot, { backgroundColor: t?.color ?? colors.purple }]} />
                      <Text style={styles.bulletText}>{l}</Text>
                    </View>
                  ))}
              </View>
              <Text style={styles.updated}>Updated {ago(s.updatedAt)}</Text>
            </View>
          </SlideIn>
        );
      })}
    </View>
  );
}

function Visuals({ brain }: { brain: BrainResponse }) {
  if (!brain.recipes.length) return <Empty text="When a picture really helps you, I save it here as a recipe and reuse it next time." />;
  return (
    <View style={{ gap: 16 }}>
      {brain.recipes.map((r) => (
        <View key={r.id} style={{ gap: 6 }}>
          <View style={styles.recipeHead}>
            <Text style={styles.recipeTitle}>{r.title}</Text>
            <Text style={styles.seen}>used {r.uses}×</Text>
          </View>
          <Text style={styles.skillWhen}>Use when: {r.whenToUse}</Text>
          <GenUIRenderer spec={r.scene} maxWidth={480} />
        </View>
      ))}
    </View>
  );
}

function Changes({ changes, freshCount }: { changes: BrainChange[]; freshCount: number }) {
  if (!changes.length) return <Empty text="Nothing changed yet. Finish a session and watch me upgrade myself!" />;
  return (
    <View style={{ gap: 0 }}>
      {changes.map((c, i) => {
        const m = CHANGE_ICON[c.kind];
        return (
          <SlideIn key={i} delay={i * 70}>
            <View style={styles.change}>
              <View style={styles.timeline}>
                <View style={[styles.changeDot, { backgroundColor: m.color }]}>
                  <Icon name={m.icon as never} size={16} color="#fff" />
                </View>
                {i < changes.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={[styles.changeCard, i < freshCount && styles.noteNew]}>
                <Text style={[styles.changeVerb, { color: m.color }]}>{m.verb.toUpperCase()}</Text>
                <Text style={styles.changeTitle}>{c.title}</Text>
                <Text style={styles.changeWhy}>{c.why}</Text>
                <Text style={styles.updated}>{ago(c.ts)}</Text>
              </View>
            </View>
          </SlideIn>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- motion helpers

function SlideIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>{children}</Animated.View>;
}

function GrowWidth({ pct, color }: { pct: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: pct, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v, pct]);
  return <Animated.View style={{ height: '100%', borderRadius: 8, backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />;
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plan: { gap: 6, backgroundColor: colors.greenLight, borderRadius: 18, padding: 14, borderWidth: 2, borderColor: '#BDEBD1' },
  planTitle: { fontFamily: ff.black, fontSize: font.body, color: colors.greenDark },
  planLine: { fontFamily: ff.regular, fontSize: 15, color: colors.ink, lineHeight: 22 },
  bold: { fontFamily: ff.black },
  counts: { flexDirection: 'row', gap: 8 },
  count: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 10, alignItems: 'center', gap: 2, borderBottomWidth: 4 },
  countNum: { fontFamily: ff.display, fontSize: 26 },
  countLabel: { fontFamily: ff.bold, fontSize: 11, color: colors.inkSoft, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: colors.track, borderRadius: 16, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 12 },
  tabOn: { backgroundColor: colors.ink },
  tabText: { fontFamily: ff.black, fontSize: 12, color: colors.inkSoft },
  empty: { alignItems: 'center', gap: 8, padding: 20 },
  emptyText: { fontFamily: ff.bold, fontSize: font.body, color: colors.inkSoft, textAlign: 'center', lineHeight: 25 },
  noteGroup: { gap: 8 },
  groupTitle: { fontFamily: ff.black, fontSize: 13, letterSpacing: 1 },
  note: { borderWidth: 2, borderColor: colors.line, borderRadius: 14, padding: 12, gap: 6 },
  noteNew: { borderColor: colors.yellow, backgroundColor: colors.yellowLight },
  noteText: { fontFamily: ff.bold, fontSize: font.body - 1, color: colors.ink, lineHeight: 23 },
  noteMeta: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  topicChip: { alignSelf: 'flex-start', fontFamily: ff.black, fontSize: 11, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  seen: { fontFamily: ff.bold, fontSize: 12, color: colors.trackText },
  newTag: { fontFamily: ff.black, fontSize: 11, color: '#fff', backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 6, overflow: 'hidden' },
  card: { borderWidth: 2, borderColor: colors.line, borderBottomWidth: 4, borderRadius: 16, padding: 14 },
  h3: { fontFamily: ff.display, fontSize: 20, color: colors.ink },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 128, fontFamily: ff.bold, fontSize: 14, color: colors.ink },
  barTrack: { flex: 1, height: 14, backgroundColor: colors.track, borderRadius: 8, overflow: 'hidden' },
  barPct: { width: 40, textAlign: 'right', fontFamily: ff.black, fontSize: 13, color: colors.ink },
  skill: { borderWidth: 2, borderColor: colors.line, borderLeftWidth: 8, borderRadius: 16, padding: 14, gap: 10 },
  skillHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skillIcon: { fontSize: 30 },
  skillTitle: { fontFamily: ff.black, fontSize: font.body, color: colors.ink },
  skillWhen: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft },
  version: { backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  versionText: { fontFamily: ff.black, color: '#fff', fontSize: 12 },
  skillBody: { gap: 6 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  bulletText: { flex: 1, fontFamily: ff.regular, fontSize: 15, color: colors.ink, lineHeight: 21 },
  updated: { fontFamily: ff.bold, fontSize: 11, color: colors.trackText },
  recipeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipeTitle: { fontFamily: ff.black, fontSize: font.body, color: colors.ink },
  change: { flexDirection: 'row', gap: 10 },
  timeline: { alignItems: 'center', width: 30 },
  changeDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { flex: 1, width: 3, backgroundColor: colors.line, marginVertical: 2 },
  changeCard: { flex: 1, borderWidth: 2, borderColor: colors.line, borderRadius: 14, padding: 12, gap: 3, marginBottom: 12 },
  changeVerb: { fontFamily: ff.black, fontSize: 11, letterSpacing: 1 },
  changeTitle: { fontFamily: ff.black, fontSize: font.body - 1, color: colors.ink },
  changeWhy: { fontFamily: ff.regular, fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
});
