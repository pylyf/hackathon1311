import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_URL, api } from '../api';
import type { BrainResponse, ChildProfile, ProgressResponse } from '../contract';
import { EXAMPLES, type Example } from '../examples';
import { Bounce, Icon, Pop, StatChip, TOPIC } from '../game';
import { colors, ff, font } from '../theme';
import { BigButton, BubbleText, ErrorBox, Mascot, SpeechBubble } from '../ui';

export default function HomeScreen({
  profile,
  sessionError,
  onRetrySession,
  onSnap,
  onExample,
  onLearned,
  onDemo,
  onRedoIntro,
}: {
  profile: ChildProfile | null;
  sessionError: string | null;
  onRetrySession: () => void;
  onSnap: () => void;
  onExample: (e: Example) => void;
  onLearned: () => void;
  onDemo: () => void;
  onRedoIntro: () => void;
}) {
  const [p, setP] = useState<ProgressResponse | null>(null);
  const [brain, setBrain] = useState<BrainResponse | null>(null);
  const load = useCallback(() => {
    api.progress().then(setP).catch(() => {});
    api.brain().then(setBrain).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const name = profile?.name?.split(' ')[0];
  const latest = brain?.changes[0];
  // put examples matching the child's interests first
  const likes = (profile?.interests ?? []).map((x) => x.toLowerCase());
  const examples = [...EXAMPLES].sort((a, b) => score(b, likes) - score(a, likes));

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.statsRow}>
        <StatChip emoji="🔥" value={p?.streak ?? 0} color={colors.primary} />
        <StatChip emoji="🪨" value={p?.pebbles ?? 0} color={colors.otter} />
        <View style={{ flex: 1 }} />
        <Pressable onPress={onLearned} style={styles.brainBtn} hitSlop={8}>
          <Text style={{ fontSize: 18 }}>🧠</Text>
          <Text style={styles.brainBtnText}>BRAIN</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <SpeechBubble tail="down">
            <BubbleText style={styles.hi}>
              {name ? (
                <>
                  Hi <Text style={styles.strong}>{name}</Text>! Show me a problem you're stuck on 👇
                </>
              ) : (
                "Hi! Show me a problem you're stuck on 👇"
              )}
            </BubbleText>
          </SpeechBubble>
          <Bounce distance={8}>
            <Mascot mood="hello" size={190} />
          </Bounce>
        </View>

        <BigButton label="Snap my homework" icon="📸" onPress={onSnap} />

        {sessionError && <ErrorBox message={sessionError} onRetry={onRetrySession} />}

        <View style={styles.sectionHead}>
          <Text style={styles.h2}>No homework? Try one!</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exRow}>
          {examples.map((ex, i) => (
            <Pop key={ex.id} delay={i * 70}>
              <Pressable onPress={() => onExample(ex)}>
                {({ pressed }) => (
                  <View style={[styles.exCard, { backgroundColor: ex.bg, borderBottomWidth: pressed ? 2 : 5, marginTop: pressed ? 3 : 0 }]}>
                    <Bounce distance={4}>
                      <Text style={styles.exEmoji}>{ex.emoji}</Text>
                    </Bounce>
                    <Text style={styles.exTitle} numberOfLines={2}>
                      {ex.title}
                    </Text>
                    <Text style={[styles.exTopic, { color: TOPIC[ex.topic].dark }]}>{TOPIC[ex.topic].label.toUpperCase()}</Text>
                  </View>
                )}
              </Pressable>
            </Pop>
          ))}
        </ScrollView>

        <Pressable onPress={onLearned}>
          {({ pressed }) => (
            <View style={[styles.brainCard, { borderBottomWidth: pressed ? 2 : 6, marginTop: pressed ? 4 : 0 }]}>
              <View style={styles.brainTop}>
                <Bounce distance={3}>
                  <Text style={{ fontSize: 40 }}>🧠</Text>
                </Bounce>
                <View style={{ flex: 1 }}>
                  <Text style={styles.brainKicker}>NUDGE'S BRAIN</Text>
                  <Text style={styles.brainTitle}>I teach myself to teach you</Text>
                </View>
                <Icon name="chevron-right" size={28} color="rgba(255,255,255,0.7)" />
              </View>
              <View style={styles.brainStats}>
                <BrainStat n={brain?.skills.length ?? 0} label="skills" />
                <BrainStat n={brain?.recipes.length ?? 0} label="visuals" />
                <BrainStat n={brain?.changes.length ?? 0} label="upgrades" />
              </View>
              {latest && (
                <View style={styles.latest}>
                  <Icon name="creation" size={16} color={colors.yellow} />
                  <Text style={styles.latestText} numberOfLines={2}>
                    Latest: {latest.title}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Pressable>

        <View style={styles.links}>
          <Pressable onPress={onDemo} hitSlop={10}>
            <Text style={styles.link}>All visuals</Text>
          </Pressable>
          <Text style={styles.dot}>·</Text>
          <Pressable onPress={onRedoIntro} hitSlop={10}>
            <Text style={styles.link}>Redo intro</Text>
          </Pressable>
        </View>
        <Text style={styles.server}>{API_URL}</Text>
      </ScrollView>
    </View>
  );
}

function score(e: Example, likes: string[]): number {
  const hay = `${e.title} ${e.text}`.toLowerCase();
  return likes.some((l) => hay.includes(l.replace(/s$/, ''))) ? 1 : 0;
}

function BrainStat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.brainStat}>
      <Text style={styles.brainStatNum}>{n}</Text>
      <Text style={styles.brainStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.line,
  },
  brainBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  brainBtnText: { fontFamily: ff.black, fontSize: 12, color: colors.purple, letterSpacing: 0.8 },
  scroll: { padding: 16, gap: 18, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 6 },
  hi: { fontSize: font.big - 2, lineHeight: 28, textAlign: 'center' },
  strong: { fontFamily: ff.black, color: colors.primary },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  h2: { fontFamily: ff.display, fontSize: 22, color: colors.ink },
  exRow: { gap: 10, paddingVertical: 4, paddingRight: 8 },
  exCard: { width: 130, height: 150, borderRadius: 20, padding: 12, justifyContent: 'space-between', borderBottomColor: 'rgba(0,0,0,0.12)' },
  exEmoji: { fontSize: 46 },
  exTitle: { fontFamily: ff.black, fontSize: 15, color: colors.ink, lineHeight: 19 },
  exTopic: { fontFamily: ff.black, fontSize: 10, letterSpacing: 0.8 },
  brainCard: { backgroundColor: '#3B2A6B', borderBottomColor: '#24183F', borderRadius: 22, padding: 16, gap: 12 },
  brainTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brainKicker: { fontFamily: ff.black, fontSize: 12, letterSpacing: 1, color: colors.yellow },
  brainTitle: { fontFamily: ff.display, fontSize: 20, color: '#fff' },
  brainStats: { flexDirection: 'row', gap: 8 },
  brainStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  brainStatNum: { fontFamily: ff.display, fontSize: 24, color: '#fff' },
  brainStatLabel: { fontFamily: ff.bold, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,201,60,0.15)', borderRadius: 10, padding: 8 },
  latestText: { flex: 1, fontFamily: ff.bold, fontSize: 13, color: '#FFE8A8' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  link: { color: colors.blue, fontSize: font.small, fontFamily: ff.bold },
  dot: { color: colors.inkSoft },
  server: { color: colors.trackText, fontSize: 12, textAlign: 'center', fontFamily: ff.regular },
});
