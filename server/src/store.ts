import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HintStyle, HintLevel, Topic } from './contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.NUDGE_DATA_DIR ? path.resolve(process.env.NUDGE_DATA_DIR) : path.resolve(here, '..', 'data');
export const FILES = {
  bandit: path.join(DATA_DIR, 'bandit.json'),
  memory: path.join(DATA_DIR, 'memory.json'),
  events: path.join(DATA_DIR, 'events.jsonl'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  curriculum: path.join(DATA_DIR, 'curriculum.json'),
};

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown): void {
  ensureDataDir();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export type EventType =
  | 'session_start'
  | 'problem'
  | 'hint'
  | 'attempt'
  | 'solved'
  | 'bandit'
  | 'leak_blocked'
  | 'session_end'
  | 'plan';

export interface NudgeEvent {
  ts: string;
  sessionId: string;
  problemId?: string;
  type: EventType;
  topic?: Topic;
  level?: HintLevel;
  style?: HintStyle;
  text?: string;
  outcome?: string;
  reward?: 0 | 1;
  hints?: number;
  [k: string]: unknown;
}

export function logEvent(e: Omit<NudgeEvent, 'ts'> & { ts?: string }): void {
  ensureDataDir();
  const full = { ts: new Date().toISOString(), ...e };
  fs.appendFileSync(FILES.events, JSON.stringify(full) + '\n');
}

export function readEvents(): NudgeEvent[] {
  try {
    return fs
      .readFileSync(FILES.events, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as NudgeEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is NudgeEvent => e !== null);
  } catch {
    return [];
  }
}
