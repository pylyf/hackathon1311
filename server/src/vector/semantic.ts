// Long-term semantic memory on Qdrant. Two collections, both derived from the JSON files (which stay the
// source of truth: the index can be deleted and is rebuilt from memory.json + events.jsonl on the next start):
//   nudge_notes     one point per memory note (misconception / works / interest …), vector = the note text
//   nudge_attempts  one point per moment the child struggled (wrong / "I don't know" / "just tell me"), with
//                   two named vectors: `moment` (skill + problem + what the child said) and `problem` (skill +
//                   problem), and a payload saying how long the answer took, which hint came next and whether it helped.
// The lesson's skill is part of the embedded text on purpose: a small general model sees "2/7 + 3/7" and
// "Tom eats 1/4 of a pizza" as different stories; the shared skill pulls moments of the same kind together.
// Every read has a short timeout and returns null/[] when the index is not ready, so callers fall back to keywords.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { MEMORY_BACKEND, QDRANT_API_KEY, QDRANT_PORT, QDRANT_URL } from '../config.js';
import type { HintLevel, HintStyle, MemoryNote, Topic } from '../contract.js';
import { DATA_DIR, FILES, onEvent, readEvents, readJson, type NudgeEvent } from '../store.js';
import { embed, EMBED_DIM, EMBED_MODEL, ensureModel, initEmbedder } from './embed.js';
import { startLocalQdrant } from './qdrantProcess.js';

const NOTES = 'nudge_notes';
const ATTEMPTS = 'nudge_attempts';
const READ_TIMEOUT_MS = 400; // live tutor turns must never wait for memory

type State = 'off' | 'starting' | 'ready' | 'failed';
let state: State = 'off';
let lastError: string | null = null;
let client: QdrantClient | null = null;
let qdrantUrl = '';
let lastSync: string | null = null;
let restarts = 0;

const log = (m: string) => console.log(`[vector] ${m}`);
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Qdrant point ids must be UUIDs (or integers): keep real UUIDs, hash anything else into UUID shape. */
function pointId(key: string): string {
  if (UUID.test(key)) return key.toLowerCase();
  const h = sha1(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); broken(e); resolve(null); });
  });
}

// ---------------- what gets indexed ----------------

export type StruggleOutcome = 'wrong' | 'dont_know' | 'just_tell_me';
const STRUGGLE = new Set<string>(['wrong', 'dont_know', 'just_tell_me']);
const PROGRESS = new Set<string>(['solved', 'correct_step']);

export interface PastStruggle {
  score: number;            // cosine similarity to the query (0..1)
  problemId: string;
  sessionId: string;
  lessonId: string | null;
  skill: string | null;     // the lesson's skill, when the problem came from the curriculum
  topic: Topic;
  problemText: string;
  said: string;             // what the child said ('' = said nothing / tapped)
  outcome: StruggleOutcome;
  ts: string;
  responseSec: number | null; // seconds between the tutor's question and this answer (includes listening time)
  hintsBefore: number;
  followUp: { style: HintStyle; level: HintLevel; helped: boolean | null } | null; // the hint given next
}
type AttemptPayload = Omit<PastStruggle, 'score'>;
interface AttemptDoc { id: string; momentText: string; payload: AttemptPayload; sig: string }

const problemDoc = (problemText: string, skill?: string | null) => `${skill ? `${skill}. ` : ''}${problemText}`;
const momentText = (problemText: string, said: string, skill?: string | null) => `${problemDoc(problemText, skill)}\nChild: ${said.trim() || "I don't know"}`;

/** lessonId -> skill, from the current curriculum. */
function lessonSkills(): Map<string, string> {
  const c = readJson<{ lessons?: { id: string; skill: string }[] } | null>(FILES.curriculum, null);
  return new Map((c?.lessons ?? []).map((l) => [l.id, l.skill]));
}

/** Replay the event log into one document per struggling attempt (deterministic ids). */
export function buildAttemptDocs(events: NudgeEvent[], skills: Map<string, string> = lessonSkills()): AttemptDoc[] {
  const byProblem = new Map<string, NudgeEvent[]>();
  for (const e of events) {
    if (!e.problemId) continue;
    const list = byProblem.get(e.problemId);
    if (list) list.push(e);
    else byProblem.set(e.problemId, [e]);
  }
  const docs: AttemptDoc[] = [];
  for (const [problemId, evs] of byProblem) {
    const prob = evs.find((e) => e.type === 'problem');
    if (!prob?.text || !prob.topic) continue;
    const lessonId = typeof prob.lessonId === 'string' ? prob.lessonId : null;
    const skill = (lessonId && skills.get(lessonId)) || null;
    let lastHint: NudgeEvent | null = null;
    let hints = 0;
    let n = 0;
    let open: AttemptDoc | null = null; // latest struggle still waiting to learn whether the next hint helped
    const mine: AttemptDoc[] = [];
    for (const e of evs) {
      if (e.type === 'hint') {
        lastHint = e;
        if (!e.intro) hints += 1;
        if (open && !open.payload.followUp && e.style && e.level) open.payload.followUp = { style: e.style, level: e.level, helped: null };
      } else if (e.type === 'attempt') {
        n += 1;
        const outcome = String(e.outcome ?? '');
        if (open?.payload.followUp && open.payload.followUp.helped === null) {
          if (PROGRESS.has(outcome)) open.payload.followUp.helped = true;
          else if (STRUGGLE.has(outcome)) open.payload.followUp.helped = false;
        }
        if (!STRUGGLE.has(outcome)) continue;
        const raw = String(e.text ?? '').trim();
        const said = raw.startsWith('(seeded') ? '' : raw.slice(0, 300);
        const waited = lastHint ? (Date.parse(e.ts) - Date.parse(lastHint.ts)) / 1000 : Number.NaN;
        open = {
          id: pointId(`attempt|${e.sessionId}|${problemId}|${n}`),
          momentText: momentText(prob.text, said, skill),
          sig: '',
          payload: {
            problemId, sessionId: e.sessionId, lessonId, skill, topic: prob.topic,
            problemText: prob.text, said, outcome: outcome as StruggleOutcome, ts: e.ts,
            responseSec: waited > 0 && waited <= 600 ? Math.round(waited) : null, hintsBefore: hints, followUp: null,
          },
        };
        mine.push(open);
      }
    }
    for (const d of mine) d.sig = sha1(JSON.stringify(d.payload));
    docs.push(...mine);
  }
  return docs;
}

const loadNotes = (): MemoryNote[] => {
  const m = readJson<MemoryNote[]>(FILES.memory, []);
  return Array.isArray(m) ? m : [];
};
const noteSig = (n: MemoryNote) => sha1(JSON.stringify([n.id, n.topic, n.kind, n.text, n.seen, n.updatedAt]));

// ---------------- writes (serialised, fire-and-forget) ----------------

const indexed = { notes: new Map<string, string>(), attempts: new Map<string, string>() }; // point id -> sig
let writes: Promise<unknown> = Promise.resolve();
function enqueue(job: () => Promise<void>): Promise<void> {
  const run = writes.then(job).catch((e) => { broken(e); });
  writes = run;
  return run;
}

async function upsertNotes(notes: MemoryNote[]): Promise<void> {
  const points = [];
  for (const n of notes) {
    const sig = noteSig(n);
    if (indexed.notes.get(pointId(n.id)) === sig) continue;
    points.push({ id: pointId(n.id), vector: await embed(n.text), payload: { noteId: n.id, topic: n.topic, kind: n.kind, text: n.text, seen: n.seen, updatedAt: n.updatedAt, sig } });
  }
  if (!points.length) return;
  await client!.upsert(NOTES, { wait: true, points });
  for (const p of points) indexed.notes.set(p.id, p.payload.sig);
}

async function upsertAttempts(docs: AttemptDoc[]): Promise<void> {
  const points = [];
  for (const d of docs) {
    if (indexed.attempts.get(d.id) === d.sig) continue;
    points.push({ id: d.id, vector: { moment: await embed(d.momentText), problem: await embed(problemDoc(d.payload.problemText, d.payload.skill)) }, payload: { ...d.payload, sig: d.sig } });
  }
  for (let i = 0; i < points.length; i += 64) await client!.upsert(ATTEMPTS, { wait: true, points: points.slice(i, i + 64) });
  for (const p of points) indexed.attempts.set(p.id, p.payload.sig);
}

/** Index new/changed notes (called after memory.json was written). No-op while the index is not ready. */
export function indexNotes(notes: MemoryNote[]): void {
  if (state !== 'ready' || !notes.length) return;
  void enqueue(() => upsertNotes(notes));
}

function onLogged(e: NudgeEvent): void {
  if (state !== 'ready' || !e.problemId || (e.type !== 'attempt' && e.type !== 'hint')) return;
  const problemId = e.problemId;
  // re-derive this problem's documents: adds the new attempt and updates "did the next hint help" on the previous one
  void enqueue(() => upsertAttempts(buildAttemptDocs(readEvents().filter((x) => x.problemId === problemId))));
}

// ---------------- boot + sync ----------------

async function ensureCollection(name: string, vectors: Record<string, unknown>, shapeOk: (v: unknown) => boolean, indexes: string[]): Promise<void> {
  const c = client!;
  if ((await c.collectionExists(name)).exists) {
    const info = await c.getCollection(name);
    if (shapeOk(info.config?.params?.vectors)) return;
    log(`${name}: vector shape changed, rebuilding`);
    await c.deleteCollection(name);
  }
  await c.createCollection(name, { vectors: vectors as never });
  for (const field of indexes) await c.createPayloadIndex(name, { field_name: field, field_schema: 'keyword', wait: true });
}

async function existingSigs(name: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let offset: string | number | undefined;
  do {
    const page = await client!.scroll(name, { limit: 512, with_payload: { include: ['sig'] }, with_vector: false, ...(offset !== undefined ? { offset } : {}) });
    for (const p of page.points) out.set(String(p.id), String(p.payload?.sig ?? ''));
    const next = page.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : undefined;
  } while (offset !== undefined);
  return out;
}

/** Make the index mirror the JSON files exactly: add what is missing or changed, drop what no longer exists. */
async function reconcile(): Promise<{ notes: number; attempts: number }> {
  const c = client!;
  const notes = loadNotes();
  const docs = buildAttemptDocs(readEvents());
  indexed.notes = await existingSigs(NOTES);
  indexed.attempts = await existingSigs(ATTEMPTS);
  const noteIds = new Set(notes.map((n) => pointId(n.id)));
  const docIds = new Set(docs.map((d) => d.id));
  const staleNotes = [...indexed.notes.keys()].filter((id) => !noteIds.has(id));
  const staleDocs = [...indexed.attempts.keys()].filter((id) => !docIds.has(id));
  if (staleNotes.length) await c.delete(NOTES, { wait: true, points: staleNotes });
  if (staleDocs.length) await c.delete(ATTEMPTS, { wait: true, points: staleDocs });
  for (const id of staleNotes) indexed.notes.delete(id);
  for (const id of staleDocs) indexed.attempts.delete(id);
  await upsertNotes(notes);
  await upsertAttempts(docs);
  lastSync = new Date().toISOString();
  return { notes: notes.length, attempts: docs.length };
}

/** Rebuild the index from the JSON files now (also runs on every start). */
export async function resync(): Promise<{ notes: number; attempts: number } | null> {
  if (state !== 'ready') return null;
  let res: { notes: number; attempts: number } | null = null;
  await enqueue(async () => { res = await reconcile(); });
  return res;
}

let listening = false;
async function boot(): Promise<void> {
  const t0 = Date.now();
  const [url] = await Promise.all([
    QDRANT_URL ? Promise.resolve(QDRANT_URL) : startLocalQdrant(QDRANT_PORT, path.join(DATA_DIR, 'qdrant'), log),
    ensureModel(log).then(() => initEmbedder()),
  ]);
  qdrantUrl = url;
  client = new QdrantClient({ url, apiKey: QDRANT_API_KEY, checkCompatibility: false, timeout: 10_000 });
  const flat = (v: unknown) => (v as { size?: number } | undefined)?.size === EMBED_DIM;
  await ensureCollection(NOTES, { size: EMBED_DIM, distance: 'Cosine' }, flat, ['topic', 'kind']);
  await ensureCollection(
    ATTEMPTS,
    { moment: { size: EMBED_DIM, distance: 'Cosine' }, problem: { size: EMBED_DIM, distance: 'Cosine' } },
    (v) => flat((v as Record<string, unknown> | undefined)?.moment) && flat((v as Record<string, unknown> | undefined)?.problem),
    ['topic', 'sessionId', 'problemId'],
  );
  const n = await reconcile();
  if (!listening) {
    onEvent(onLogged);
    listening = true;
  }
  state = 'ready';
  lastError = null;
  log(`ready in ${Date.now() - t0} ms: Qdrant ${QDRANT_URL ? 'at' : 'local binary on'} ${url}, ${EMBED_MODEL} embeddings, ${n.notes} notes + ${n.attempts} past struggles indexed`);
}

/** Start the semantic memory in the background. The server works (keyword recall) while this is still starting. */
export function startVectorMemory(): void {
  if (MEMORY_BACKEND !== 'qdrant') {
    console.log('  Memory: keyword recall only (MEMORY_BACKEND=json)');
    return;
  }
  if (state === 'starting' || state === 'ready') return;
  state = 'starting';
  boot().catch((e) => {
    state = 'failed';
    lastError = (e as Error).message;
    console.warn(`[vector] not available, using keyword recall instead: ${lastError}`);
  });
}

/** A read or write failed: fall back to keywords and try to bring the index back a few times. */
function broken(e: unknown): void {
  const msg = (e as Error)?.message ?? String(e);
  if (state !== 'ready') return;
  state = 'failed';
  lastError = msg;
  console.warn(`[vector] ${msg} → keyword recall until the index is back`);
  if (restarts++ < 5) setTimeout(startVectorMemory, 15_000).unref();
}

export const vectorReady = () => state === 'ready';

export async function vectorStatus(): Promise<Record<string, unknown>> {
  const base = { backend: state === 'ready' ? 'qdrant' : 'keyword', state, error: lastError, model: EMBED_MODEL, dims: EMBED_DIM };
  if (state !== 'ready' || !client) return base;
  const [notes, attempts] = await Promise.all([client.count(NOTES, { exact: true }), client.count(ATTEMPTS, { exact: true })]).catch(() => [null, null]);
  return { ...base, qdrant: { url: qdrantUrl, managed: !QDRANT_URL }, collections: { [NOTES]: notes?.count ?? null, [ATTEMPTS]: attempts?.count ?? null }, lastSync };
}

// ---------------- reads ----------------

export interface NoteHit { note: MemoryNote; score: number }

/** Notes closest in meaning to the query (topic notes + 'any'). null = index not available → use keywords. */
export function searchNotes(query: string, topic: Topic | null, limit = 4, timeoutMs = READ_TIMEOUT_MS): Promise<NoteHit[] | null> {
  if (state !== 'ready' || !query.trim()) return Promise.resolve(null);
  return withTimeout((async () => {
    const res = await client!.query(NOTES, {
      query: await embed(query), limit: limit + 4, with_payload: ['noteId'],
      ...(topic ? { filter: { must: [{ key: 'topic', match: { any: [topic, 'any'] } }] } } : {}),
    });
    // The JSON file is the source of truth: return the note as it is NOW, skip points whose note is gone.
    const byId = new Map(loadNotes().map((n) => [n.id, n]));
    const hits: NoteHit[] = [];
    let stale = false;
    for (const p of res.points) {
      const note = byId.get(String(p.payload?.noteId ?? ''));
      if (note) hits.push({ note, score: p.score });
      else stale = true;
    }
    if (stale) void resync(); // memory.json was replaced behind our back (seed / reset)
    return hits.slice(0, limit);
  })(), timeoutMs);
}

export interface StruggleQuery {
  problemText: string;
  skill?: string | null;      // the lesson's skill, when known
  said?: string;              // given: match on "problem + what the child said"; omitted: match on the problem only
  topic?: Topic;
  excludeProblemId?: string;
  excludeSessionId?: string;
  limit?: number;
  minScore?: number;
  timeoutMs?: number;
}

/** Past moments where this child struggled that are closest in meaning to the query, best first. [] if unavailable. */
export async function similarStruggles(q: StruggleQuery): Promise<PastStruggle[]> {
  if (state !== 'ready' || !q.problemText.trim()) return [];
  const byMoment = q.said !== undefined;
  const must_not = [
    ...(q.excludeProblemId ? [{ key: 'problemId', match: { value: q.excludeProblemId } }] : []),
    ...(q.excludeSessionId ? [{ key: 'sessionId', match: { value: q.excludeSessionId } }] : []),
  ];
  const res = await withTimeout((async () => client!.query(ATTEMPTS, {
    query: await embed(byMoment ? momentText(q.problemText, q.said!, q.skill) : problemDoc(q.problemText, q.skill)),
    using: byMoment ? 'moment' : 'problem',
    limit: q.limit ?? 3,
    score_threshold: q.minScore ?? 0.5,
    with_payload: true,
    filter: { ...(q.topic ? { must: [{ key: 'topic', match: { value: q.topic } }] } : {}), ...(must_not.length ? { must_not } : {}) },
  }))(), q.timeoutMs ?? READ_TIMEOUT_MS);
  return (res?.points ?? []).map((p) => {
    const { sig: _sig, ...payload } = (p.payload ?? {}) as unknown as AttemptPayload & { sig?: string };
    return { ...payload, score: p.score };
  });
}

const DAY = 24 * 3600 * 1000;
export function ago(ts: string, now = Date.now()): string {
  const d = Math.floor((now - Date.parse(ts)) / DAY);
  return d <= 0 ? 'earlier today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

const OUTCOME_WORDS: Record<StruggleOutcome, string> = { wrong: 'wrong answer', dont_know: 'was stuck', just_tell_me: 'asked for the answer' };

/** One line for a prompt: what happened, how long it took, which hint came next and whether it helped. */
export function describeStruggle(s: PastStruggle): string {
  const said = s.said ? `said "${s.said.slice(0, 80)}" (${OUTCOME_WORDS[s.outcome]}` : `(${OUTCOME_WORDS[s.outcome]}`;
  const slow = s.responseSec !== null && s.responseSec >= 30 ? `, took ${s.responseSec} s` : '';
  const f = s.followUp;
  const then = f ? ` Next hint: ${f.style} L${f.level} → ${f.helped === true ? 'HELPED' : f.helped === false ? 'did not help' : 'result unknown'}.` : '';
  return `${ago(s.ts)}, on "${s.problemText.slice(0, 110)}": ${said}${slow}).${then}`;
}

/** How much a past struggle should still count: unresolved and recent ones weigh more, slow answers a bit more. */
function weight(s: PastStruggle, now: number): number {
  const recency = Math.pow(0.5, Math.max(0, now - Date.parse(s.ts)) / (14 * DAY)); // half-life: two weeks
  const resolved = s.followUp?.helped === true ? 0.7 : 1;
  const slow = s.responseSec !== null && s.responseSec >= 45 ? 1.15 : 1;
  return (0.5 + 0.5 * recency) * resolved * slow;
}

export interface Affinity { score: number; because: PastStruggle }

/** For each candidate problem: how close it is to what the child struggled with before (empty map if unavailable). */
export async function struggleAffinity(problems: { id: string; text: string }[], topic: Topic, skill?: string | null): Promise<Map<string, Affinity>> {
  const out = new Map<string, Affinity>();
  if (state !== 'ready') return out;
  const now = Date.now();
  for (const p of problems) {
    const hits = await similarStruggles({ problemText: p.text, skill, topic, limit: 5, minScore: 0.45, timeoutMs: 600 });
    if (!hits.length) continue;
    const scored = hits.map((h) => ({ h, v: h.score * weight(h, now) })).sort((a, b) => b.v - a.v);
    out.set(p.id, { score: scored[0].v + 0.05 * Math.min(3, scored.length - 1), because: scored[0].h });
  }
  return out;
}

export interface Recurring {
  said: string;
  problemText: string;
  lessonId: string | null;
  earlier: PastStruggle[];   // similar moments from OTHER sessions, best first
  sessions: number;          // in how many earlier sessions it showed up
  note: NoteHit | null;      // the closest misconception note
}

/** Which of this session's mistakes are old friends: similar struggles in earlier sessions + the matching note. */
export async function recurringStruggles(sessionId: string): Promise<Recurring[]> {
  if (state !== 'ready') return [];
  await writes; // let this session's last attempts land in the index first
  const mine = buildAttemptDocs(readEvents().filter((e) => e.sessionId === sessionId));
  const seen = new Set<string>();
  const out: Recurring[] = [];
  for (const d of mine) {
    if (seen.has(d.momentText) || seen.size >= 6) continue;
    seen.add(d.momentText);
    const { problemText, said, topic, lessonId, skill } = d.payload;
    const [earlier, notes] = await Promise.all([
      similarStruggles({ problemText, skill, said, topic, excludeSessionId: sessionId, limit: 4, minScore: 0.55, timeoutMs: 1500 }),
      searchNotes(d.momentText, topic, 4, 1500),
    ]);
    // among the misconception notes that match this mistake, prefer the best-established one (seen most often)
    const note = (notes ?? []).filter((n) => n.note.kind === 'misconception' && n.score >= 0.3).sort((a, b) => b.note.seen - a.note.seen || b.score - a.score)[0] ?? null;
    if (!earlier.length && !note) continue;
    out.push({ said, problemText, lessonId, earlier, sessions: new Set(earlier.map((e) => e.sessionId)).size, note });
  }
  return out.sort((a, b) => b.sessions - a.sessions || b.earlier.length - a.earlier.length);
}
