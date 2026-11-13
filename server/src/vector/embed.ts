// Local sentence embeddings: all-MiniLM-L6-v2 (384 dims, quantized ONNX) run with onnxruntime-web (WebAssembly).
// WASM on purpose: no native binary, so it behaves the same on Intel + Apple Silicon Macs, Linux and Windows
// (onnxruntime-node ships no Intel-Mac build any more). No embedding API, no key: texts never leave the machine.
// The model (23 MB) is downloaded once into server/.vector/models, pinned to a revision and verified by sha256.
import fs from 'node:fs';
import path from 'node:path';
import { download, VECTOR_DIR } from './files.js';

export const EMBED_MODEL = 'all-MiniLM-L6-v2';
export const EMBED_DIM = 384;
const MAX_TOKENS = 256;

const REPO = 'Xenova/all-MiniLM-L6-v2';
const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
const MODEL_FILES = [
  { name: 'model_quantized.onnx', remote: 'onnx/model_quantized.onnx', sha256: 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1' },
  { name: 'tokenizer.json', remote: 'tokenizer.json', sha256: 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0' },
  { name: 'tokenizer_config.json', remote: 'tokenizer_config.json', sha256: '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3' },
];
const MODEL_DIR = path.join(VECTOR_DIR, 'models', EMBED_MODEL);

/** Make sure the model files are on disk. Returns true if something had to be downloaded. */
export async function ensureModel(log: (m: string) => void = () => {}): Promise<boolean> {
  let fetched = false;
  for (const f of MODEL_FILES) {
    const dest = path.join(MODEL_DIR, f.name);
    if (fs.existsSync(dest)) continue;
    if (!fetched) log(`downloading embedding model ${EMBED_MODEL} (one time, ~23 MB)…`);
    await download(`https://huggingface.co/${REPO}/resolve/${REVISION}/${f.remote}`, dest, f.sha256);
    fetched = true;
  }
  return fetched;
}

interface Runtime {
  encode: (text: string) => number[];
  run: (ids: number[]) => Promise<number[]>;
}
let runtime: Promise<Runtime> | null = null;

async function load(): Promise<Runtime> {
  await ensureModel();
  const [ort, { Tokenizer }] = await Promise.all([import('onnxruntime-web'), import('@huggingface/tokenizers')]);
  ort.env.wasm.numThreads = 1; // short texts: a single thread is fast enough and never spawns workers
  const json = (name: string) => JSON.parse(fs.readFileSync(path.join(MODEL_DIR, name), 'utf8'));
  const tokenizer = new Tokenizer(json('tokenizer.json'), json('tokenizer_config.json'));
  const session = await ort.InferenceSession.create(fs.readFileSync(path.join(MODEL_DIR, 'model_quantized.onnx')), { executionProviders: ['wasm'] });
  const needsTypes = session.inputNames.includes('token_type_ids');
  const tensor = (xs: number[]) => new ort.Tensor('int64', BigInt64Array.from(xs, (x) => BigInt(x)), [1, xs.length]);
  return {
    encode: (text) => {
      const ids = tokenizer.encode(text).ids;
      return ids.length > MAX_TOKENS ? [...ids.slice(0, MAX_TOKENS - 1), ids[ids.length - 1]] : ids; // keep [SEP]
    },
    run: async (ids) => {
      const feeds: Record<string, InstanceType<typeof ort.Tensor>> = { input_ids: tensor(ids), attention_mask: tensor(ids.map(() => 1)) };
      if (needsTypes) feeds.token_type_ids = tensor(ids.map(() => 0));
      const out = (await session.run(feeds))[session.outputNames[0]];
      const hidden = out.data as Float32Array;
      const dim = out.dims[2];
      // mean pooling over tokens + L2 normalisation (what sentence-transformers does for this model)
      const v = new Float64Array(dim);
      for (let i = 0; i < ids.length; i++) for (let j = 0; j < dim; j++) v[j] += hidden[i * dim + j];
      let norm = 0;
      for (let j = 0; j < dim; j++) norm += v[j] * v[j];
      norm = Math.sqrt(norm) || 1;
      return Array.from(v, (x) => x / norm);
    },
  };
}

/** Load the model (idempotent). Rejects if the model cannot be downloaded or loaded; the next call retries. */
export function initEmbedder(): Promise<void> {
  runtime ??= load();
  return runtime.then(() => undefined, (e) => {
    runtime = null;
    throw e;
  });
}

const cache = new Map<string, number[]>();
const CACHE_MAX = 2000;
let queue: Promise<unknown> = Promise.resolve();

/** Text -> unit vector (384 dims). Calls are serialised (one WASM session) and memoised. */
export function embed(text: string): Promise<number[]> {
  const key = text.replace(/\s+/g, ' ').trim().slice(0, 2000) || '-';
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = cache.get(key);
    if (again) return again;
    await initEmbedder();
    const rt = await runtime!;
    const v = await rt.run(rt.encode(key));
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, v);
    return v;
  });
  queue = job.catch(() => undefined);
  return job;
}
