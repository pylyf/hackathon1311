import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api, errMsg } from '../api';
import type { ProblemResponse, Topic } from '../contract';
import { EXAMPLES, type Example } from '../examples';
import { Icon, TOPIC } from '../game';
import { colors, ff, font } from '../theme';
import { ErrorBox, Loading, MascotSays, TopBar } from '../ui';

const MAX_SIDE = 1280;

export type Picked = { uri: string; width: number; height: number; base64?: string | null; mimeType?: string };

export async function toJpegBase64(asset: Picked, maxSide = MAX_SIDE): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' }> {
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > maxSide) {
      ctx.resize(asset.width >= asset.height ? { width: maxSide } : { height: maxSide });
    }
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    if (out.base64) {
      const b64 = out.base64.includes(',') ? out.base64.slice(out.base64.indexOf(',') + 1) : out.base64;
      return { base64: b64, mediaType: 'image/jpeg' };
    }
  } catch (e) {
    console.warn('image resize failed, sending original', e);
  }
  if (asset.base64) {
    return { base64: asset.base64, mediaType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' };
  }
  throw new Error("I couldn't read that picture. Try another one?");
}

export default function PickScreen({
  ensureSession,
  topic,
  autoExample,
  onBack,
  onProblem,
}: {
  ensureSession: () => Promise<string>;
  topic?: Topic;
  autoExample?: Example;
  onBack: () => void;
  onProblem: (p: ProblemResponse) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAsset, setLastAsset] = useState<Picked | null>(null);
  const [example, setExample] = useState<Example | null>(null);
  const [filter, setFilter] = useState<Topic | 'all'>(topic ?? 'all');

  // started from an example card on the home screen
  useEffect(() => {
    if (autoExample) sendExample(autoExample);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendExample = async (ex: Example) => {
    setError(null);
    setExample(ex);
    setPreview(null);
    setBusy(true);
    try {
      const sessionId = await ensureSession();
      onProblem(await api.problem({ sessionId, exampleText: ex.text }));
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const send = async (asset: Picked) => {
    setError(null);
    setBusy(true);
    try {
      const sessionId = await ensureSession();
      const { base64, mediaType } = await toJpegBase64(asset);
      const problem = await api.problem({ sessionId, imageBase64: base64, mediaType });
      onProblem(problem);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const pick = async (useCamera: boolean) => {
    setError(null);
    try {
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, base64: true };
      let result: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('I need the camera to see your homework. Please allow it in settings.');
          return;
        }
        result = await ImagePicker.launchCameraAsync(opts);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      setExample(null);
      const asset: Picked = { uri: a.uri, width: a.width, height: a.height, base64: a.base64, mimeType: a.mimeType };
      setPreview(a.uri);
      setLastAsset(asset);
      await send(asset);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const isWeb = Platform.OS === 'web';
  const shown = EXAMPLES.filter((e) => filter === 'all' || e.topic === filter);

  if (busy) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Snap it!" />
        <ScrollView contentContainerStyle={styles.container}>
          {preview && <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />}
          {example && (
            <View style={[styles.exampleBig, { backgroundColor: example.bg }]}>
              <Text style={{ fontSize: 64 }}>{example.emoji}</Text>
              <Text style={styles.exampleBigText}>{example.text}</Text>
            </View>
          )}
          <Loading label="Hmm, let me read your problem…" />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="New problem" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.container}>
        <MascotSays mood={error ? 'crying' : 'excited'}>
          {preview ? 'Want to try another picture?' : 'Snap ONE homework problem, or pick a fun one below!'}
        </MascotSays>
        {preview && <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />}
        {error && <ErrorBox message={error} onRetry={lastAsset ? () => send(lastAsset) : example ? () => sendExample(example) : undefined} />}

        <View style={styles.photoRow}>
          <PhotoTile
            icon="camera"
            title={isWeb ? 'Camera' : 'Take a photo'}
            color={colors.primary}
            dark={colors.primaryDark}
            onPress={() => pick(true)}
          />
          <PhotoTile icon="image-multiple" title={isWeb ? 'Choose file' : 'From photos'} color={colors.blue} dark={colors.blueDark} onPress={() => pick(false)} />
        </View>

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerText}>OR TRY AN EXAMPLE</Text>
          <View style={styles.rule} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {(['all', 'word-problems', 'fractions', 'units'] as const).map((f) => {
            const on = filter === f;
            const t = f === 'all' ? null : TOPIC[f];
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filter, on && { backgroundColor: t?.color ?? colors.ink, borderColor: t?.dark ?? colors.ink }]}
              >
                <Text style={[styles.filterText, on && { color: '#fff' }]}>
                  {t ? `${t.emoji} ${t.label}` : '✨ All'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.examples}>
          {shown.map((ex) => {
            const t = TOPIC[ex.topic];
            return (
              <Pressable key={ex.id} onPress={() => sendExample(ex)}>
                {({ pressed }) => (
                  <View style={[styles.exCard, { borderBottomWidth: pressed ? 2 : 4, marginTop: pressed ? 2 : 0 }]}>
                    <View style={[styles.exArt, { backgroundColor: ex.bg }]}>
                      <Text style={styles.exEmoji}>{ex.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={[styles.exTag, { backgroundColor: t.light }]}>
                        <Text style={[styles.exTagText, { color: t.dark }]}>{t.label.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.exTitle}>{ex.title}</Text>
                      <Text style={styles.exText} numberOfLines={2}>
                        {ex.text}
                      </Text>
                    </View>
                    <Icon name="play-circle" size={34} color={t.color} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function PhotoTile({ icon, title, color, dark, onPress }: { icon: string; title: string; color: string; dark: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <View style={[styles.photoTile, { backgroundColor: color, borderBottomColor: dark, borderBottomWidth: pressed ? 2 : 6, marginTop: pressed ? 4 : 0 }]}>
          <View style={styles.photoIcon}>
            <Icon name={icon as never} size={34} color="#fff" />
          </View>
          <Text style={styles.photoTitle}>{title.toUpperCase()}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 18, flexGrow: 1, paddingBottom: 40 },
  preview: { width: '100%', height: 220, borderRadius: 16, backgroundColor: '#F7F7F7', borderWidth: 2, borderColor: colors.line },
  photoRow: { flexDirection: 'row', gap: 12 },
  photoTile: { borderRadius: 18, paddingVertical: 18, alignItems: 'center', gap: 8 },
  photoIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  photoTitle: { fontFamily: ff.black, color: '#fff', fontSize: 14, letterSpacing: 0.8 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: 2, backgroundColor: colors.line },
  dividerText: { fontFamily: ff.black, fontSize: 13, color: colors.trackText, letterSpacing: 1 },
  filters: { gap: 8 },
  filter: { borderWidth: 2, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  filterText: { fontFamily: ff.black, fontSize: 14, color: colors.inkSoft },
  examples: { gap: 12 },
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 10,
    backgroundColor: '#fff',
  },
  exArt: { width: 74, height: 74, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  exEmoji: { fontSize: 42 },
  exTag: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  exTagText: { fontFamily: ff.black, fontSize: 10, letterSpacing: 0.8 },
  exTitle: { fontFamily: ff.black, fontSize: font.body, color: colors.ink },
  exText: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  exampleBig: { borderRadius: 20, padding: 20, alignItems: 'center', gap: 10 },
  exampleBigText: { fontFamily: ff.bold, fontSize: font.body, color: colors.ink, textAlign: 'center', lineHeight: 26 },
});
