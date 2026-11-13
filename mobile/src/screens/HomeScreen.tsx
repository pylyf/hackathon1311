import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_URL, errMsg } from '../api';
import type { Curriculum, Lesson } from '../contract';
import { colors, font } from '../theme';
import { BigButton, Card, ErrorBox } from '../ui';
import { StatusChip } from '../trace';

export function nextLesson(c: Curriculum | null): Lesson | null {
  if (!c || !c.lessons.length) return null;
  return (
    c.lessons.find((l) => l.id === c.nextLessonId) ??
    c.lessons.find((l) => l.status !== 'mastered' && l.status !== 'locked') ??
    null
  );
}

export default function HomeScreen({
  sessionError,
  onRetrySession,
  curriculum,
  onSnap,
  onLearned,
  onDemo,
  onUpload,
  onLesson,
  onCurriculum,
  onWarmup,
}: {
  sessionError: string | null;
  onRetrySession: () => void;
  curriculum: Curriculum | null;
  onSnap: () => void;
  onLearned: () => void;
  onDemo: () => void;
  onUpload: () => void;
  onLesson: (l: Lesson) => void;
  onCurriculum: () => void;
  onWarmup: () => Promise<void>;
}) {
  const [warmBusy, setWarmBusy] = useState(false);
  const [warmError, setWarmError] = useState<string | null>(null);
  const lesson = nextLesson(curriculum);
  const warmup = curriculum?.warmup ?? null;
  const hasCurriculum = !!curriculum && curriculum.lessons.length > 0;

  const startWarmup = async () => {
    setWarmBusy(true);
    setWarmError(null);
    try {
      await onWarmup();
    } catch (e) {
      setWarmError(errMsg(e));
      setWarmBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.hero, hasCurriculum && styles.heroCompact]}>
        <Text style={[styles.logo, hasCurriculum && { fontSize: 64 }]}>🦉</Text>
        <Text style={[styles.title, hasCurriculum && { fontSize: 40 }]}>Nudge</Text>
        <Text style={styles.subtitle}>Your homework buddy.{'\n'}I give hints, you find the answer!</Text>
      </View>

      {warmup && (
        <Card style={styles.warm}>
          <Text style={styles.warmTitle}>🔥 Warm-up</Text>
          <Text style={styles.warmText}>{warmup.message}</Text>
          {warmError && <Text style={styles.err}>{warmError}</Text>}
          <BigButton
            small
            label={warmBusy ? 'Getting ready…' : 'Warm up (1 min)'}
            onPress={startWarmup}
            disabled={warmBusy}
            color={colors.primaryDark}
          />
        </Card>
      )}

      {hasCurriculum && (
        <Card style={styles.today}>
          <View style={styles.todayHead}>
            <Text style={styles.todayLabel}>TODAY'S LESSON</Text>
            <Pressable onPress={onCurriculum} hitSlop={10}>
              <Text style={styles.link}>All lessons ›</Text>
            </Pressable>
          </View>
          {lesson ? (
            <>
              <Text style={styles.lessonTitle}>{lesson.title}</Text>
              <Text style={styles.lessonSummary}>{lesson.summary}</Text>
              <StatusChip status={lesson.status} />
              <BigButton label="📖  Start lesson" onPress={() => onLesson(lesson)} color={colors.green} style={{ marginTop: 6 }} />
            </>
          ) : (
            <>
              <Text style={styles.lessonTitle}>All lessons mastered! 🏆</Text>
              <Text style={styles.lessonSummary}>{curriculum!.title}</Text>
            </>
          )}
        </Card>
      )}

      <BigButton label="📸  Snap my homework" onPress={onSnap} style={hasCurriculum ? undefined : styles.snap} color={colors.primary} />
      <BigButton label="🧠  What Nudge learned" onPress={onLearned} color={colors.purple} />

      {sessionError && <ErrorBox message={sessionError} onRetry={onRetrySession} />}

      <Pressable onPress={onUpload} style={styles.parent} hitSlop={8} accessibilityRole="button">
        <Text style={styles.parentText}>📚 Add a textbook chapter</Text>
        <Text style={styles.parentSub}>for parents & teachers</Text>
      </Pressable>

      <Pressable onPress={onDemo} style={styles.demoLink} hitSlop={10}>
        <Text style={styles.demoText}>Components demo</Text>
      </Pressable>
      <Text style={styles.server}>{API_URL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 18, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 12 },
  heroCompact: { marginBottom: 0 },
  logo: { fontSize: 88 },
  title: { fontSize: 52, fontWeight: '900', color: colors.ink },
  subtitle: { fontSize: font.body, color: colors.inkSoft, textAlign: 'center', marginTop: 6, lineHeight: 27 },
  snap: { paddingVertical: 32 },
  warm: { backgroundColor: '#FFE6D9', borderWidth: 3, borderColor: colors.primary, gap: 8 },
  warmTitle: { fontSize: font.body, fontWeight: '900', color: colors.primaryDark },
  warmText: { fontSize: font.body, color: colors.ink, lineHeight: 26, fontWeight: '600' },
  err: { color: colors.red, fontSize: font.small },
  today: { gap: 8, borderWidth: 3, borderColor: colors.green },
  todayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayLabel: { fontSize: 13, fontWeight: '900', color: colors.inkSoft, letterSpacing: 1 },
  link: { color: colors.blue, fontWeight: '800', fontSize: font.small },
  lessonTitle: { fontSize: font.big, fontWeight: '900', color: colors.ink },
  lessonSummary: { fontSize: font.body - 1, color: colors.inkSoft, lineHeight: 25 },
  parent: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.inkSoft,
    borderRadius: 18,
    paddingVertical: 14,
    marginTop: 6,
  },
  parentText: { fontSize: font.body, fontWeight: '800', color: colors.ink },
  parentSub: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  demoLink: { alignSelf: 'center', marginTop: 8 },
  demoText: { color: colors.blue, fontSize: font.small, textDecorationLine: 'underline' },
  server: { color: colors.inkSoft, fontSize: 12, textAlign: 'center', opacity: 0.6 },
});
