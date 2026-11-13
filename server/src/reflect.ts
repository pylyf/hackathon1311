// Session-end reflection: Claude (opus) reads the session's events + current memory and returns note updates.
import { MOCK, MODEL_SOLVER } from './config.js';
import type { LearnedResponse, MemoryNote } from './contract.js';
import { createJson } from './llm.js';
import { loadMemory, mergeNotes, type NoteUpdate } from './memory.js';
import { mockReflect } from './mock.js';
import { readEvents, type NudgeEvent } from './store.js';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['notes'],
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'topic', 'kind', 'text'],
        properties: {
          id: { type: 'string', description: 'id of the existing note this confirms/updates, or "" for a new note' },
          topic: { type: 'string', enum: ['word-problems', 'fractions', 'units', 'any'] },
          kind: { type: 'string', enum: ['misconception', 'works', 'doesnt-work', 'interest', 'mastered'] },
          text: { type: 'string' },
        },
      },
    },
  },
};

export async function reflect(sessionId: string): Promise<MemoryNote[]> {
  const events = readEvents().filter((e) => e.sessionId === sessionId);
  if (!events.some((e) => e.type === 'attempt' || e.type === 'hint')) return [];
  const existing = loadMemory();
  let updates: NoteUpdate[];
  if (MOCK) {
    updates = mockReflect(events, existing);
  } else {
    const compact = events
      .filter((e) => e.type !== 'session_start' && e.type !== 'session_end')
      .map(({ ts: _ts, sessionId: _s, ...rest }) => JSON.stringify(rest))
      .join('\n');
    const out = await createJson<{ notes: { id: string; topic: NoteUpdate['topic']; kind: NoteUpdate['kind']; text: string }[] }>({
      model: MODEL_SOLVER,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      system: `You maintain a small memory about ONE primary-school child for a math tutoring app. After each tutoring session you read the session log and return memory notes that are NEW or CONFIRMED/UPDATED by this session.
Kinds: misconception (a recurring error pattern, e.g. "Adds denominators (1/4 + 1/4 = 2/8)."), works (a hint style/approach that led to progress), doesnt-work (an approach that did not help), interest (something the child likes, for analogies), mastered (a skill they now do without help).
Rules: each note is one short sentence (max ~15 words), concrete and useful for the next tutor. If an existing note says the same thing, return it with its id (you may refine its text) instead of creating a duplicate. Do not return existing notes this session gives no evidence for. Bandit events: reward 1 = the hint style led to progress within 2 turns, 0 = it did not. Return at most 5 notes; return an empty list if nothing was learned.`,
      messages: [
        {
          role: 'user',
          content: `Existing memory notes:\n${JSON.stringify(existing.map(({ id, topic, kind, text, seen }) => ({ id, topic, kind, text, seen })))}\n\nSession log (one JSON event per line):\n${compact}`,
        },
      ],
      schema: SCHEMA,
    });
    updates = out.notes.map((n) => ({ ...n, id: n.id || null }));
  }
  return mergeNotes(updates);
}

export function computeStats(): LearnedResponse['stats'] {
  const events = readEvents();
  const sessions = new Map<string, { first: string; solvedHints: number[] }>();
  for (const e of events) {
    let s = sessions.get(e.sessionId);
    if (!s) sessions.set(e.sessionId, (s = { first: e.ts, solvedHints: [] }));
    if (e.ts < s.first) s.first = e.ts;
    if (e.type === 'solved') s.solvedHints.push(Number(e.hints ?? 0));
  }
  const ordered = [...sessions.values()].sort((a, b) => a.first.localeCompare(b.first));
  const solved = events.filter((e: NudgeEvent) => e.type === 'solved').length;
  return {
    sessions: ordered.length,
    problemsSolved: solved,
    avgHintsPerSolved: ordered
      .filter((s) => s.solvedHints.length > 0)
      .map((s) => Math.round((s.solvedHints.reduce((a, b) => a + b, 0) / s.solvedHints.length) * 100) / 100),
  };
}
