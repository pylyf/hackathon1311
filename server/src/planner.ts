// Planner agent (runs at /session/end after reflection): reads lesson results + memory + curriculum and re-plans:
// lesson status/mastery, nextLessonId and a NEW mathjs-verified warm-up problem targeting the biggest misconception.
import { randomUUID } from 'node:crypto';
import { MOCK, MODEL_SOLVER } from './config.js';
import type { LessonStatus, MemoryNote, SessionEndResponse, TraceStep } from './contract.js';
import { loadCurriculum, publicWarmup, withQuestion, saveCurriculum, type StoredCurriculum, type StoredLesson, type StoredProblem, type StoredWarmUp } from './curriculum.js';
import { textLeaks } from './guard.js';
import { createJson } from './llm.js';
import { loadMemory } from './memory.js';
import { verifyAnswer } from './problem.js';
import { logEvent, readEvents } from './store.js';
import { describeStruggle, recurringStruggles, type Recurring } from './vector/semantic.js';

type Plan = NonNullable<SessionEndResponse['plan']>;

interface LessonResult { lessonId: string; attempted: number; solved: number; hints: number[]; wrong: string[]; unsolved: number; answerSecs: number[] }

function lessonResults(sessionId: string): Map<string, LessonResult> {
  const events = readEvents().filter((e) => e.sessionId === sessionId);
  const problemLesson = new Map<string, string>();
  for (const e of events) if (e.type === 'problem' && e.problemId && typeof e.lessonId === 'string') problemLesson.set(e.problemId, e.lessonId);
  const res = new Map<string, LessonResult>();
  const get = (id: string) => res.get(id) ?? (res.set(id, { lessonId: id, attempted: 0, solved: 0, hints: [], wrong: [], unsolved: 0, answerSecs: [] }), res.get(id)!);
  const solvedProblems = new Set<string>();
  const asked = new Map<string, number>(); // problemId -> when the tutor last spoke
  for (const e of events) {
    const lid = e.problemId ? problemLesson.get(e.problemId) : undefined;
    if (!lid) continue;
    const r = get(lid);
    if (e.type === 'hint') asked.set(e.problemId!, Date.parse(e.ts));
    if (e.type === 'attempt' && asked.has(e.problemId!)) {
      const sec = (Date.parse(e.ts) - asked.get(e.problemId!)!) / 1000; // how long the child needed to answer
      if (sec > 0 && sec <= 600) r.answerSecs.push(Math.round(sec));
    }
    if (e.type === 'problem') r.attempted += 1;
    if (e.type === 'attempt' && e.outcome === 'wrong' && e.text) r.wrong.push(String(e.text));
    if (e.type === 'solved') { r.solved += 1; r.hints.push(Number(e.hints ?? 0)); solvedProblems.add(e.problemId!); }
  }
  for (const [pid, lid] of problemLesson) {
    const hadTurns = events.some((e) => e.problemId === pid && e.type === 'attempt');
    if (hadTurns && !solvedProblems.has(pid)) get(lid).unsolved += 1;
  }
  return res;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const lessonNo = (c: StoredCurriculum, id: string) => `Lesson ${c.lessons.findIndex((l) => l.id === id) + 1}`;

// ---------------- rule-based warm-up generator (mock + live fallback) ----------------

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function templateProblem(l: StoredLesson): { text: string; question: string; expr: string } | null {
  const s = `${l.skill} ${l.title}`.toLowerCase();
  if (/(add|subtract|take away|plus|minus)/.test(s) && /fraction|denominator|bottom/.test(s)) {
    const d = rnd(5, 9), a = rnd(1, d - 2), b = rnd(1, d - 1 - a);
    return Math.random() < 0.6
      ? { text: `${a}/${d} + ${b}/${d} = ?`, question: `What is ${a}/${d} plus ${b}/${d}?`, expr: `${a}/${d} + ${b}/${d}` }
      : { text: `${a + b}/${d} - ${b}/${d} = ?`, question: `What is ${a + b}/${d} take away ${b}/${d}?`, expr: `${a + b}/${d} - ${b}/${d}` };
  }
  if (/equivalent|same amount/.test(s)) {
    const b = rnd(2, 5), a = rnd(1, b - 1), k = rnd(2, 4);
    return { text: `Find the missing number: ${a}/${b} = ?/${b * k}`, question: `What number goes on top of the ${b * k}?`, expr: `${a} * (${b * k} / ${b})` };
  }
  if (/of an amount|of a number|amount/.test(s)) {
    const d = pick([2, 3, 4, 5]), a = rnd(1, d - 1), n = d * rnd(2, 6);
    const thing = pick(['stickers', 'marbles', 'cards', 'shells']);
    return { text: `There are ${n} ${thing}. ${a}/${d} of them are gold. How many ${thing} are gold?`, question: `How many ${thing} are gold?`, expr: `${n} / ${d} * ${a}` };
  }
  if (/fraction|whole|part/.test(s)) {
    const d = rnd(4, 9), a = rnd(1, d - 1);
    return { text: `A cake is cut into ${d} equal pieces. You eat ${a}. What fraction of the cake did you eat?`, question: 'What fraction of the cake did you eat?', expr: `${a}/${d}` };
  }
  return null;
}

function ruleWarmup(c: StoredCurriculum, target: StoredLesson, mis: MemoryNote | undefined): StoredWarmUp {
  const existing = new Set(c.lessons.flatMap((l) => l.problems.map((p) => p.text)));
  let problem: StoredProblem | null = null;
  for (let i = 0; i < 5 && !problem; i++) {
    const t = templateProblem(target);
    if (!t || existing.has(t.text)) continue;
    const v = verifyAnswer(t.expr, Number.NaN);
    if (v.computed === null) continue;
    problem = {
      id: `warmup-${randomUUID().slice(0, 8)}`, text: t.text, topic: target.topic, skill: target.skill, difficulty: 1, question: t.question,
      answer: { value: v.computed, unit: null, expression: t.expr, verified: true }, starterVisual: null,
    };
  }
  if (!problem) {
    const src = target.problems.find((p) => !p.solved) ?? target.problems[0];
    problem = { ...src, id: `warmup-${randomUUID().slice(0, 8)}`, solved: false };
  }
  const tip = target.methodNote.match(/^[^.!?;]*[.!?;]/)?.[0]?.replace(/;$/, '.') ?? '';
  const safeTip = tip && !textLeaks(tip, problem.answer, { problemText: problem.text }) ? ` Remember: ${tip.charAt(0).toLowerCase()}${tip.slice(1)}` : '';
  void mis;
  return { lessonId: target.id, message: `Last time ${target.title.toLowerCase()} was a bit tricky.${safeTip} Quick warm-up?`, problem };
}

// ---------------- planner ----------------

interface LiveOut {
  lessons: { id: string; status: LessonStatus; mastery: number; reason: string }[];
  nextLessonId: string;
  warmup: { lessonId: string; message: string; text: string; question: string; answerValue: number; answerUnit: string; answerExpression: string; targets: string };
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['lessons', 'nextLessonId', 'warmup'],
  properties: {
    lessons: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'status', 'mastery', 'reason'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['ready', 'in-progress', 'review', 'mastered'] },
          mastery: { type: 'number', description: '0..1' },
          reason: { type: 'string', description: 'Very short, e.g. "solved 2 alone".' },
        },
      },
    },
    nextLessonId: { type: 'string' },
    warmup: {
      type: 'object', additionalProperties: false,
      required: ['lessonId', 'message', 'text', 'question', 'answerValue', 'answerUnit', 'answerExpression', 'targets'],
      properties: {
        lessonId: { type: 'string' },
        message: { type: 'string', description: 'Friendly one-liner to the child, e.g. "Last time adding fractions was tricky. Quick warm-up?" Must not contain the answer.' },
        text: { type: 'string', description: 'A NEW practice problem (not in the curriculum yet) with one numeric answer, ending with its question (no "shade the bar" instructions).' },
        question: { type: 'string' },
        answerValue: { type: 'number' },
        answerUnit: { type: 'string' },
        answerExpression: { type: 'string', description: 'mathjs expression with plain numbers computing answerValue.' },
        targets: { type: 'string', description: 'Which misconception it targets, short.' },
      },
    },
  },
};

export async function planNext(sessionId: string): Promise<Plan | undefined> {
  const c = loadCurriculum();
  if (!c) return undefined;
  const results = lessonResults(sessionId);
  const trace: TraceStep[] = [];
  const changes: string[] = [];
  if (results.size === 0) {
    return { changes, trace: [{ kind: 'plan', text: 'No lesson practice this session — plan unchanged' }], nextLessonId: c.nextLessonId, warmup: publicWarmup(c.warmup) };
  }
  const memory = loadMemory();
  // Long-term memory: which of today's mistakes already showed up in earlier sessions (semantic search in Qdrant)?
  const recurring: Recurring[] = await recurringStruggles(sessionId).catch(() => []);
  const comeback = recurring.find((r) => r.earlier.length > 0);
  const mis = recurring.find((r) => r.note)?.note?.note ?? memory.filter((n) => n.kind === 'misconception').sort((a, b) => b.seen - a.seen)[0];
  const totalProblems = [...results.values()].reduce((a, r) => a + r.attempted, 0);
  trace.push({ kind: 'read', text: `Read session: ${totalProblems} problem${totalProblems === 1 ? '' : 's'} in ${results.size} lesson${results.size === 1 ? '' : 's'}` });
  if (comeback) trace.push({ kind: 'recall', text: `Long-term memory: today's mistake also came up in ${comeback.sessions} earlier session${comeback.sessions === 1 ? '' : 's'}` });
  if (mis) trace.push({ kind: 'recall', text: `Memory: ${mis.text.slice(0, 50)} (seen ${mis.seen}x)` });
  const recurringInfo = recurring.slice(0, 4).map((r) => ({
    today: { problem: r.problemText, childSaid: r.said || '(no answer)' }, lessonId: r.lessonId,
    earlierSessionsWithSimilarStruggle: r.sessions, similarEarlierMoments: r.earlier.slice(0, 3).map(describeStruggle), matchingNote: r.note?.note.text ?? null,
  }));

  const apply = (id: string, status: LessonStatus, mastery: number, why: string) => {
    const l = c.lessons.find((x) => x.id === id);
    if (!l) return;
    const m = Math.round(Math.min(1, Math.max(0, mastery)) * 100) / 100;
    if (l.status !== status) {
      changes.push(`${lessonNo(c, id)} → ${status}${why ? ` (${why})` : ''}`);
      trace.push({ kind: 'plan', text: `${lessonNo(c, id)} → ${status}${why ? `: ${why}` : ''}` });
    }
    else if (Math.abs(l.mastery - m) >= 0.05) changes.push(`${lessonNo(c, id)} mastery ${Math.round(l.mastery * 100)}% → ${Math.round(m * 100)}%`);
    l.status = status;
    l.mastery = m;
  };

  let warm: StoredWarmUp | null = null;
  let next: string | null = c.nextLessonId;

  if (!MOCK) {
    try {
      const lessonsInfo = c.lessons.map((l) => ({
        id: l.id, title: l.title, skill: l.skill, status: l.status, mastery: l.mastery, methodNote: l.methodNote,
        commonMistakes: l.commonMistakes, problems: l.problems.map((p) => p.text),
      }));
      const out = await createJson<LiveOut>({
        model: MODEL_SOLVER,
        max_tokens: 6000,
        output_config: { effort: 'low' },
        system: `You plan the next practice session for ONE primary-school child in a voice math tutor that follows a textbook curriculum.
Given lesson results from the session that just ended, the child's memory notes and the curriculum, decide:
- lessons: status + mastery for each lesson the session gives evidence about (mastered = solved with little or no help; review = needed many hints, gave wrong answers or did not finish; in-progress = making progress). Lessons without evidence: omit.
- nextLessonId: what the child should do next (review before new material, otherwise the first lesson not mastered).
- warmup: ONE NEW short practice problem (not already in the curriculum) for the start of next session that targets the biggest misconception, solvable with the lesson's textbook method, with a single numeric answer and a mathjs answerExpression. message: a warm one-liner to the child, no answer.
Evidence to weigh: answerSecs = seconds the child needed for each answer (long answers = unsure, even when right). "Recurring struggles" come from a semantic search over ALL earlier sessions: a struggle that keeps coming back matters more than a one-off slip, so aim the warm-up (and "review") at it, and build the warm-up so it needs exactly the idea the child keeps missing; where a kind of hint HELPED before, the message may nod to it (e.g. "let's picture the pieces").`,
        messages: [{
          role: 'user',
          content: `Curriculum:\n${JSON.stringify(lessonsInfo)}\n\nSession results per lesson (hints = hints needed per solved problem; wrong = the child's wrong answers):\n${JSON.stringify([...results.values()])}\n\nMemory notes:\n${JSON.stringify(memory.map(({ topic, kind, text, seen }) => ({ topic, kind, text, seen })))}\n\nRecurring struggles (semantic matches from earlier sessions):\n${recurringInfo.length ? JSON.stringify(recurringInfo) : 'none found'}`,
        }],
        schema: SCHEMA,
      });
      for (const u of out.lessons) apply(u.id, u.status, u.mastery, u.reason);
      if (c.lessons.some((l) => l.id === out.nextLessonId)) next = out.nextLessonId;
      const target = c.lessons.find((l) => l.id === out.warmup.lessonId) ?? c.lessons.find((l) => l.id === next) ?? c.lessons[0];
      const w = out.warmup;
      const v = verifyAnswer(w.answerExpression, w.answerValue);
      trace.push({ kind: 'generate', text: `Wrote warm-up "${w.text.slice(0, 40)}" → ${w.targets.slice(0, 40)}` });
      const answer = { value: v.value, unit: w.answerUnit.trim() || null, expression: w.answerExpression, verified: v.verified };
      if (v.verified && w.text.trim() && !textLeaks(w.message, answer, { problemText: w.text })) {
        trace.push({ kind: 'verify', text: 'Warm-up verified with mathjs' });
        warm = {
          lessonId: target.id, message: w.message.trim(),
          problem: { id: `warmup-${randomUUID().slice(0, 8)}`, text: withQuestion(w.text, w.question), topic: target.topic, skill: target.skill, difficulty: 1, question: w.question.trim(), answer, starterVisual: null },
        };
      } else {
        trace.push({ kind: 'verify', text: `Warm-up failed mathjs check (${v.computed ?? 'error'}) → rule-based one` });
      }
    } catch (e) {
      console.warn('[planner] live planning failed, using rules:', (e as Error).message);
      trace.push({ kind: 'plan', text: 'Planner model unavailable → rule-based plan' });
    }
  }

  if (MOCK || changes.length === 0 && !warm) {
    // rule-based equivalent
    for (const r of results.values()) {
      const l = c.lessons.find((x) => x.id === r.lessonId);
      if (!l) continue;
      const h = avg(r.hints);
      if (r.solved > 0 && h <= 1 && r.unsolved === 0) {
        const m = l.mastery + 0.45;
        apply(l.id, m >= 0.8 ? 'mastered' : 'in-progress', m, `solved ${r.solved} with ${h <= 0 ? 'no' : 'almost no'} help`);
      } else if (h >= 3 || r.unsolved > 0 || r.wrong.length >= 2) {
        apply(l.id, 'review', Math.max(0.1, l.mastery - 0.1), r.unsolved ? 'not finished yet' : `needed ${Math.round(h)} hints`);
      } else {
        apply(l.id, 'in-progress', l.mastery + 0.25, `solved ${r.solved} with a few hints`);
      }
    }
    next = (c.lessons.find((l) => l.status === 'review') ?? c.lessons.find((l) => l.status === 'in-progress') ?? c.lessons.find((l) => l.status !== 'mastered') ?? c.lessons[0]).id;
  }

  if (!warm) {
    // hardest lesson of the session: wrong answers, hints, unfinished problems, slow answers and mistakes that keep coming back
    const comebacks = (id: string) => recurring.filter((x) => x.lessonId === id).reduce((a, x) => a + x.sessions, 0);
    const struggle = (r: LessonResult) => r.wrong.length + avg(r.hints) + r.unsolved * 2 + (avg(r.answerSecs) >= 45 ? 1 : 0) + comebacks(r.lessonId);
    const worst = [...results.values()].sort((a, b) => struggle(b) - struggle(a))[0];
    const target = c.lessons.find((l) => l.id === worst?.lessonId) ?? c.lessons.find((l) => l.id === next) ?? c.lessons[0];
    warm = ruleWarmup(c, target, mis);
    trace.push({ kind: 'generate', text: `Wrote warm-up "${warm.problem.text.slice(0, 40)}" for ${lessonNo(c, target.id)}` });
    trace.push({ kind: 'verify', text: warm.problem.answer.verified ? 'Warm-up verified with mathjs' : 'Warm-up reused from the lesson' });
  }

  if (next !== c.nextLessonId) changes.push(`Next: ${lessonNo(c, next!)} · ${c.lessons.find((l) => l.id === next)?.title}`);
  c.nextLessonId = next;
  c.warmup = warm;
  changes.push(`New warm-up: ${warm.problem.text}`);
  trace.push({ kind: 'plan', text: `Next up: ${lessonNo(c, next!)}` });
  saveCurriculum(c);
  logEvent({ sessionId, type: 'plan', changes, nextLessonId: next, warmup: warm.problem.text });
  return { changes, trace, nextLessonId: next, warmup: publicWarmup(warm) };
}
