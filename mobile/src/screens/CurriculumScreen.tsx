import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, errMsg } from '../api';
import type { Curriculum, Lesson } from '../contract';
import { Icon, ProgressRing } from '../game';
import { colors, ff, font } from '../theme';
import { ActionTile, BigButton, ErrorBox, Loading, MascotSays, TopBar } from '../ui';
import { ProgressBar } from '../trace';

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
  const next =
    lessons.find((l) => l.id === cur?.nextLessonId) ?? lessons.find((l) => l.status !== 'mastered' && l.status !== 'locked') ?? null;

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

            {next && (
              <Pressable onPress={() => onLesson(next)} accessibilityRole="button">
                {({ pressed }) => (
                  <View style={[styles.hero, { borderBottomWidth: pressed ? 2 : 5, marginTop: pressed ? 3 : 0 }]}>
                    <Text style={styles.heroKicker}>UP NEXT · LESSON {lessons.indexOf(next) + 1}</Text>
                    <Text style={styles.heroTitle}>{next.title}</Text>
                    <Text style={styles.heroSummary} numberOfLines={2}>
                      {next.summary}
                    </Text>
                    <View style={styles.heroFoot}>
                      <Text style={styles.heroMeta}>
                        {next.problems.length} problems{next.status === 'review' ? ' · quick review' : ''}
                      </Text>
                      <View style={styles.startBtn}>
                        <Text style={styles.startText}>START ›</Text>
                      </View>
                    </View>
                  </View>
                )}
              </Pressable>
            )}

            <View style={styles.list}>
              {lessons.map((l, i) => {
                const locked = l.status === 'locked';
                const done = l.status === 'mastered';
                const isNext = l.id === next?.id;
                return (
                  <Pressable key={l.id} onPress={() => !locked && onLesson(l)} disabled={locked} accessibilityRole="button">
                    {({ pressed }) => (
                      <View style={[styles.item, i > 0 && styles.itemLine, pressed && { backgroundColor: '#FAFAFA' }]}>
                        <View
                          style={[
                            styles.badge,
                            done && { backgroundColor: colors.green, borderColor: colors.green },
                            isNext && { backgroundColor: colors.primary, borderColor: colors.primary },
                            l.status === 'review' && !isNext && { borderColor: colors.yellowDark },
                          ]}
                        >
                          {done ? (
                            <Icon name="check-bold" size={16} color="#fff" />
                          ) : locked ? (
                            <Icon name="lock" size={14} color={colors.trackText} />
                          ) : (
                            <Text style={[styles.badgeText, isNext && { color: '#fff' }]}>{i + 1}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemTitle, locked && { color: colors.trackText }]} numberOfLines={2}>
                            {l.title}
                          </Text>
                          <Text style={styles.itemMeta}>
                            {done ? 'Mastered' : l.status === 'review' ? 'Needs a quick review' : l.status === 'in-progress' ? 'In progress' : locked ? 'Locked' : `${l.problems.length} problems`}
                          </Text>
                        </View>
                        {!locked && l.mastery > 0 && !done ? (
                          <ProgressRing value={l.mastery} size={34} stroke={5} color={colors.primary} />
                        ) : (
                          <Icon name="chevron-right" size={24} color={colors.trackText} />
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {error && <ErrorBox message={error} onRetry={load} />}
            <BigButton variant="outline" label="Add a new chapter" icon="📚" onPress={onUpload} color={colors.blue} />
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
  hero: { backgroundColor: colors.primary, borderBottomColor: colors.primaryDark, borderRadius: 20, padding: 16, gap: 6 },
  heroKicker: { fontFamily: ff.black, fontSize: 12, letterSpacing: 1, color: 'rgba(255,255,255,0.85)' },
  heroTitle: { fontFamily: ff.display, fontSize: 22, color: '#fff', lineHeight: 27 },
  heroSummary: { fontFamily: ff.bold, fontSize: 14, color: 'rgba(255,255,255,0.92)', lineHeight: 19 },
  heroFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  heroMeta: { fontFamily: ff.black, fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  startBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 18 },
  startText: { fontFamily: ff.black, fontSize: 14, color: colors.primaryDark, letterSpacing: 0.8 },
  list: { borderWidth: 2, borderColor: colors.line, borderBottomWidth: 4, borderRadius: 18, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#fff' },
  itemLine: { borderTopWidth: 2, borderTopColor: colors.track },
  badge: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: ff.black, fontSize: 14, color: colors.inkSoft },
  itemTitle: { fontFamily: ff.black, fontSize: 15, color: colors.ink, lineHeight: 20 },
  itemMeta: { fontFamily: ff.bold, fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  row: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
