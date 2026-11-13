import 'dotenv/config';

export const PORT = Number(process.env.PORT || 8787);
export const MOCK = process.env.MOCK === '1' || !process.env.ANTHROPIC_API_KEY;
export const HAS_ELEVEN = !!process.env.ELEVENLABS_API_KEY;
export const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
export const ELEVEN_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
export const ELEVEN_STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';

export const MODEL_SOLVER = 'claude-opus-5-5'; // problem parsing/solving + session reflection
export const MODEL_TUTOR = 'claude-sonnet-5-5'; // tutor turns

export const CHILD_ID = 'demo';
