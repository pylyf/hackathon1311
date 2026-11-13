import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { api, errMsg } from '../api';
import type { Lesson, ProblemResponse, UISpec } from '../contract';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { stopSpeaking } from '../audio';
import { colors, font } from '../theme';
import { BigButton, Card, ErrorBox, TopBar } from '../ui';
import { StatusChip } from '../trace';

function readOnlySpec(v: UISpec): UISpec {
  return v.type === 'BarModel' ? v : { ...v, interactive: false };
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

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Lesson" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ gap: 8 }}>
          <StatusChip status={lesson.status} />
          <Text style={styles.title}>{lesson.title}</Text>
          {!!lesson.summary && <Text style={styles.summary}>{lesson.summary}</Text>}
          <Pressable onPress={readAloud} style={styles.readBtn} hitSlop={8} accessibilityRole="button">
            <Text style={styles.readText}>{speaking ? '⏹ Stop reading' : '🔊 Read it to me'}</Text>
          </Pressable>
        </View>

        <Card style={{ gap: 12 }}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={styles.para}>
              {p}
            </Text>
          ))}
        </Card>

        {lesson.visual && <GenUIRenderer spec={readOnlySpec(lesson.visual)} readOnly />}

        {steps.length > 0 && (
          <Card style={styles.example}>
            <Text style={styles.exampleTitle}>✏️ Let's see an example</Text>
            {steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </Card>
        )}

        {!!lesson.sourcePages && <Text style={styles.source}>📖 From your textbook: {lesson.sourcePages}</Text>}

        {error && <ErrorBox message={error} onRetry={practice} />}
      </ScrollView>
      <View style={styles.bottom}>
        <BigButton
          label={busy ? 'Getting a problem…' : `💪 Practice (${n} problem${n === 1 ? '' : 's'})`}
          onPress={practice}
          disabled={busy || n === 0}
          color={colors.green}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 16, paddingBottom: 24 },
  title: { fontSize: font.title - 4, fontWeight: '900', color: colors.ink, lineHeight: 38 },
  summary: { fontSize: font.body, color: colors.inkSoft, lineHeight: 26 },
  readBtn: { alignSelf: 'flex-start', backgroundColor: '#DDEBFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  readText: { color: colors.blue, fontWeight: '800', fontSize: font.body - 2 },
  para: { fontSize: font.body + 1, color: colors.ink, lineHeight: 30 },
  example: { backgroundColor: '#FFF1C9', gap: 10 },
  exampleTitle: { fontSize: font.big - 2, fontWeight: '900', color: colors.ink },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '900', fontSize: font.small },
  stepText: { flex: 1, fontSize: font.body, color: colors.ink, lineHeight: 28 },
  source: { fontSize: font.small, color: colors.inkSoft, fontStyle: 'italic', textAlign: 'center' },
  bottom: { padding: 16, paddingBottom: 20, borderTopWidth: 2, borderTopColor: colors.line, backgroundColor: colors.bg },
});
