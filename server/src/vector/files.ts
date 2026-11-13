// Where the vector memory keeps its downloads (Qdrant binary, embedding model) + a checksum-verified downloader.
// Everything here is a cache: delete server/.vector and it is fetched again on the next start.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const VECTOR_DIR = process.env.NUDGE_VECTOR_DIR
  ? path.resolve(process.env.NUDGE_VECTOR_DIR)
  : path.resolve(here, '..', '..', '.vector');

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

/** Download url to dest (atomic: temp file + rename) and refuse it unless the sha256 matches. */
export async function download(url: string, dest: string, sha256: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.part`;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(tmp));
    const got = await sha256File(tmp);
    if (got !== sha256) throw new Error(`checksum mismatch for ${path.basename(dest)} (expected ${sha256.slice(0, 12)}…, got ${got.slice(0, 12)}…)`);
    fs.renameSync(tmp, dest);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
