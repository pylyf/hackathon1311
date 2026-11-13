import 'dotenv/config';

export const PORT = Number(process.env.PORT || 8787);
export const MOCK = process.env.MOCK === '1' || !process.env.ANTHROPIC_API_KEY;
export const HAS_ELEVEN = !!process.env.ELEVENLABS_API_KEY;
export const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
export const ELEVEN_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
export const ELEVEN_STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';

export const MODEL_SOLVER = 'claude-sonnet-5-5'; // problem parsing/solving + session reflection
export const MODEL_TUTOR = 'claude-sonnet-5-5'; // tutor turns

export const CHILD_ID = 'demo';

// Long-term semantic memory. 'qdrant' (default): memory notes + past mistakes are also indexed in a local Qdrant
// (standalone binary, no Docker) and recalled by meaning. 'json': keyword recall only, nothing is started.
// The JSON files stay the source of truth either way; if Qdrant is unavailable the server falls back to keywords.
export const MEMORY_BACKEND: 'qdrant' | 'json' = /^(json|off|0|false)$/i.test(process.env.MEMORY_BACKEND ?? '') ? 'json' : 'qdrant';
export const QDRANT_URL = (process.env.QDRANT_URL ?? '').trim().replace(/\/+$/, ''); // set = use this Qdrant instead of the local binary
export const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;
export const QDRANT_PORT = Number(process.env.QDRANT_PORT || 6333);
