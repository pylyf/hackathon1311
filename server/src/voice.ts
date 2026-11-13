// ElevenLabs STT (Scribe) + TTS via REST.
import { ELEVEN_STT_MODEL, ELEVEN_TTS_MODEL, ELEVEN_VOICE_ID, HAS_ELEVEN } from './config.js';

const BASE = 'https://api.elevenlabs.io/v1';

function extFor(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('m4a') || m.includes('mp4') || m.includes('aac')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('caf')) return 'caf';
  return 'm4a';
}

export class SttUnavailableError extends Error {}

/** Speech-to-text. Throws SttUnavailableError when no ElevenLabs key is configured. */
export async function transcribe(audioBase64: string, mimeType = 'audio/m4a'): Promise<string> {
  if (!HAS_ELEVEN) throw new SttUnavailableError('Speech-to-text unavailable (no ELEVENLABS_API_KEY) — send `text` instead.');
  const bytes = Buffer.from(audioBase64, 'base64');
  const form = new FormData();
  form.append('model_id', ELEVEN_STT_MODEL);
  form.append('language_code', 'en');
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([bytes], { type: mimeType }), `clip.${extFor(mimeType)}`);
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

/** Text-to-speech → base64 mp3, or null on any failure / no key (mobile falls back to expo-speech). */
export async function synthesize(text: string): Promise<string | null> {
  if (!HAS_ELEVEN || !text.trim()) return null;
  try {
    const res = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_TTS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      console.warn(`[tts] ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer()).toString('base64');
  } catch (e) {
    console.warn('[tts] failed:', (e as Error).message);
    return null;
  }
}
