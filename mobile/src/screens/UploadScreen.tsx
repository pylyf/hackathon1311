import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { api, errMsg } from '../api';
import type { Curriculum, TextbookRequest, TraceStep } from '../contract';
import { colors, font } from '../theme';
import { BigButton, Card, ErrorBox, TopBar } from '../ui';
import { StepChecklist } from '../trace';
import { toJpegBase64 } from './PickScreen';

const POLL_MS = 1500;
const MAX_BYTES = 20 * 1024 * 1024;

type Payload = TextbookRequest;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

/** Reads a picked document into base64 on web (File / blob: / data: URI) and native (file:// URI). */
async function documentToBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (asset.base64) return asset.base64.includes(',') ? asset.base64.slice(asset.base64.indexOf(',') + 1) : asset.base64;
  if (Platform.OS === 'web') {
    if (asset.uri.startsWith('data:')) return asset.uri.slice(asset.uri.indexOf(',') + 1);
    const blob: Blob = asset.file ?? (await (await fetch(asset.uri)).blob());
    return blobToBase64(blob);
  }
  return new File(asset.uri).base64();
}

function PulsingBook() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] });
  return <Animated.Text style={[styles.book, { transform: [{ scale }, { rotate }] }]}>📚</Animated.Text>;
}

export default function UploadScreen({ onBack, onDone }: { onBack: () => void; onDone: (c: Curriculum) => void }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [phase, setPhase] = useState<'pick' | 'uploading' | 'running' | 'done'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Curriculum | null>(null);
  const alive = useRef(true);
  const navigated = useRef(false);
  const finishOnce = (c: Curriculum) => {
    if (navigated.current || !alive.current) return;
    navigated.current = true;
    onDone(c);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = async (p: Payload) => {
    setError(null);
    setSteps([]);
    setResult(null);
    setPhase('uploading');
    try {
      const { jobId } = await api.textbook(p);
      if (!alive.current) return;
      setPhase('running');
      let failures = 0;
      while (alive.current) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!alive.current) return;
        let st;
        try {
          st = await api.textbookJob(jobId);
          failures = 0;
        } catch (e) {
          if (++failures >= 5) throw e;
          continue;
        }
        if (!alive.current) return;
        setSteps(st.steps ?? []);
        if (st.status === 'error') throw new Error(st.error || 'The agent could not build lessons from this file.');
        if (st.status === 'done') {
          if (!st.curriculum) throw new Error('The job finished but returned no lessons.');
          const c = st.curriculum;
          setResult(c);
          setPhase('done');
          setTimeout(() => finishOnce(c), 1800);
          return;
        }
      }
    } catch (e) {
      if (!alive.current) return;
      setError(errMsg(e));
      setPhase('pick');
    }
  };

  const pickPdf = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (a.size && a.size > MAX_BYTES) {
        setError('That PDF is too big (max 20 MB). Try exporting just the chapter pages.');
        return;
      }
      const fileBase64 = await documentToBase64(a);
      const p: Payload = { fileBase64, mediaType: 'application/pdf', fileName: a.name };
      setPayload(p);
      await start(p);
    } catch (e) {
      setError(`Couldn't read that file: ${errMsg(e)}`);
    }
  };

  const pickImage = async (useCamera: boolean) => {
    setError(null);
    try {
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, base64: true };
      let res: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is needed to photograph the page.');
          return;
        }
        res = await ImagePicker.launchCameraAsync(opts);
      } else {
        res = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const { base64, mediaType } = await toJpegBase64(
        { uri: a.uri, width: a.width, height: a.height, base64: a.base64, mimeType: a.mimeType },
        2000,
      );
      const p: Payload = { fileBase64: base64, mediaType, fileName: a.fileName ?? 'textbook-page.jpg' };
      setPayload(p);
      await start(p);
    } catch (e) {
      setError(`Couldn't read that picture: ${errMsg(e)}`);
    }
  };

  const busy = phase === 'uploading' || phase === 'running';
  const lessonCount = result?.lessons.length ?? 0;
  const problemCount = result?.lessons.reduce((n, l) => n + l.problems.length, 0) ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Add a chapter" onBack={busy ? undefined : onBack} />
      <ScrollView contentContainerStyle={styles.container}>
        {phase === 'pick' && (
          <>
            <Card style={styles.intro}>
              <Text style={styles.h1}>📚 Turn a textbook chapter into lessons</Text>
              <Text style={styles.p}>
                For parents & teachers. Upload the chapter your child is working on (PDF or a photo of a page). Nudge's agent reads it,
                plans short lessons, writes practice problems and checks them — using the same method as the textbook.
              </Text>
            </Card>
            {error && <ErrorBox message={error} onRetry={payload ? () => start(payload) : undefined} />}
            <BigButton label="📄  Choose a PDF" onPress={pickPdf} style={styles.main} />
            <View style={styles.row}>
              <BigButton small label="🖼️  Photo of a page" onPress={() => pickImage(false)} color={colors.blue} style={{ flex: 1 }} />
              {Platform.OS !== 'web' && (
                <BigButton small label="📷  Camera" onPress={() => pickImage(true)} color={colors.purple} style={{ flex: 1 }} />
              )}
            </View>
          </>
        )}

        {phase !== 'pick' && (
          <Card style={styles.jobCard}>
            <View style={styles.jobHead}>
              {phase === 'done' ? <Text style={styles.book}>🎉</Text> : <PulsingBook />}
              <View style={{ flex: 1 }}>
                <Text style={styles.h1}>{phase === 'done' ? 'Lessons are ready!' : 'Nudge is building lessons…'}</Text>
                <Text style={styles.fileName} numberOfLines={1}>
                  {payload?.fileName ?? 'your file'}
                </Text>
              </View>
            </View>
            {phase === 'uploading' && <StepChecklist steps={[{ kind: 'read', text: '📤 Uploading the chapter…' }]} running />}
            {phase !== 'uploading' && steps.length === 0 && (
              <StepChecklist steps={[{ kind: 'read', text: '📖 Opening the chapter…' }]} running={phase === 'running'} />
            )}
            {steps.length > 0 && <StepChecklist steps={steps} running={phase === 'running'} />}
            {phase === 'done' && result && (
              <View style={styles.doneBox}>
                <Text style={styles.doneText}>
                  {result.title} · {lessonCount} lesson{lessonCount === 1 ? '' : 's'} · {problemCount} problems
                </Text>
                <BigButton small label="See the lessons ›" onPress={() => finishOnce(result)} color={colors.green} />
              </View>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, flexGrow: 1, justifyContent: 'center' },
  intro: { gap: 8 },
  h1: { fontSize: font.big - 2, fontWeight: '900', color: colors.ink },
  p: { fontSize: font.small + 1, color: colors.inkSoft, lineHeight: 23 },
  main: { paddingVertical: 26 },
  row: { flexDirection: 'row', gap: 12 },
  jobCard: { gap: 14, backgroundColor: '#FFFDF8', borderWidth: 2, borderColor: colors.line },
  jobHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  book: { fontSize: 52 },
  fileName: { fontSize: font.small, color: colors.inkSoft, marginTop: 2 },
  doneBox: { gap: 10, marginTop: 4, alignItems: 'stretch' },
  doneText: { fontSize: font.body, fontWeight: '800', color: colors.ink, textAlign: 'center' },
});
