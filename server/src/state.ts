import { randomUUID } from 'node:crypto';
import type { HintLevel, HintStyle, MemoryNote, Topic, UISpec } from './contract.js';
import { FILES, readJson, writeJson } from './store.js';

export interface HiddenAnswer {
  value: number;
  unit: string | null;
  expression: string;
  verified: boolean; // mathjs result matched the model's answer
}

export interface PendingHint {
  style: HintStyle;
  level: HintLevel;
  turnsSeen: number;
}

export interface ProblemState {
  id: string;
  sessionId: string;
  text: string;
  topic: Topic;
  question: string;
  quantities: { name: string; value: string; unit: string }[];
  answer: HiddenAnswer; // NEVER sent to the client
  starterVisual: UISpec | null;
  level: HintLevel;
  hintsGiven: number;
  solved: boolean;
  history: { role: 'tutor' | 'child'; text: string }[];
  pendingHints: PendingHint[];
  createdAt: string;
}

export interface SessionState {
  id: string;
  childId: string;
  startedAt: string;
  ended: boolean;
  endNotes?: MemoryNote[];
  problems: Record<string, ProblemState>;
}

let sessions: Record<string, SessionState> = readJson(FILES.sessions, {});

export function persistSessions(): void {
  writeJson(FILES.sessions, sessions);
}

export function createSession(childId: string): SessionState {
  const s: SessionState = { id: randomUUID(), childId, startedAt: new Date().toISOString(), ended: false, problems: {} };
  sessions[s.id] = s;
  persistSessions();
  return s;
}

export function getSession(id: string): SessionState | undefined {
  return sessions[id];
}

/** Lazily recreate an unknown session (e.g. server data reset mid-demo). */
export function getOrCreateSession(id: string, childId: string): SessionState {
  if (!sessions[id]) {
    sessions[id] = { id, childId, startedAt: new Date().toISOString(), ended: false, problems: {} };
    persistSessions();
  }
  return sessions[id];
}

export function reloadSessions(): void {
  sessions = readJson(FILES.sessions, {});
}
