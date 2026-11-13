import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errMsg } from '../api';
import type { Curriculum, Lesson } from '../contract';
import { Icon, TOPIC } from '../game';
import { colors, ff, font } from '../theme';
import { ActionTile, BigButton, Divider, ErrorBox, Loading, MascotSays, TopBar } from '../ui';
import { ProgressBar, STATUS_STYLE, StatusChip } from '../trace';

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
        {loading && !cur && <Loading label="Loading your lessons…" />}
        {error && !cur && <ErrorBox message={error} onRetry={load} />}
        {!loading && !cur && !error && (
          <>
            <MascotSays mood="sleepy">No chapter yet. Add one and I'll make lessons from it!</MascotSays>
            <ActionTile icon="book-plus" title="Add a textbook chapter" color={colors.primary} onPress={onUpload} style={{ flex: 0 }} />
          </>
        )}

        {cur && (
          <>
            <MascotSays mood={mastered === lessons.length && lessons.length ? 'dancing' : 'excited'} size={96}>
              <Text style={styles.chapter}>{cur.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {lessons.length} lessons · {mastered} mastered
              </Text>
              <View style={styles.progressRow}>
                <ProgressBar value={overall} color={colors.primary} />
                <Text style={styles.pct}>{Math.round(overall * 100)}%</Text>
              </View>
            </MascotSays>

            <Divider label="your lessons" />

            {lessons.map((l, i) => {
              const locked = l.status === 'locked';
              const isNext = l.id === cur.nextLessonId;
              const t = TOPIC[l.topic] ?? TOPIC.fractions;
              const st = STATUS_STYLE[l.status] ?? STATUS_STYLE.ready;
              return (
                <Pressable key={l.id} onPress={() => !locked && onLesson(l)} disabled={locked} accessibilityRole="button">
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.card,
                        isNext && styles.cardNext,
                        locked && { opacity: 0.55 },
                        { borderBottomWidth: pressed ? 2 : 4, marginTop: pressed ? 2 : 0 },
                      ]}
                    >
                      <View style={[styles.art, { backgroundColor: t.light }]}>
                        <Text style={styles.artEmoji}>{t.emoji}</Text>
                        <View style={[styles.num, { backgroundColor: t.color }]}>
                          <Text style={styles.numText}>{i + 1}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <StatusChip status={l.status} />
                        <Text style={styles.title}>{l.title}</Text>
                        <Text style={styles.summary} numberOfLines={2}>
                          {l.summary}
                        </Text>
                        <View style={styles.progressRow}>
                          <ProgressBar value={l.mastery} color={st.bar} />
                          <Text style={styles.small}>{l.problems.length} problems</Text>
                        </View>
                      </View>
                      <Icon name={locked ? 'lock' : 'play-circle'} size={34} color={locked ? colors.trackText : t.color} />
                      {isNext && (
                        <View style={styles.nextBadge}>
                          <Text style={styles.nextBadgeText}>NEXT UP</Text>
                        </View>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}

            {error && <ErrorBox message={error} onRetry={load} />}
            <View style={styles.row}>
              <BigButton small variant="outline" label="Refresh" icon="↻" onPress={load} color={colors.blue} style={{ flex: 1 }} />
              <BigButton small label="New chapter" icon="📚" onPress={onUpload} color={colors.primary} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 16, paddingBottom: 40 },
  chapter: { fontFamily: ff.display, fontSize: font.big, color: colors.ink },
  meta: { fontFamily: ff.regular, fontSize: font.small, color: colors.inkSoft, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  pct: { fontFamily: ff.black, fontSize: font.small, color: colors.ink, minWidth: 40, textAlign: 'right' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 10,
    backgroundColor: '#fff',
  },
  cardNext: { borderColor: '#FFC3A8', borderBottomColor: colors.primary, backgroundColor: '#FFF8F4' },
  art: { width: 74, height: 74, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  artEmoji: { fontSize: 40 },
  num: { position: 'absolute', top: -6, left: -6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  numText: { fontFamily: ff.black, color: '#fff', fontSize: 13 },
  title: { fontFamily: ff.black, fontSize: font.body, color: colors.ink },
  summary: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  small: { fontFamily: ff.bold, fontSize: 12, color: colors.inkSoft },
  nextBadge: { position: 'absolute', top: -11, right: 14, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  nextBadgeText: { fontFamily: ff.black, color: '#fff', fontSize: 11, letterSpacing: 0.8 },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
