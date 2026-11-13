import React, { useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api, errMsg } from '../api';
import type { ProblemResponse } from '../contract';
import { colors, font } from '../theme';
import { BigButton, ErrorBox, Loading, TopBar } from '../ui';

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
  onBack,
  onProblem,
}: {
  ensureSession: () => Promise<string>;
  onBack: () => void;
  onProblem: (p: ProblemResponse) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAsset, setLastAsset] = useState<Picked | null>(null);

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
      const asset: Picked = { uri: a.uri, width: a.width, height: a.height, base64: a.base64, mimeType: a.mimeType };
      setPreview(a.uri);
      setLastAsset(asset);
      await send(asset);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const isWeb = Platform.OS === 'web';

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Snap it!" onBack={busy ? undefined : onBack} />
      <ScrollView contentContainerStyle={styles.container}>
        {preview && <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" />}

        {busy ? (
          <Loading label="Reading your problem… 🔍" />
        ) : (
          <>
            {!preview && (
              <Text style={styles.tip}>Take a photo of ONE problem.{'\n'}Make sure the words are easy to see!</Text>
            )}
            {error && <ErrorBox message={error} onRetry={lastAsset ? () => send(lastAsset) : undefined} />}
            {isWeb ? (
              <>
                <BigButton label="🖼️  Choose a picture" onPress={() => pick(false)} style={styles.main} />
                <BigButton label="📷  Use camera" onPress={() => pick(true)} color={colors.blue} small />
              </>
            ) : (
              <>
                <BigButton label="📷  Take a photo" onPress={() => pick(true)} style={styles.main} />
                <BigButton label="🖼️  Pick from photos" onPress={() => pick(false)} color={colors.blue} small />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 18, flexGrow: 1, justifyContent: 'center' },
  preview: { width: '100%', height: 260, borderRadius: 18, backgroundColor: '#eee' },
  tip: { fontSize: font.body, color: colors.inkSoft, textAlign: 'center', lineHeight: 27 },
  main: { paddingVertical: 30 },
});
