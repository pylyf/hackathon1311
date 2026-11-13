// Runs Qdrant WITHOUT Docker: the official standalone binary from the Qdrant GitHub release, downloaded once
// per machine into server/.vector/bin (pinned version, sha256-verified) and started as a child of this server.
// Supported: macOS (Intel + Apple Silicon), Linux (x64 + arm64), Windows x64. Set QDRANT_URL to use an
// existing Qdrant (Qdrant Cloud, another machine, your own Docker) instead: then nothing is downloaded or spawned.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { download, VECTOR_DIR } from './files.js';

export const QDRANT_VERSION = 'v1.20.1';
const ASSETS: Record<string, { file: string; sha256: string }> = {
  'darwin-arm64': { file: 'qdrant-aarch64-apple-darwin.tar.gz', sha256: '5deb80dfa44afea90fa27bb3fcd269e60b1e88347e769f2547a0269aadb37003' },
  'darwin-x64': { file: 'qdrant-x86_64-apple-darwin.tar.gz', sha256: '5f3ae5d62d476788f0c529b6f9276d5517e9c70b4707ef6374c1cceea4369597' },
  'linux-x64': { file: 'qdrant-x86_64-unknown-linux-musl.tar.gz', sha256: '52ea6723c10f8bd7be63950f4210bd52e93a8f45e8e81347f5ec94aa918fe14f' },
  'linux-arm64': { file: 'qdrant-aarch64-unknown-linux-musl.tar.gz', sha256: 'd608764d7d8e331633cba9f953ac15270e1330b55a2ff61cd1a6748222f97355' },
  'win32-x64': { file: 'qdrant-x86_64-pc-windows-msvc.zip', sha256: 'cdbcf8831a19b40785af300d10b762501fb3ff796f1a3c8d7fa142c67f76ad62' },
};

const BIN_DIR = path.join(VECTOR_DIR, 'bin', `qdrant-${QDRANT_VERSION}`);
const BIN = path.join(BIN_DIR, process.platform === 'win32' ? 'qdrant.exe' : 'qdrant');

/** Make sure the Qdrant binary for this OS/CPU is on disk. Returns its path. */
export async function ensureQdrantBinary(log: (m: string) => void = () => {}): Promise<string> {
  if (fs.existsSync(BIN)) return BIN;
  const key = `${process.platform}-${process.arch}`;
  const asset = ASSETS[key];
  if (!asset) throw new Error(`no Qdrant binary for ${key}; set QDRANT_URL to a running Qdrant instead`);
  log(`downloading Qdrant ${QDRANT_VERSION} for ${key} (one time, ~35 MB)…`);
  const archive = path.join(BIN_DIR, asset.file);
  await download(`https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/${asset.file}`, archive, asset.sha256);
  // `tar` ships with macOS, Linux and Windows 10+ (bsdtar there, which also reads .zip)
  execFileSync('tar', ['-xf', archive, '-C', BIN_DIR], { stdio: 'ignore' });
  fs.rmSync(archive, { force: true });
  if (!fs.existsSync(BIN)) throw new Error(`Qdrant archive did not contain ${path.basename(BIN)}`);
  if (process.platform !== 'win32') fs.chmodSync(BIN, 0o755);
  return BIN;
}

async function ready(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/readyz`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

let child: ChildProcess | null = null;

function stop(): void {
  if (child && child.exitCode === null) child.kill();
  child = null;
}

/**
 * Start a local Qdrant on 127.0.0.1:port with its storage under storageDir and resolve with its URL once it
 * answers. If a Qdrant already answers on that port (left over from an earlier run, or started by hand) it is reused.
 */
export async function startLocalQdrant(port: number, storageDir: string, log: (m: string) => void = () => {}): Promise<string> {
  const url = `http://127.0.0.1:${port}`;
  if (await ready(url)) return url;
  const bin = await ensureQdrantBinary(log);
  fs.mkdirSync(storageDir, { recursive: true });
  const out = fs.openSync(path.join(storageDir, 'qdrant.log'), 'w');
  // Minimal environment on purpose: the Qdrant process never sees this server's API keys.
  const env: NodeJS.ProcessEnv = {
    QDRANT__SERVICE__HOST: '127.0.0.1', // local only: not reachable from the network
    QDRANT__SERVICE__HTTP_PORT: String(port),
    QDRANT__SERVICE__GRPC_PORT: String(port + 1),
    QDRANT__STORAGE__STORAGE_PATH: path.join(storageDir, 'storage'),
    QDRANT__STORAGE__SNAPSHOTS_PATH: path.join(storageDir, 'snapshots'),
    QDRANT__TELEMETRY_DISABLED: 'true',
    QDRANT__LOG_LEVEL: 'WARN',
  };
  for (const k of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'USERPROFILE', 'LANG']) if (process.env[k]) env[k] = process.env[k];
  const proc = spawn(bin, [], { cwd: storageDir, env, stdio: ['ignore', out, out], windowsHide: true });
  fs.closeSync(out);
  child = proc;
  let exited: string | null = null;
  proc.once('error', (e) => { exited = e.message; });
  proc.once('exit', (code, signal) => { exited = `exited (${signal ?? code})`; if (child === proc) child = null; });

  // The database must never outlive the server.
  process.once('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => {
      stop();
      process.exit(sig === 'SIGINT' ? 130 : 143);
    });
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Qdrant ${exited}; see ${path.join(storageDir, 'qdrant.log')}`);
    if (await ready(url)) return url;
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  throw new Error(`Qdrant did not become ready on port ${port} within 30 s`);
}
