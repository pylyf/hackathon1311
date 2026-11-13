import { randomUUID } from 'node:crypto';
import type { MemoryNote, Topic } from './contract.js';
import { FILES, readJson, writeJson } from './store.js';

export function loadMemory(): MemoryNote[] {
  const m = readJson<MemoryNote[]>(FILES.memory, []);
  return Array.isArray(m) ? m : [];
}

export function saveMemory(notes: MemoryNote[]): void {
  writeJson(FILES.memory, notes);
}

function rank(a: MemoryNote, b: MemoryNote): number {
  return b.seen - a.seen || b.updatedAt.localeCompare(a.updatedAt);
}

/** Notes relevant to the current topic (topic match or 'any'), top N by seen / recency. */
export function relevantNotes(topic: Topic, limit = 8): MemoryNote[] {
  return loadMemory()
    .filter((n) => n.topic === topic || n.topic === 'any')
    .sort(rank)
    .slice(0, limit);
}

export function interests(): MemoryNote[] {
  return loadMemory().filter((n) => n.kind === 'interest').sort(rank);
}

export interface NoteUpdate {
  id?: string | null; // existing note id to update (merge), or null for a new note
  topic: MemoryNote['topic'];
  kind: MemoryNote['kind'];
  text: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/ ]/g, '').replace(/\s+/g, ' ').trim();

/** Merge updates into memory.json: known id or same text => seen+1, otherwise add. Returns touched notes. */
export function mergeNotes(updates: NoteUpdate[]): MemoryNote[] {
  const notes = loadMemory();
  const touched = new Map<string, MemoryNote>();
  const now = new Date().toISOString();
  for (const u of updates) {
    if (!u.text?.trim()) continue;
    let existing =
      (u.id ? notes.find((n) => n.id === u.id) : undefined) ??
      notes.find((n) => n.topic === u.topic && n.kind === u.kind && norm(n.text) === norm(u.text));
    if (existing) {
      if (touched.has(existing.id)) continue; // count each note once per reflection
      existing.seen += 1;
      existing.text = u.text.trim();
      existing.kind = u.kind;
      existing.topic = u.topic;
      existing.updatedAt = now;
    } else {
      existing = { id: randomUUID(), topic: u.topic, kind: u.kind, text: u.text.trim(), seen: 1, updatedAt: now };
      notes.push(existing);
    }
    touched.set(existing.id, existing);
  }
  saveMemory(notes);
  return [...touched.values()];
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'it', 'with', 'for', 'what', 'how', 'child', 'does', 'do']);
const words = (s: string) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

/** recall_memory tool: topic filter + keyword-overlap ranking (ties: seen, recency). */
export function recallNotes(query: string, topic: Topic, limit = 4): MemoryNote[] {
  const q = new Set(words(query));
  return loadMemory()
    .filter((n) => n.topic === topic || n.topic === 'any')
    .map((n) => ({ n, score: words(n.text).filter((w) => q.has(w) || [...q].some((x) => x.length > 4 && w.startsWith(x.slice(0, 5)))).length }))
    .sort((a, b) => b.score - a.score || rank(a.n, b.n))
    .slice(0, limit)
    .map((x) => x.n);
}
