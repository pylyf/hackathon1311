import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { api, errMsg } from '../api';
import type { Curriculum, TextbookRequest, TraceStep } from '../contract';
import { Icon } from '../game';
import { colors, ff, font } from '../theme';
import { ActionTile, BigButton, BottomBar, BubbleText, Divider, ErrorBox, Mascot, MascotSays, SpeechBubble, TopBar } from '../ui';
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
      <TopBar title={phase === 'pick' ? 'Add a chapter' : 'Building lessons'} onBack={busy ? undefined : onBack} />
      <ScrollView contentContainerStyle={styles.container}>
        {phase === 'pick' && (
          <>
            <MascotSays mood={error ? 'crying' : 'excited'}>
              {error ? 'Hmm, that did not work. Try again?' : "Give me your child's textbook chapter. I'll turn it into lessons!"}
            </MascotSays>
            {error && <ErrorBox message={error} onRetry={payload ? () => start(payload) : undefined} />}

            <View style={styles.row}>
              <ActionTile icon="file-pdf-box" title="Choose a PDF" color={colors.primary} onPress={pickPdf} />
              <ActionTile icon="image-multiple" title="Photo of a page" color={colors.blue} onPress={() => pickImage(false)} />
            </View>
            {Platform.OS !== 'web' && (
              <ActionTile icon="camera" title="Take a photo of the page" color={colors.purple} onPress={() => pickImage(true)} style={{ flex: 0 }} />
            )}

            <Divider label="what happens next" />
            <View style={styles.how}>
              {HOW.map((h) => (
                <View key={h.title} style={styles.howCard}>
                  <View style={[styles.howArt, { backgroundColor: h.bg }]}>
                    <Text style={styles.howEmoji}>{h.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.howTitle}>{h.title}</Text>
                    <Text style={styles.howText}>{h.text}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.note}>For parents & teachers · PDF up to 20 MB or a clear photo of one page</Text>
          </>
        )}

        {phase !== 'pick' && (
          <>
            <View style={styles.jobHead}>
              <SpeechBubble tail="down">
                <BubbleText>
                  {phase === 'done'
                    ? `${result?.title ?? 'Your chapter'} is ready: ${lessonCount} lesson${lessonCount === 1 ? '' : 's'}, ${problemCount} problems!`
                    : 'Reading your chapter and planning lessons…'}
                </BubbleText>
              </SpeechBubble>
              <Mascot mood={phase === 'done' ? 'dancing' : 'pebble'} size={150} />
              <View style={styles.fileTag}>
                <Icon name="file-document-outline" size={16} color={colors.inkSoft} />
                <Text style={styles.fileName} numberOfLines={1}>
                  {payload?.fileName ?? 'your file'}
                </Text>
              </View>
            </View>

            <Divider label={phase === 'done' ? 'what nudge did' : 'nudge is working'} />
            {phase === 'uploading' && <StepChecklist steps={[{ kind: 'read', text: '📤 Uploading the chapter…' }]} running />}
            {phase !== 'uploading' && steps.length === 0 && (
              <StepChecklist steps={[{ kind: 'read', text: '📖 Opening the chapter…' }]} running={phase === 'running'} />
            )}
            {steps.length > 0 && <StepChecklist steps={steps} running={phase === 'running'} />}
          </>
        )}
      </ScrollView>
      {phase === 'done' && result && (
        <BottomBar>
          <BigButton label="See the lessons" icon="📚" onPress={() => finishOnce(result)} color={colors.green} />
        </BottomBar>
      )}
    </View>
  );
}

const HOW = [
  { emoji: '📖', bg: colors.blueLight, title: 'Nudge reads the chapter', text: 'It learns the method your textbook uses.' },
  { emoji: '🗺️', bg: colors.yellowLight, title: 'Plans short lessons', text: 'One skill per lesson, in the right order.' },
  { emoji: '🧪', bg: colors.greenLight, title: 'Writes & checks problems', text: 'Every answer is double-checked by maths.' },
];

const styles = StyleSheet.create({
  container: { padding: 18, gap: 18, flexGrow: 1, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 12 },
  how: { gap: 12 },
  howCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: colors.line,
    borderBottomWidth: 4,
    borderRadius: 18,
    padding: 10,
    backgroundColor: '#fff',
  },
  howArt: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  howEmoji: { fontSize: 30 },
  howTitle: { fontFamily: ff.black, fontSize: font.body - 1, color: colors.ink },
  howText: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  note: { fontFamily: ff.regular, fontSize: 13, color: colors.trackText, textAlign: 'center' },
  jobHead: { alignItems: 'center', gap: 8 },
  fileTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '90%',
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  fileName: { fontFamily: ff.bold, fontSize: 13, color: colors.inkSoft, flexShrink: 1 },
});
