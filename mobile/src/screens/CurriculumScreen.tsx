import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errMsg } from '../api';
import type { Curriculum, Lesson } from '../contract';
import { colors, font, radius, shadow } from '../theme';
import { BigButton, Card, ErrorBox, Loading, TopBar } from '../ui';
import { ProgressBar, StatusChip } from '../trace';

const TOPIC_ICON: Record<Lesson['topic'], string> = { fractions: '🍕', units: '📏', 'word-problems': '📝' };

export default function CurriculumScreen({
  initial,
  onBack,
  onLesson,
  onUpload,
  onLoaded,
}: {
  initial: Curriculum | null;
  onBack: () => void;
  onLesson: (l: Lesson) => void;
  onUpload: () => void;
  onLoaded: (c: Curriculum | null) => void;
}) {
  const [cur, setCur] = useState<Curriculum | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { curriculum } = await api.curriculum();
      setCur(curriculum);
      onLoaded(curriculum);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lessons = cur?.lessons ?? [];
  const overall = lessons.length ? lessons.reduce((n, l) => n + (l.mastery || 0), 0) / lessons.length : 0;
  const mastered = lessons.filter((l) => l.status === 'mastered').length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Lessons" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !cur && <Loading label="Loading lessons…" />}
        {error && !cur && <ErrorBox message={error} onRetry={load} />}
        {!loading && !cur && !error && (
          <Card style={{ gap: 12, alignItems: 'center' }}>
            <Text style={styles.h1}>No chapter yet</Text>
            <Text style={styles.meta}>Upload a textbook chapter and Nudge will build lessons from it.</Text>
            <BigButton small label="📚 Add a textbook chapter" onPress={onUpload} />
          </Card>
        )}

        {cur && (
          <>
            <Card style={styles.header}>
              <Text style={styles.h1}>{cur.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                From: {cur.source} · {lessons.length} lessons
              </Text>
              <View style={styles.progressRow}>
                <ProgressBar value={overall} />
                <Text style={styles.pct}>{Math.round(overall * 100)}%</Text>
              </View>
              <Text style={styles.meta}>
                {mastered}/{lessons.length} mastered
              </Text>
            </Card>

            {lessons.map((l, i) => {
              const locked = l.status === 'locked';
              const isNext = l.id === cur.nextLessonId;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => !locked && onLesson(l)}
                  disabled={locked}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.lesson,
                    shadow,
                    isNext && styles.lessonNext,
                    locked && { opacity: 0.55 },
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <View style={styles.num}>
                    <Text style={styles.numText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.lessonTitle}>
                        {TOPIC_ICON[l.topic] ?? '📘'} {l.title}
                      </Text>
                    </View>
                    <Text style={styles.summary} numberOfLines={2}>
                      {l.summary}
                    </Text>
                    <View style={styles.chipRow}>
                      <StatusChip status={l.status} />
                      {isNext && <Text style={styles.nextTag}>▶ next up</Text>}
                      <Text style={styles.small}>
                        {l.problems.length} problems{l.sourcePages ? ` · ${l.sourcePages}` : ''}
                      </Text>
                    </View>
                    <View style={styles.progressRow}>
                      <ProgressBar value={l.mastery} color={l.status === 'review' ? colors.yellow : colors.green} />
                      <Text style={styles.small}>{Math.round((l.mastery || 0) * 100)}%</Text>
                    </View>
                  </View>
                  {!locked && <Text style={styles.chev}>›</Text>}
                </Pressable>
              );
            })}

            {error && <ErrorBox message={error} onRetry={load} />}
            <View style={styles.row}>
              <BigButton small label="↻ Refresh" onPress={load} color={colors.blue} style={{ flex: 1 }} />
              <BigButton small label="📚 New chapter" onPress={onUpload} color={colors.purple} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  header: { gap: 6 },
  h1: { fontSize: font.big, fontWeight: '900', color: colors.ink },
  meta: { fontSize: font.small, color: colors.inkSoft },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pct: { fontSize: font.small, fontWeight: '800', color: colors.ink, width: 44, textAlign: 'right' },
  lesson: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  lessonNext: { borderColor: colors.primary },
  num: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF1C9', alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: font.body, fontWeight: '900', color: colors.ink },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lessonTitle: { fontSize: font.body, fontWeight: '800', color: colors.ink, flex: 1 },
  summary: { fontSize: font.small, color: colors.inkSoft, lineHeight: 20 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nextTag: { fontSize: 12, fontWeight: '900', color: colors.primary },
  small: { fontSize: 12, color: colors.inkSoft },
  chev: { fontSize: 32, color: colors.inkSoft },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
