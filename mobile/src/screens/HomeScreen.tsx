import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errMsg } from '../api';
import type { ChildProfile, Curriculum, Lesson, ProgressResponse } from '../contract';
import { EXAMPLES, type Example } from '../examples';
import { Bounce, Icon, StatChip } from '../game';
import { colors, ff, font } from '../theme';
import { BigButton, BubbleText, ErrorBox, Mascot, ProgressBar, SpeechBubble } from '../ui';

export function nextLesson(c: Curriculum | null): Lesson | null {
  if (!c || !c.lessons.length) return null;
  return (
    c.lessons.find((l) => l.id === c.nextLessonId) ??
    c.lessons.find((l) => l.status !== 'mastered' && l.status !== 'locked') ??
    null
  );
}

export default function HomeScreen({
  profile,
  curriculum,
  onUpload,
  onLesson,
  onCurriculum,
  onWarmup,
  sessionError,
  onRetrySession,
  onSnap,
  onExample,
  onLearned,
  onDemo,
  onRedoIntro,
}: {
  profile: ChildProfile | null;
  curriculum: Curriculum | null;
  onUpload: () => void;
  onLesson: (l: Lesson) => void;
  onCurriculum: () => void;
  onWarmup: () => Promise<void>;
  sessionError: string | null;
  onRetrySession: () => void;
  onSnap: () => void;
  onExample: (e: Example) => void;
  onLearned: () => void;
  onDemo: () => void;
  onRedoIntro: () => void;
}) {
  const [p, setP] = useState<ProgressResponse | null>(null);
  useEffect(() => {
    api.progress().then(setP).catch(() => {});
  }, []);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lesson = nextLesson(curriculum);
  const warmup = curriculum?.warmup ?? null;
  const startWarmup = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onWarmup();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  const name = profile?.name?.split(' ')[0];
  // an example that matches the child's interests
  const likes = (profile?.interests ?? []).map((x) => x.toLowerCase());
  const pickExample = () => {
    const liked = EXAMPLES.filter((e) => score(e, likes) > 0);
    const pool = liked.length ? liked : EXAMPLES;
    onExample(pool[Math.floor(Math.random() * pool.length)]);
  };

  // "Continue" = the warm-up, else the next textbook lesson, else a fun example
  const upNext = warmup
    ? { label: 'Quick warm-up', onPress: startWarmup }
    : lesson
      ? { label: lesson.title, onPress: () => onLesson(lesson) }
      : { label: 'A fun problem to try', onPress: async () => pickExample() };
  const lessons = curriculum?.lessons ?? [];
  const mastered = lessons.filter((l) => l.status === 'mastered').length;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.statsRow}>
        <StatChip emoji="🔥" value={p?.streak ?? 0} color={colors.primary} />
        <StatChip emoji="🪨" value={p?.pebbles ?? 0} color={colors.otter} />
        <View style={{ flex: 1 }} />
        <Pressable onPress={onLearned} style={styles.brainBtn} hitSlop={8} accessibilityLabel="Nudge's brain">
          <Text style={{ fontSize: 20 }}>🧠</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <SpeechBubble tail="down">
            <BubbleText style={styles.hi}>
              {name ? (
                <>
                  Hi <Text style={styles.strong}>{name}</Text>! What are we solving today?
                </>
              ) : (
                'Hi! What are we solving today?'
              )}
            </BubbleText>
          </SpeechBubble>
          <Bounce distance={6}>
            <Mascot mood="hello" size={160} />
          </Bounce>
        </View>

        {curriculum && lessons.length > 0 && (
          <Pressable onPress={onCurriculum}>
            {({ pressed }) => (
              <View style={[styles.course, { borderBottomWidth: pressed ? 2 : 4, marginTop: pressed ? 2 : 0 }]}>
                <View style={styles.courseIcon}>
                  <Text style={{ fontSize: 24 }}>📚</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.courseKicker}>MY COURSE</Text>
                  <Text style={styles.courseTitle} numberOfLines={1}>
                    {curriculum.title}
                  </Text>
                  <ProgressBar value={lessons.length ? mastered / lessons.length : 0} color={colors.green} style={{ height: 10 }} />
                  <Text style={styles.courseSub}>
                    {mastered} of {lessons.length} lessons mastered
                  </Text>
                </View>
                <Icon name="chevron-right" size={28} color={colors.trackText} />
              </View>
            )}
          </Pressable>
        )}
        {err && <Text style={styles.err}>{err}</Text>}
        {sessionError && <ErrorBox message={sessionError} onRetry={onRetrySession} />}
      </ScrollView>

      <View style={styles.bottom}>
        <Text style={styles.upNext} numberOfLines={1}>
          Up next: <Text style={styles.upNextStrong}>{busy ? 'getting ready…' : upNext.label}</Text>
        </Text>
        <BigButton label={busy ? 'Getting ready…' : 'Continue'} onPress={upNext.onPress} disabled={busy} />
        <BigButton label="Snap new homework" icon="📸" onPress={onSnap} variant="outline" color={colors.primary} />
        <BigButton label="Add new material" icon="📚" onPress={onUpload} variant="outline" color={colors.blue} />
        <View style={styles.links}>
          {curriculum && (
            <>
              <Pressable onPress={onCurriculum} hitSlop={10}>
                <Text style={styles.link}>Courses</Text>
              </Pressable>
              <Text style={styles.dot}>·</Text>
            </>
          )}
          <Pressable onPress={pickExample} hitSlop={10}>
            <Text style={styles.link}>Examples</Text>
          </Pressable>
          <Text style={styles.dot}>·</Text>
          <Pressable onPress={onDemo} hitSlop={10}>
            <Text style={styles.link}>Visuals</Text>
          </Pressable>
          <Text style={styles.dot}>·</Text>
          <Pressable onPress={onRedoIntro} hitSlop={10}>
            <Text style={styles.link}>Redo intro</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function score(e: Example, likes: string[]): number {
  const hay = `${e.title} ${e.text}`.toLowerCase();
  return likes.some((l) => hay.includes(l.replace(/s$/, ''))) ? 1 : 0;
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingVertical: 10 },
  brainBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 14 },
  hero: { alignItems: 'center', gap: 6 },
  hi: { fontSize: font.big - 2, lineHeight: 28, textAlign: 'center' },
  strong: { fontFamily: ff.black, color: colors.primary },
  course: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: colors.line, borderRadius: 18, padding: 12 },
  courseIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  courseKicker: { fontFamily: ff.black, fontSize: 11, letterSpacing: 1, color: colors.greenDark },
  courseTitle: { fontFamily: ff.black, fontSize: font.body - 1, color: colors.ink },
  courseSub: { fontFamily: ff.bold, fontSize: 12, color: colors.inkSoft },
  upNext: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  upNextStrong: { fontFamily: ff.black, color: colors.ink },
  err: { fontFamily: ff.bold, color: colors.red, fontSize: 13, textAlign: 'center' },
  bottom: { paddingHorizontal: 16, paddingBottom: 18, gap: 8 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  link: { color: colors.inkSoft, fontSize: 14, fontFamily: ff.bold },
  dot: { color: colors.trackText },
});
