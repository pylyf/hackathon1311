// Curriculum builder agent: textbook chapter (PDF / photo) -> lessons + mathjs-verified practice problems.
// Runs as an async job; every agent step is appended to job.steps (TraceStep[]) so the app can show live progress.
// Hidden answers + source excerpts live only in data/curriculum.json; API responses go through publicCurriculum().
import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { MOCK, MODEL_SOLVER } from './config.js';
import type {
  Curriculum, Lesson, PracticeProblem, TextbookJobStatus, TextbookRequest, Topic, TraceStep, UISpec, WarmUp,
} from './contract.js';
import { uiLeaks } from './guard.js';
import { createJson } from './llm.js';
import { mockCurriculum } from './mockCurriculum.js';
import { verifyAnswer } from './problem.js';
import type { HiddenAnswer } from './state.js';
import { FILES, readJson, writeJson } from './store.js';
import { UI_SPEC_DOC, validateUISpec } from './uispec.js';

// ---------------- stored (server-only) shapes ----------------

export interface StoredProblem extends PracticeProblem {
  question: string;
  answer: HiddenAnswer;          // NEVER sent to the client
  starterVisual: UISpec | null;
  solved?: boolean;
}
export interface StoredLesson extends Omit<Lesson, 'problems'> {
  problems: StoredProblem[];
  commonMistakes: string[];
  sourceExcerpt: string;         // RAG-lite grounding for the tutor
}
export interface StoredWarmUp extends Omit<WarmUp, 'problem'> { problem: StoredProblem }
export interface StoredCurriculum extends Omit<Curriculum, 'lessons' | 'warmup'> {
  lessons: StoredLesson[];
  warmup: StoredWarmUp | null;
}

export function loadCurriculum(): StoredCurriculum | null {
  const c = readJson<StoredCurriculum | null>(FILES.curriculum, null);
  return c && Array.isArray(c.lessons) ? c : null;
}
export function saveCurriculum(c: StoredCurriculum): void {
  writeJson(FILES.curriculum, c);
}

// Whitelist copies: hidden fields can never slip through.
export function publicProblem(p: StoredProblem): PracticeProblem {
  return { id: p.id, text: p.text, topic: p.topic, skill: p.skill, difficulty: p.difficulty };
}
export function publicWarmup(w: StoredWarmUp | null): WarmUp | null {
  return w ? { message: w.message, lessonId: w.lessonId, problem: publicProblem(w.problem) } : null;
}
export function publicCurriculum(c: StoredCurriculum | null): Curriculum | null {
  if (!c) return null;
  return {
    id: c.id, title: c.title, source: c.source, createdAt: c.createdAt, nextLessonId: c.nextLessonId,
    warmup: publicWarmup(c.warmup),
    lessons: c.lessons.map((l) => ({
      id: l.id, title: l.title, topic: l.topic, skill: l.skill, summary: l.summary, explanation: l.explanation,
      workedExample: l.workedExample, methodNote: l.methodNote, sourcePages: l.sourcePages,
      ...(l.visual ? { visual: l.visual } : {}),
      problems: l.problems.map(publicProblem), status: l.status, mastery: l.mastery,
    })),
  };
}

export function findLesson(c: StoredCurriculum, lessonId: string): StoredLesson | undefined {
  return c.lessons.find((l) => l.id === lessonId);
}

/** Lesson grounding for the tutor's system prompt (RAG-lite: current lesson only). */
export function lessonContext(lessonId: string | undefined): StoredLesson | null {
  if (!lessonId) return null;
  const c = loadCurriculum();
  return c ? findLesson(c, lessonId) ?? null : null;
}

export function markLessonStarted(lessonId: string): void {
  const c = loadCurriculum();
  const l = c && findLesson(c, lessonId);
  if (!c || !l) return;
  if (l.status === 'ready' || l.status === 'locked') l.status = 'in-progress';
  saveCurriculum(c);
}

export function markPracticeSolved(practiceId: string): void {
  const c = loadCurriculum();
  if (!c) return;
  for (const l of c.lessons) for (const p of l.problems) if (p.id === practiceId) p.solved = true;
  if (c.warmup?.problem.id === practiceId) c.warmup.problem.solved = true;
  saveCurriculum(c);
}

// ---------------- jobs ----------------

interface Job { status: TextbookJobStatus['status']; steps: TraceStep[]; curriculum?: StoredCurriculum; error?: string }
const jobs = new Map<string, Job>();

export function startTextbookJob(req: TextbookRequest): string {
  const jobId = randomUUID();
  const job: Job = { status: 'running', steps: [] };
  jobs.set(jobId, job);
  const step = (kind: TraceStep['kind'], text: string) => {
    job.steps.push({ kind, text });
    console.log(`[curriculum ${jobId.slice(0, 6)}] ${kind}: ${text}`);
  };
  const t0 = Date.now();
  (MOCK ? buildMock(req, step) : buildLive(req, step))
    .then((c) => {
      saveCurriculum(c);
      job.curriculum = c;
      job.status = 'done';
      console.log(`[curriculum] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    })
    .catch((e: unknown) => {
      job.status = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      step('plan', `Failed: ${job.error}`);
      console.error('[curriculum] failed', e);
    });
  return jobId;
}

export function jobStatus(jobId: string): TextbookJobStatus | null {
  const j = jobs.get(jobId);
  if (!j) return null;
  return { status: j.status, steps: j.steps, ...(j.curriculum ? { curriculum: publicCurriculum(j.curriculum)! } : {}), ...(j.error ? { error: j.error } : {}) };
}

type Step = (kind: TraceStep['kind'], text: string) => void;
/** Make sure the problem text the child sees actually asks the question. */
export function withQuestion(text: string, question: string): string {
  const t = text.trim();
  const q = question.trim();
  return /\?\s*$/.test(t) || !q ? t : `${t} ${q.endsWith('?') ? q : `${q}?`}`;
}

/** Page count of a PDF (counts /Type /Page objects); null for images or unparsable files. */
function pdfPages(b64: string): number | null {
  try {
    const n = (Buffer.from(b64, 'base64').toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    return n || null;
  } catch {
    return null;
  }
}

const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ---------------- mock build ----------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function buildMock(req: TextbookRequest, step: Step): Promise<StoredCurriculum> {
  const c = mockCurriculum(req.fileName || 'textbook-fractions.pdf');
  c.id = randomUUID();
  step('read', `Reading ${c.source}…`);
  await sleep(700);
  step('read', `Read 3 pages: ${c.title}`);
  await sleep(500);
  step('plan', `Planned ${c.lessons.length} lessons: ${c.lessons.map((l) => l.title).join(', ')}`);
  for (const l of c.lessons) {
    await sleep(400);
    step('plan', `${l.sourcePages}: ${short(l.methodNote, 60)}`);
  }
  for (const l of c.lessons) {
    await sleep(500);
    step('generate', `Wrote "${l.title}" + ${l.problems.length} problems`);
  }
  await sleep(500);
  const all = c.lessons.flatMap((l) => l.problems);
  for (const l of c.lessons) l.problems = l.problems.filter((p) => p.answer.verified);
  const ok = c.lessons.flatMap((l) => l.problems).length;
  step('verify', `Verified ${ok}/${all.length} problems with mathjs`);
  step('generate', `Curriculum ready: ${c.lessons.length} lessons, ${ok} problems`);
  return c;
}

// ---------------- live build ----------------

interface ReadOut {
  isMathChapter: boolean;
  title: string;
  pagesRead: number;
  lessons: {
    title: string; topic: Topic; skill: string; summary: string; sourcePages: string;
    methodNote: string; commonMistakes: string[]; sourceExcerpt: string;
  }[];
}

const READ_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['isMathChapter', 'title', 'pagesRead', 'lessons'],
  properties: {
    isMathChapter: { type: 'boolean' },
    title: { type: 'string', description: 'Chapter title, e.g. "Chapter 5 · Fractions".' },
    pagesRead: { type: 'integer' },
    lessons: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'topic', 'skill', 'summary', 'sourcePages', 'methodNote', 'commonMistakes', 'sourceExcerpt'],
        properties: {
          title: { type: 'string', description: 'Kid-friendly lesson title.' },
          topic: { type: 'string', enum: ['word-problems', 'fractions', 'units'] },
          skill: { type: 'string', description: 'One skill, e.g. "add fractions with the same denominator".' },
          summary: { type: 'string', description: 'One sentence.' },
          sourcePages: { type: 'string', description: 'e.g. "p. 2, section 5.3".' },
          methodNote: { type: 'string', description: 'EXACTLY how the textbook explains/does it (its steps, its pictures, its wording), 1-3 sentences.' },
          commonMistakes: { type: 'array', items: { type: 'string' }, description: 'Mistakes the textbook warns about or that are typical for this skill.' },
          sourceExcerpt: { type: 'string', description: 'The relevant textbook text for this lesson, copied as written (max ~120 words).' },
        },
      },
    },
  },
};

interface GenOut {
  explanation: string;
  workedExample: string;
  visualJson: string;
  problems: { text: string; question: string; difficulty: number; answerValue: number; answerUnit: string; answerExpression: string; starterVisualJson: string }[];
}

const GEN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['explanation', 'workedExample', 'visualJson', 'problems'],
  properties: {
    explanation: { type: 'string' },
    workedExample: { type: 'string' },
    visualJson: { type: 'string' },
    problems: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['text', 'question', 'difficulty', 'answerValue', 'answerUnit', 'answerExpression', 'starterVisualJson'],
        properties: {
          text: { type: 'string' },
          question: { type: 'string' },
          difficulty: { type: 'integer', enum: [1, 2, 3] },
          answerValue: { type: 'number' },
          answerUnit: { type: 'string' },
          answerExpression: { type: 'string' },
          starterVisualJson: { type: 'string' },
        },
      },
    },
  },
};

const GEN_SYSTEM = `You write one lesson of a primary-school (age 6-10) math curriculum, grounded in a textbook chapter. English, simple words.
Write:
- explanation: a short kid-friendly written lesson (2-4 short paragraphs separated by a blank line) that teaches the skill EXACTLY the way the textbook does (same method, same steps, same pictures). Mention the common mistake gently.
- workedExample: one worked example, one step per line (separated by \\n). Use different numbers than the practice problems.
- visualJson: a UI spec (JSON string) illustrating the lesson's idea, or "".
- problems: exactly NUM practice problems, difficulty growing 1 -> 3. You may reuse the textbook's own exercises (kids get these as homework) and add similar ones.
  Every problem MUST have ONE numeric final answer (no "draw", no yes/no, no "write two fractions"). Fractions are fine (answerValue as decimal, e.g. 0.625 for 5/8).
  answerExpression: a mathjs expression with plain numbers that computes answerValue using the textbook's method (e.g. "24 / 3 * 2", "2/7 + 3/7").
  answerUnit: a mathjs unit name ("cm", "kg", "min") or "" (for apples, euros, pizza, pure numbers).
  text: the FULL problem statement the child sees, ending with the question (e.g. "... How much pizza did Mia eat?"). Never an instruction like "Shade the bar".
  question: what the problem asks, one short sentence, without the answer.
  starterVisualJson: a UI spec (JSON string) showing the GIVEN situation (never the result), or "".
${UI_SPEC_DOC}`;

async function buildLive(req: TextbookRequest, step: Step): Promise<StoredCurriculum> {
  const source = req.fileName || (req.mediaType === 'application/pdf' ? 'chapter.pdf' : 'chapter photo');
  const data = req.fileBase64.replace(/^data:[^;]+;base64,/, '');
  const fileBlock: Anthropic.Beta.Messages.BetaContentBlockParam = req.mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: req.mediaType, data } };

  // 1) read + plan (one opus call with the whole chapter)
  step('read', `Reading ${source}…`);
  const read = await createJson<ReadOut>({
    model: MODEL_SOLVER,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system: `You are a curriculum designer for a voice math tutor for primary-school children (age 6-10). You read a textbook chapter and split it into 3-5 lessons (one skill each, in the textbook's order). For each lesson record exactly how the textbook teaches it, so a tutor can use the same method. topic: "fractions" for anything about fractions, "units" for measurement/unit conversion, otherwise "word-problems". If the file is not a math textbook chapter, set isMathChapter=false and return empty lessons.`,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: 'Read this chapter and plan the lessons.' }] }],
    schema: READ_SCHEMA,
  });
  if (!read.isMathChapter || read.lessons.length === 0) throw new Error('This does not look like a math textbook chapter.');
  const plan = read.lessons.slice(0, 5);
  const pages = (req.mediaType === 'application/pdf' ? pdfPages(data) : 1) ?? read.pagesRead;
  step('read', `Read ${pages || '?'} page${pages === 1 ? '' : 's'}: ${read.title}`);
  step('plan', `Planned ${plan.length} lessons: ${plan.map((l) => l.title).join(', ')}`);
  for (const l of plan) step('plan', `${l.sourcePages}: ${short(l.methodNote, 60)}`);

  // 2) write each lesson + problems (parallel calls), 3) verify with mathjs, regenerate a lesson once if too few survive
  let total = 0;
  let verifiedCount = 0;
  const genLesson = async (l: ReadOut['lessons'][number], num: number, avoid: string[] = []) => createJson<GenOut>({
    model: MODEL_SOLVER,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system: GEN_SYSTEM.replace('NUM', String(num)),
    messages: [{
      role: 'user',
      content: `Chapter: ${read.title}\nLesson: ${l.title}\nSkill: ${l.skill}\nTopic: ${l.topic}\nTextbook method: ${l.methodNote}\nCommon mistakes: ${l.commonMistakes.join(' | ')}\nTextbook text (${l.sourcePages}):\n${l.sourceExcerpt}${avoid.length ? `\n\nDo NOT repeat these problems:\n${avoid.join('\n')}` : ''}`,
    }],
    schema: GEN_SCHEMA,
  });

  const toProblems = (lessonIdx: number, l: ReadOut['lessons'][number], out: GenOut): StoredProblem[] => {
    const kept: StoredProblem[] = [];
    for (const g of out.problems) {
      total += 1;
      const { value, verified, computed } = verifyAnswer(g.answerExpression, g.answerValue);
      if (!verified || !g.text.trim()) {
        step('verify', `Dropped "${short(g.text, 40)}": mathjs got ${computed ?? 'error'}, not ${Number(g.answerValue.toFixed(4))}`);
        continue;
      }
      verifiedCount += 1;
      const answer: HiddenAnswer = { value, unit: g.answerUnit.trim() || null, expression: g.answerExpression, verified };
      let starterVisual = g.starterVisualJson ? validateUISpec(g.starterVisualJson) : null;
      if (uiLeaks(starterVisual, answer, { problemText: g.text })) starterVisual = null;
      kept.push({
        id: `l${lessonIdx + 1}p${kept.length + 1}-${randomUUID().slice(0, 4)}`,
        text: withQuestion(g.text, g.question), topic: l.topic, skill: l.skill,
        difficulty: (Math.min(3, Math.max(1, Math.round(g.difficulty))) as 1 | 2 | 3),
        question: g.question.trim(), answer, starterVisual,
      });
    }
    return kept;
  };

  const lessons = await Promise.all(plan.map(async (l, i): Promise<StoredLesson> => {
    const out = await genLesson(l, 5);
    let problems = toProblems(i, l, out);
    step('generate', `Wrote "${l.title}" + ${out.problems.length} problems`);
    if (problems.length < 3) {
      step('generate', `Only ${problems.length} verified for "${l.title}", writing more…`);
      const more = await genLesson(l, 5 - problems.length, problems.map((p) => p.text));
      problems = [...problems, ...toProblems(i, l, more)];
    }
    const visual = out.visualJson ? validateUISpec(out.visualJson) : null;
    return {
      id: `l${i + 1}`, title: l.title, topic: l.topic, skill: l.skill, summary: l.summary,
      explanation: out.explanation.trim(), workedExample: out.workedExample.trim(), methodNote: l.methodNote,
      sourcePages: l.sourcePages, ...(visual ? { visual } : {}),
      problems, status: 'ready', mastery: 0, commonMistakes: l.commonMistakes, sourceExcerpt: l.sourceExcerpt,
    };
  }));

  const usable = lessons.filter((l) => l.problems.length > 0);
  step('verify', `Verified ${verifiedCount}/${total} problems with mathjs`);
  if (!usable.length) throw new Error('No verifiable practice problems could be generated.');
  step('generate', `Curriculum ready: ${usable.length} lessons, ${usable.reduce((a, l) => a + l.problems.length, 0)} problems`);
  return {
    id: randomUUID(), title: read.title, source, createdAt: new Date().toISOString(),
    lessons: usable, nextLessonId: usable[0].id, warmup: null,
  };
}
