import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { File, Paths } from 'expo-file-system';

let current: AudioPlayer | null = null;

export function stopSpeaking() {
  const p = current;
  current = null;
  if (p) {
    try {
      p.pause();
      p.remove();
    } catch {
      /* ignore */
    }
  }
  Speech.stop().catch(() => {});
}

/** Plays the tutor reply: mp3 base64 if present, otherwise device TTS. */
export async function speakReply(text: string, audioBase64: string | null) {
  stopSpeaking();
  if (audioBase64) {
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      let uri: string;
      if (Platform.OS === 'web') {
        uri = `data:audio/mpeg;base64,${audioBase64}`;
      } else {
        const file = new File(Paths.cache, `nudge-reply-${Date.now()}.mp3`);
        await file.write(audioBase64, { encoding: 'base64' });
        uri = file.uri;
      }
      const player = createAudioPlayer({ uri });
      current = player;
      player.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish && current === player) {
          current = null;
          try {
            player.remove();
          } catch {
            /* ignore */
          }
        }
      });
      player.play();
      return;
    } catch (e) {
      console.warn('mp3 playback failed, falling back to speech', e);
    }
  }
  if (text) Speech.speak(text, { language: 'en-US', rate: 0.95, pitch: 1.1 });
}

/** Reads a finished recording into base64 + mime type, on web and native. */
export async function recordingToBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const mimeType = (blob.type || 'audio/webm').split(';')[0];
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType };
  }
  const file = new File(uri);
  const base64 = await file.base64();
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
  const mimeType =
    ext === '3gp'
      ? 'audio/3gpp'
      : ext === 'wav'
        ? 'audio/wav'
        : ext === 'caf'
          ? 'audio/x-caf'
          : ext === 'webm'
            ? 'audio/webm'
            : 'audio/m4a';
  try {
    file.delete();
  } catch {
    /* ignore */
  }
  return { base64, mimeType };
}
