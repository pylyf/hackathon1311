import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { api, errMsg } from '../api';
import type { Lesson, ProblemResponse, UISpec } from '../contract';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { stopSpeaking } from '../audio';
import { Icon, TOPIC } from '../game';
import { colors, ff, font } from '../theme';
import { BigButton, BottomBar, Card, Divider, ErrorBox, MascotSays, Tag, TopBar } from '../ui';
import { StatusChip } from '../trace';

function readOnlySpec(v: UISpec): UISpec {
  return 'interactive' in v ? ({ ...v, interactive: false } as UISpec) : v;
}

export default function LessonScreen({
  lesson,
  ensureSession,
  onBack,
  onProblem,
}: {
  lesson: Lesson;
  ensureSession: () => Promise<string>;
  onBack: () => void;
  onProblem: (p: ProblemResponse) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => stopSpeaking(), []);

  const paragraphs = (lesson.explanation || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const steps = (lesson.workedExample || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const n = lesson.problems.length;

  const readAloud = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    stopSpeaking();
    const text = [lesson.title, ...paragraphs, 'Here is an example.', ...steps].join('. ');
    setSpeaking(true);
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.92,
      pitch: 1.1,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const practice = async () => {
    setError(null);
    setBusy(true);
    stopSpeaking();
    setSpeaking(false);
    try {
      const sessionId = await ensureSession();
      const problem = await api.lessonProblem({ sessionId, lessonId: lesson.id });
      onProblem(problem);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const t = TOPIC[lesson.topic] ?? TOPIC.fractions;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Lesson" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={[styles.heroArt, { backgroundColor: t.light }]}>
            <Text style={styles.heroEmoji}>{t.emoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.tags}>
              <Tag label={t.label} bg={t.light} fg={t.dark} />
              <StatusChip status={lesson.status} />
            </View>
            <Text style={styles.title}>{lesson.title}</Text>
          </View>
        </View>

        {!!lesson.summary && <MascotSays mood="hello" size={90}>{lesson.summary}</MascotSays>}

        <BigButton
          small
          variant="outline"
          color={colors.blue}
          icon={speaking ? '⏹' : '🔊'}
          label={speaking ? 'Stop reading' : 'Read it to me'}
          onPress={readAloud}
          style={{ alignSelf: 'flex-start' }}
        />

        <Divider label="learn it" />
        <Card style={{ gap: 12 }}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={styles.para}>
              {p}
            </Text>
          ))}
        </Card>

        {lesson.visual && <GenUIRenderer spec={readOnlySpec(lesson.visual)} readOnly />}

        {steps.length > 0 && (
          <>
            <Divider label="see an example" />
            <View style={styles.example}>
              {steps.map((st, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{st}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {!!lesson.sourcePages && (
          <View style={styles.source}>
            <Icon name="book-open-variant" size={16} color={colors.trackText} />
            <Text style={styles.sourceText}>From your textbook: {lesson.sourcePages}</Text>
          </View>
        )}

        {error && <ErrorBox message={error} onRetry={practice} />}
      </ScrollView>
      <BottomBar>
        <BigButton
          label={busy ? 'Getting a problem…' : `Practice · ${n} problem${n === 1 ? '' : 's'}`}
          icon="💪"
          onPress={practice}
          disabled={busy || n === 0}
          color={colors.green}
        />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 16, paddingBottom: 28 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroArt: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 48 },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  title: { fontFamily: ff.display, fontSize: font.big + 2, color: colors.ink, lineHeight: 30 },
  para: { fontFamily: ff.regular, fontSize: font.body, color: colors.ink, lineHeight: 28 },
  example: {
    gap: 12,
    backgroundColor: colors.yellowLight,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFE29A',
    borderBottomWidth: 4,
    borderBottomColor: colors.yellow,
    padding: 16,
  },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontFamily: ff.black, color: '#fff', fontSize: 14 },
  stepText: { flex: 1, fontFamily: ff.regular, fontSize: font.body - 1, color: colors.ink, lineHeight: 26 },
  source: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sourceText: { fontFamily: ff.bold, fontSize: 13, color: colors.trackText },
});
