// Agentic tutor: per child turn Claude (sonnet) runs a short tool-use loop (recall_memory, get_strategy_advice,
// show_component, check_answer, check_step, write_memory, speak). Guardrails stay in code: the hidden answer is
// never sent, speech + UI + trace pass the answer-leak guard, the bandit is rewarded for the style actually used.
import type Anthropic from '@anthropic-ai/sdk';
import { MOCK, MODEL_TUTOR } from './config.js';
import type { HintLevel, HintStyle, MemoryNote, TraceStep, TutorReply, UIEvent, UISpec } from './contract.js';
import { adviseStyle, rewardStyle, STYLES } from './bandit.js';
import { lessonContext, type StoredLesson } from './curriculum.js';
import { approxEq, checkAnswer, extractNumbers, mentionsAnswerAnywhere, saidCorrectAnswer, textLeaks, uiLeaks } from './guard.js';
import { createMessage, textOf } from './llm.js';
import { interests, mergeNotes, recallNotes } from './memory.js';
import { profileLine } from './profile.js';
import { brainPrompt, markRecipeUsed, peekPreparedScene } from './brain.js';
import { mockAlreadySolved, mockHint, mockLessonHint, mockPraise } from './mock.js';
import { evalExpression } from './problem.js';
import type { ProblemState } from './state.js';
import { logEvent } from './store.js';
import { UI_SPEC_DOC, validateUISpec } from './uispec.js';
import { synthesize } from './voice.js';

export type Outcome = 'solved' | 'correct_step' | 'wrong' | 'dont_know' | 'just_tell_me' | 'other';
type Assessable = Exclude<Outcome, 'solved'>;

const LEVEL_DESC: Record<HintLevel, string> = {
  1: 'L1 Question: ask a guiding question about the story ("What does the story tell us?").',
  2: 'L2 Concept reminder: remind the child of the one idea/rule they need (use the lesson\'s method), then ask them to try.',
  3: 'L3 Visual: use a GenUI component (show_component) and ask the child to look at / interact with it.',
  4: 'L4 Simpler twin: pose the same kind of problem with small, different numbers and ask them to solve that first.',
  5: 'L5 Worked first step: do ONLY the first step for them and ask them to do the rest. Never the final step.',
};
const STYLE_DESC: Record<HintStyle, string> = {
  verbal: 'verbal: plain, clear words.',
  visual: 'visual: draw it! Call show_component with a fitting component.',
  story: "story: wrap the hint in a tiny story or analogy, ideally using the child's interests.",
  'smaller-numbers': 'smaller-numbers: illustrate with the same situation using smaller, friendlier numbers.',
};

const FALLBACK_L1 = "Let's look at the story together again. What does the problem tell us, and what does it want us to find?";
const MAX_ITER = 4;

const nextLevel = (cur: HintLevel, o: Outcome): HintLevel =>
  o === 'wrong' || o === 'dont_know' || o === 'just_tell_me' ? (Math.min(cur + 1, 5) as HintLevel) : cur;
const isProgress = (o: Outcome) => o === 'solved' || o === 'correct_step';
const clampLevel = (n: number): HintLevel => Math.min(5, Math.max(1, Math.round(n))) as HintLevel;
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Fast code-side classification. 'ambiguous*' => the agent assesses (live) or treat as wrong/other (mock). */
function classify(text: string, ui: UIEvent | undefined, p: ProblemState): Outcome | 'ambiguous_numeric' | 'ambiguous' {
  const t = text.toLowerCase();
  if (t && saidCorrectAnswer(t, p.answer)) return 'solved';
  if (/\b(just |please )?(tell|give|say)( me)?( the| what the)? answer\b|\bwhat('?s| is) the answer\b|\bjust tell me\b/.test(t)) return 'just_tell_me';
  if (/\b(i )?(don'?t|do not|dont) know\b|\bdunno\b|\bno idea\b|\bnot sure\b|\bi'?m stuck\b|\bi can'?t\b|\bhelp( me)?\b/.test(t)) return 'dont_know';
  if (ui) {
    const d = ui.data ?? {};
    const nums = Object.values(d).filter((v): v is number => typeof v === 'number');
    const shaded = typeof d.shaded === 'number' ? d.shaded : null;
    const of = typeof d.of === 'number' ? d.of : typeof d.denominator === 'number' ? d.denominator : null;
    const ratioHit = shaded !== null && of ? approxEq(shaded / of, p.answer.value) : false;
    if (ratioHit || (shaded === null && nums.some((n) => approxEq(n, p.answer.value)))) return 'correct_step';
  }
  if (/\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|third)\b/.test(t)) return 'ambiguous_numeric';
  return 'ambiguous';
}

function interestKeyword(notes: MemoryNote[]): string | undefined {
  for (const n of notes) {
    const m = n.text.match(/loves?\s+([a-z][a-z ]{1,30}?)(?:\s+[—–-]|[.,;!]|$)/i);
    if (m) return m[1].trim();
  }
  return undefined;
}

/** "a/b ± c/b" problem and the child answered (a±c)/(b+b): the classic adds-denominators mistake. */
function addsDenominators(p: ProblemState, transcript: string): string | null {
  const m = p.answer.expression.match(/^\s*(\d+)\s*\/\s*(\d+)\s*([+-])\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!m || m[2] !== m[5]) return null;
  const [a, b, op, c, d] = [Number(m[1]), Number(m[2]), m[3], Number(m[4]), Number(m[5])];
  const top = op === '+' ? a + c : a - c;
  const ms = extractNumbers(transcript);
  if (!ms.length || !approxEq(ms[ms.length - 1].value, top / (b + d))) return null;
  return `Adds the denominators too (${a}/${b} ${op} ${c}/${d} → ${top}/${b + d}).`;
}

// ---------------- agent context + tools ----------------

interface Advice { style: HintStyle; mean: number; level: HintLevel; outcome: Assessable }

interface AgentCtx {
  p: ProblemState;
  lesson: StoredLesson | null;
  mode: 'turn' | 'intro';
  transcript: string;
  uiEvent?: UIEvent;
  known: Assessable | null; // code classification, if confident
  trace: TraceStep[];
  advice: Advice | null;
  ui: UISpec | null;
  speech: { text: string; style?: string; level?: number; reason?: string } | null;
  checkedCorrect: boolean;
}

const TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: 'recall_memory',
    description: 'Look up what we remember about this child (misconceptions, what helps, interests) relevant to a query. Cheap; call it in parallel with get_strategy_advice.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Keywords, e.g. "denominators adding" or "interests".' } }, required: ['query'] },
  },
  {
    name: 'get_strategy_advice',
    description: "Get the app's advice for this turn: the hint style sampled by the learning bandit and the hint-ladder level. Pass your assessment of the child's latest message. Call it EVERY turn.",
    input_schema: {
      type: 'object',
      properties: {
        child_outcome: {
          type: 'string',
          enum: ['correct_step', 'wrong', 'dont_know', 'just_tell_me', 'other'],
          description: 'correct_step = correct partial step/reasoning; wrong = incorrect attempt; dont_know = stuck; just_tell_me = asks for the answer; other = chit-chat/unclear/first look at the problem.',
        },
      },
      required: ['child_outcome'],
    },
  },
  {
    name: 'show_component',
    description: `Show an interactive visual on the child's screen (replaces the current one). ${UI_SPEC_DOC}\nThe visual must show the given situation or a step, NEVER the final answer.`,
    input_schema: { type: 'object', properties: { spec: { type: 'object', description: 'The UI spec object.' } }, required: ['spec'] },
  },
  {
    name: 'check_answer',
    description: 'Check a final value the child proposed against the hidden answer (server-side). Returns correct / close / wrong.',
    input_schema: {
      type: 'object',
      properties: { value: { type: 'string', description: 'Number or expression, e.g. "1/2", "0.5", "12".' }, unit: { type: 'string' } },
      required: ['value'],
    },
  },
  {
    name: 'check_step',
    description: 'Evaluate a partial step the child did (mathjs), e.g. "20 / 4" or "3 - 1". Returns its value.',
    input_schema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
  },
  {
    name: 'write_memory',
    description: 'Save one short note about the child right now (only for something new and useful next time: a misconception, an interest, what helped).',
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['misconception', 'works', 'doesnt-work', 'interest', 'mastered'] }, text: { type: 'string', description: 'One short sentence.' } },
      required: ['kind', 'text'],
    },
  },
  {
    name: 'speak',
    description: 'Say your reply to the child. This ENDS your turn. style/level = what you actually used; if they differ from get_strategy_advice, give a short reason.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What you say out loud (1-2 short sentences, ends with one question).' },
        style: { type: 'string', enum: STYLES },
        level: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        override_reason: { type: 'string', description: 'Why you did not follow the advice (e.g. "she loves football, a story will land"). Empty if you followed it.' },
      },
      required: ['text', 'style', 'level'],
    },
  },
];

function ensureAdvice(ctx: AgentCtx, claimed?: Assessable): Advice {
  if (ctx.advice) return ctx.advice;
  const outcome: Assessable = ctx.mode === 'intro' ? 'other' : ctx.known ?? claimed ?? 'other';
  const { style, mean } = adviseStyle(ctx.p.topic);
  const level = nextLevel(ctx.p.level, outcome);
  ctx.advice = { style, mean, level, outcome };
  ctx.trace.push({ kind: 'strategy', text: `Bandit suggests ${style} (${pct(mean)}) · ladder L${level}` });
  return ctx.advice;
}

function runTool(ctx: AgentCtx, name: string, input: Record<string, unknown>): { out: string; isError?: boolean } {
  const { p } = ctx;
  switch (name) {
    case 'recall_memory': {
      const q = String(input.query ?? '');
      const notes = recallNotes(`${q} ${ctx.lesson?.skill ?? ''}`, p.topic, 4);
      ctx.trace.push({ kind: 'recall', text: notes.length ? `Recalled: ${short(notes[0].text, 50)}${notes.length > 1 ? ` (+${notes.length - 1})` : ''}` : 'Recalled: nothing yet' });
      return { out: notes.length ? notes.map((n) => `- [${n.kind}, seen ${n.seen}x] ${n.text}`).join('\n') : 'No notes yet.' };
    }
    case 'get_strategy_advice': {
      const claimed = String(input.child_outcome ?? 'other') as Assessable;
      const a = ensureAdvice(ctx, ['correct_step', 'wrong', 'dont_know', 'just_tell_me', 'other'].includes(claimed) ? claimed : 'other');
      return {
        out: `Bandit style: ${a.style} (${pct(a.mean)} success with this child so far). ${STYLE_DESC[a.style]}\nLadder level: ${a.level}. ${LEVEL_DESC[a.level]}\nFollow this unless you have a good reason (then pass style/level/override_reason to speak; level may change by at most 1).`,
      };
    }
    case 'show_component': {
      const spec = validateUISpec(input.spec);
      if (!spec) return { out: 'Invalid spec, not shown. Fix it to match the documented shape.', isError: true };
      if (uiLeaks(spec, p.answer, { problemText: p.text })) {
        ctx.trace.push({ kind: 'draw', text: `Rejected ${spec.type}: it would show the answer` });
        return { out: 'Rejected: this visual shows the final answer. Show the starting situation or a step instead.', isError: true };
      }
      ctx.ui = spec;
      const label = spec.type === 'Scene' ? spec.title ?? `${spec.steps.length}-step scene` : 'caption' in spec ? spec.caption : undefined;
      ctx.trace.push({ kind: 'draw', text: `Drew ${spec.type}${label ? `: ${short(label, 40)}` : ''}` });
      return { out: 'Shown on screen.' };
    }
    case 'check_answer': {
      const value = String(input.value ?? '');
      const r = checkAnswer(value, typeof input.unit === 'string' ? input.unit : undefined, p.answer);
      const childSaidIt = mentionsAnswerAnywhere(ctx.transcript, p.answer);
      if (r === 'correct' && childSaidIt) {
        ctx.checkedCorrect = true;
        ctx.trace.push({ kind: 'check', text: `Checked ${short(value, 20)} → correct!` });
        return { out: 'correct — the child solved it! Praise them warmly (you may repeat their answer) and ask if they want another problem.' };
      }
      ctx.trace.push({ kind: 'check', text: r === 'correct' ? 'Checked a value (kept secret)' : `Checked ${short(value, 20)} → ${r}` });
      return { out: r === 'correct' ? 'correct (but the child has not said it — do NOT reveal it)' : r };
    }
    case 'check_step': {
      const expr = String(input.expression ?? '');
      const v = evalExpression(expr);
      if (v === null) return { out: 'Could not evaluate that expression.', isError: true };
      const final = approxEq(v, p.answer.value);
      const shown = Number(v.toFixed(4));
      ctx.trace.push({ kind: 'check', text: `Checked step ${short(expr, 24)} → ${shown}` });
      return { out: `${expr} = ${shown}${final ? ' (this IS the final answer: do not say it unless the child already did)' : ''}` };
    }
    case 'write_memory': {
      const kind = String(input.kind ?? '') as MemoryNote['kind'];
      const text = String(input.text ?? '').trim();
      if (!text || !['misconception', 'works', 'doesnt-work', 'interest', 'mastered'].includes(kind)) return { out: 'Invalid note.', isError: true };
      mergeNotes([{ topic: kind === 'interest' ? 'any' : p.topic, kind, text }]);
      ctx.trace.push({ kind: 'memory', text: `Saved note: ${short(text, 50)}` });
      return { out: 'Saved.' };
    }
    case 'speak': {
      ctx.speech = {
        text: String(input.text ?? '').trim(),
        style: typeof input.style === 'string' ? input.style : undefined,
        level: typeof input.level === 'number' ? input.level : undefined,
        reason: typeof input.override_reason === 'string' ? input.override_reason.trim() : undefined,
      };
      return { out: 'Said.' };
    }
    default:
      return { out: `Unknown tool ${name}`, isError: true };
  }
}

/** Final style/level: the advice, unless the agent overrode it with a reason (level within ±1). */
function resolveStrategy(ctx: AgentCtx): { style: HintStyle; level: HintLevel } {
  const a = ensureAdvice(ctx);
  const sp = ctx.speech;
  let style = a.style;
  let level = a.level;
  const wantStyle = sp?.style && (STYLES as string[]).includes(sp.style) ? (sp.style as HintStyle) : a.style;
  const wantLevel = typeof sp?.level === 'number' ? clampLevel(Math.min(a.level + 1, Math.max(a.level - 1, sp.level))) : a.level;
  if ((wantStyle !== a.style || wantLevel !== a.level) && sp?.reason) {
    style = wantStyle;
    level = ctx.mode === 'intro' ? a.level : wantLevel;
    const what = [wantStyle !== a.style ? wantStyle : null, level !== a.level ? `L${level}` : null].filter(Boolean).join(' · ');
    if (what) ctx.trace.push({ kind: 'override', text: `Override → ${what}: ${short(sp.reason, 50)}` });
  }
  return { style, level };
}

function systemPrompt(p: ProblemState, lesson: StoredLesson | null): string {
  const ans = `${p.answer.value}${p.answer.unit ? ` ${p.answer.unit}` : ''} (computed as ${p.answer.expression})`;
  const lessonBlock = lesson
    ? `\nTHE LESSON THIS PROBLEM PRACTISES (teach with THIS method and wording; the child learned it from their textbook):
Lesson: ${lesson.title} (${lesson.sourcePages ?? 'textbook'})
Skill: ${lesson.skill}
Textbook method: ${lesson.methodNote}
Common mistakes to watch for: ${lesson.commonMistakes.join(' | ') || '-'}
Lesson explanation the child read: ${lesson.explanation.replace(/\n+/g, ' ')}
Worked example: ${lesson.workedExample.replace(/\n+/g, ' / ')}
Textbook excerpt: ${lesson.sourceExcerpt}\n`
    : '';
  return `You are Nudge, a warm, playful voice math tutor for a primary-school child (age 6-10). You help them solve ONE problem by themselves.
${profileLine()}

THE PROBLEM: ${p.text}
Asks: ${p.question}
Topic: ${p.topic}
SECRET ANSWER (for your reasoning only): ${ans}
${lessonBlock}
ABSOLUTE RULE: never say the final answer or anything that gives it away: not the number, not an equivalent fraction or decimal, not the number in words, not number+unit, not "it's half". Never do the last step. If the child asks you to just tell them, kindly say you won't, then give the hint. Only after the child has said the correct answer themselves may you repeat it while praising.

HINT LADDER:
${Object.values(LEVEL_DESC).join('\n')}

HINT STYLES:
${Object.values(STYLE_DESC).join('\n')}

HOW YOU WORK EACH TURN (be fast, at most 2 steps):
1. In ONE message, call get_strategy_advice (with your assessment of the child's message) together with recall_memory, and check_answer / check_step if the child said a number or a step.
2. In ONE message, call show_component if the style is visual or the level is 3 (optional otherwise), write_memory only if you noticed something new and important, and speak. speak ends the turn. Always reply through speak, never as plain text.
You may override the advised style (or level by 1) when memory gives you a good reason; then say why in override_reason.

${brainPrompt(p.topic)}

VISUALS: prefer an animated Scene (2-4 steps) that builds the idea one step at a time; reuse your recipes when they fit. A visual is your best tool to keep a distractible child's attention: when the child is stuck, unsure or off-topic, show something they can touch (Counters, FractionPie, Slider, Choice).

HOW TO SPEAK: read aloud by text-to-speech. 1-2 short sentences (max ~35 words), simple words, warm, end with ONE question. No markdown, emojis, lists or LaTeX. Write fractions in words ("three quarters").`;
}

async function runAgent(ctx: AgentCtx, task: string): Promise<void> {
  const convo = ctx.p.history.map((h) => `${h.role === 'tutor' ? 'Nudge' : 'Child'}: ${h.text}`).join('\n') || '(nothing yet)';
  const obs = ctx.uiEvent
    ? `\nObservation from the screen: the child interacted with the ${ctx.uiEvent.component} (action "${ctx.uiEvent.action}", data ${JSON.stringify(ctx.uiEvent.data)}).`
    : '';
  const heard = ctx.mode === 'intro' ? '' : `\n\nThe child just said: "${ctx.transcript || '(nothing, only touched the screen)'}"${obs}`;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: 'user', content: `Conversation so far:\n${convo}${heard}\n\nYOUR TASK: ${task}` },
  ];
  const system = systemPrompt(ctx.p, ctx.lesson);
  for (let i = 0; i < MAX_ITER && !ctx.speech; i++) {
    const last = i === MAX_ITER - 1;
    const msg = await createMessage({
      model: MODEL_TUTOR,
      max_tokens: 6000,
      output_config: { effort: 'low' },
      system,
      tools: TOOLS,
      ...(last ? { tool_choice: { type: 'none' as const } } : {}),
      messages,
    });
    const uses = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) {
      const text = plainSpeech(msg);
      if (text) ctx.speech = { text };
      break;
    }
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const r = runTool(ctx, u.name, (u.input ?? {}) as Record<string, unknown>);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: r.out, ...(r.isError ? { is_error: true } : {}) });
    }
    if (ctx.speech) break; // speak ends the turn, no extra round trip
    messages.push({ role: 'assistant', content: msg.content });
    messages.push({ role: 'user', content: results });
  }
}

/** Text from a tool-less call; unwraps a speak call the model wrote as text (no tools were offered). */
function plainSpeech(msg: Anthropic.Beta.Messages.BetaMessage): string {
  const t = textOf(msg);
  const m = t.match(/<parameter name="text">([\s\S]*?)<\/parameter>/);
  return (m ? m[1] : t.replace(/<\/?[a-z_]+[^>]*>/gi, '')).trim();
}
const NO_TOOLS = ' No tools are available for this reply: answer with the plain spoken text only.';

/** One rewrite attempt for a reply that leaked the answer (no tools, short). */
async function rewriteWithoutLeak(ctx: AgentCtx, draft: string): Promise<string> {
  try {
    const msg = await createMessage({
      model: MODEL_TUTOR,
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: systemPrompt(ctx.p, ctx.lesson),
      messages: [{ role: 'user', content: `Your draft reply gave away the answer:\n"${draft}"\nRewrite it so it contains neither the answer nor any equivalent form (no number, fraction, decimal or word for it). Keep the same hint idea and end with one question.${NO_TOOLS}` }],
    });
    return plainSpeech(msg);
  } catch (e) {
    console.warn('[tutor] rewrite failed:', (e as Error).message);
    return '';
  }
}

/** Guard every trace line too (the trace is shown to the child). Strategy lines are code-built (style, bandit %, level). */
function safeTrace(p: ProblemState, trace: TraceStep[]): TraceStep[] {
  return trace.map((s) => (s.kind !== 'strategy' && textLeaks(s.text, p.answer, { problemText: p.text }) ? { kind: s.kind, text: s.kind === 'check' ? 'Checked a step (result kept secret)' : 'Step hidden (would reveal the answer)' } : s));
}

// ---------------- mock agent (scripted, same tools) ----------------

function mockAgent(ctx: AgentCtx, cls: ReturnType<typeof classify>, warmupMessage?: string): void {
  const { p } = ctx;
  runTool(ctx, 'recall_memory', { query: ctx.mode === 'intro' ? 'interests' : `${ctx.transcript} mistakes` });
  const outcome: Assessable = cls === 'ambiguous_numeric' ? 'wrong' : cls === 'ambiguous' || cls === 'solved' ? 'other' : cls;
  runTool(ctx, 'get_strategy_advice', { child_outcome: outcome });
  const a = ctx.advice!;
  if (cls === 'ambiguous_numeric') {
    const ms = extractNumbers(ctx.transcript);
    if (ms.length) runTool(ctx, 'check_answer', { value: String(Number(ms[ms.length - 1].value.toFixed(4))) });
    const mis = addsDenominators(p, ctx.transcript);
    if (mis) runTool(ctx, 'write_memory', { kind: 'misconception', text: mis });
  }
  const interest = interestKeyword(interests());
  let style = a.style;
  let reason = '';
  if (style === 'verbal' && interest) {
    style = 'story';
    reason = `loves ${interest}`;
  }
  let text: string;
  let ui: UISpec | null;
  if (ctx.lesson) {
    ({ text, ui } = mockLessonHint({ mode: ctx.mode, outcome, level: a.level, style, p, lesson: ctx.lesson, interest, warmupMessage }));
  } else if (ctx.mode === 'intro') {
    text = FALLBACK_L1;
    ui = style === 'visual' ? p.starterVisual : null;
  } else {
    ({ text, ui } = mockHint({ outcome, level: a.level, style, starterVisual: p.starterVisual, interest }));
  }
  if (ui) runTool(ctx, 'show_component', { spec: ui });
  runTool(ctx, 'speak', { text, style, level: a.level, override_reason: reason });
}

// ---------------- public API ----------------

export interface TurnResult { reply: TutorReply; solved: boolean }

async function finish(text: string, ui: UISpec | null, hint: TutorReply['hint'], trace: TraceStep[]): Promise<TutorReply> {
  return { text, audioBase64: await synthesize(text), ui, hint, trace };
}

/** Bandit credit assignment: progress within the next 2 child turns after a hint => alpha+1, else beta+1. */
function updateBandit(p: ProblemState, progress: boolean): void {
  const keep = [];
  for (const h of p.pendingHints) {
    h.turnsSeen += 1;
    if (progress || h.turnsSeen >= 2) {
      rewardStyle(p.topic, h.style, progress);
      logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'bandit', topic: p.topic, style: h.style, level: h.level, reward: progress ? 1 : 0 });
    } else keep.push(h);
  }
  p.pendingHints = keep;
}

/** Called at session end: unresolved hints that got at least one child turn without progress count as failures. */
export function flushPendingHints(p: ProblemState): void {
  for (const h of p.pendingHints) {
    if (h.turnsSeen >= 1) {
      rewardStyle(p.topic, h.style, false);
      logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'bandit', topic: p.topic, style: h.style, level: h.level, reward: 0 });
    }
  }
  p.pendingHints = [];
}

/** Guard speech + UI: regenerate once (live), then template. Returns safe text/ui. */
async function guardReply(ctx: AgentCtx, text: string, ui: UISpec | null): Promise<{ text: string; ui: UISpec | null }> {
  const { p } = ctx;
  const lc = { problemText: p.text };
  if (uiLeaks(ui, p.answer, lc)) ui = null;
  if (text && !textLeaks(text, p.answer, lc)) return { text, ui };
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'leak_blocked', topic: p.topic, text });
  ctx.trace.push({ kind: 'verify', text: text ? 'Guard: draft gave the answer away → rewriting' : 'Guard: empty draft → fallback' });
  if (text && !MOCK) {
    const retry = await rewriteWithoutLeak(ctx, text);
    if (retry && !textLeaks(retry, p.answer, lc)) return { text: retry, ui };
  }
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'leak_blocked', topic: p.topic, text, fallback: true });
  const withQ = `${p.question} ${FALLBACK_L1}`;
  return { text: textLeaks(withQ, p.answer, lc) ? FALLBACK_L1 : withQ, ui };
}

/** Intro reply for a photo problem (L1 question from the solver, bandit-picked style). */
export async function introReply(p: ProblemState, introText: string): Promise<TutorReply> {
  const ctx: AgentCtx = { p, lesson: null, mode: 'intro', transcript: '', known: null, trace: [], advice: null, ui: null, speech: null, checkedCorrect: false };
  ctx.trace.push({ kind: 'read', text: `Read the photo: ${short(p.text, 50)}` });
  ctx.trace.push({ kind: 'verify', text: p.answer.verified ? 'Solved it privately · mathjs agrees' : 'Solved it privately (mathjs could not confirm)' });
  const { style, level } = ensureAdvice(ctx);
  const safe = await guardReply(ctx, introText, style === 'visual' ? p.starterVisual : null);
  if (safe.ui) ctx.trace.push({ kind: 'draw', text: `Drew ${safe.ui.type}` });
  ctx.trace.push({ kind: 'speak', text: `Asked an L${level} opening question` });
  return commitHint(p, ctx, safe.text, safe.ui, style, level, true);
}

/** Intro reply for a curriculum practice problem: the agent references the lesson's method. */
export async function lessonIntro(p: ProblemState, warmupMessage?: string): Promise<TutorReply> {
  const lesson = lessonContext(p.lessonId);
  const ctx: AgentCtx = { p, lesson, mode: 'intro', transcript: '', known: null, trace: [], advice: null, ui: null, speech: null, checkedCorrect: false };
  if (lesson) ctx.trace.push({ kind: 'read', text: `Lesson "${short(lesson.title, 40)}" (${lesson.sourcePages ?? 'textbook'})` });
  if (warmupMessage) ctx.trace.push({ kind: 'plan', text: 'Warm-up planned after last session' });
  if (MOCK) mockAgent(ctx, 'ambiguous', warmupMessage);
  else {
    try {
      await runAgent(ctx, (warmupMessage ? `This is the WARM-UP the planner prepared after last session. Start with this message (you may rephrase it): "${warmupMessage}" Then ` : 'This is a NEW practice problem from the lesson. ') + 'Introduce it: in one short sentence connect it to what we learned in the lesson (the textbook method, without solving), retell the problem simply, and ask ONE easy L1 opening question. Call get_strategy_advice (child_outcome "other") and recall_memory first; show the starting situation with show_component if the style is visual.');
    } catch (e) {
      console.warn('[tutor] lesson intro agent failed:', (e as Error).message);
    }
  }
  const { style, level } = resolveStrategy(ctx);
  const draft = ctx.speech?.text || `Let's practise ${lesson?.title ?? 'this'}! ${p.text} What does the problem tell us?`;
  const safe = await guardReply(ctx, draft, ctx.ui ?? (style === 'visual' ? p.starterVisual : null));
  ctx.trace.push({ kind: 'speak', text: `Asked an L${level} opening question (${style})` });
  return commitHint(p, ctx, safe.text, safe.ui, style, level, true);
}

function commitHint(p: ProblemState, ctx: AgentCtx, text: string, ui: UISpec | null, style: HintStyle, level: HintLevel, intro: boolean): Promise<TutorReply> {
  p.level = level;
  if (!intro) p.hintsGiven += 1;
  p.pendingHints.push({ style, level, turnsSeen: 0 });
  p.history.push({ role: 'tutor', text });
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'hint', topic: p.topic, level, style, text, ui: ui?.type ?? null, ...(intro ? { intro: true } : {}), lessonId: p.lessonId ?? null });
  return finish(text, ui, { level, style }, safeTrace(p, ctx.trace));
}

export async function tutorTurn(p: ProblemState, transcript: string, uiEvent?: UIEvent): Promise<TurnResult> {
  if (p.solved) {
    const text = MOCK ? mockAlreadySolved() : 'You already solved this one, superstar! Ready for the next problem?';
    return { reply: await finish(text, null, null, []), solved: true };
  }
  const cls = classify(transcript, uiEvent, p);
  p.history.push({ role: 'child', text: transcript || `(touched the ${uiEvent?.component ?? 'screen'})` });
  const lesson = lessonContext(p.lessonId);

  if (cls === 'solved') {
    return solvedReply(p, transcript, uiEvent, [{ kind: 'check', text: `Heard "${short(transcript, 24)}" → correct!` }]);
  }

  const known: Assessable | null = cls === 'ambiguous' || cls === 'ambiguous_numeric' ? null : cls;
  const ctx: AgentCtx = { p, lesson, mode: 'turn', transcript, uiEvent, known, trace: [], advice: null, ui: null, speech: null, checkedCorrect: false };
  const t0 = Date.now();
  if (MOCK) mockAgent(ctx, cls);
  else {
    try {
      await runAgent(ctx, 'Help the child with the next small step.');
    } catch (e) {
      console.warn('[tutor] agent failed:', (e as Error).message);
    }
  }
  if (ctx.checkedCorrect) return solvedReply(p, transcript, uiEvent, ctx.trace, ctx.speech?.text);

  const outcome: Outcome = ensureAdvice(ctx, cls === 'ambiguous_numeric' ? 'wrong' : 'other').outcome;
  const { style, level } = resolveStrategy(ctx);
  let ui = ctx.ui;
  // visual style / L3 must show something: the explainer scene prepared ahead of time,
  // else the problem's (or lesson's) starter visual
  if (!ui && (style === 'visual' || level === 3)) {
    const prepared = await peekPreparedScene(p.id);
    ui = prepared && !uiLeaks(prepared, p.answer, { problemText: p.text }) ? prepared : p.starterVisual ?? lesson?.visual ?? null;
    if (ui && !uiLeaks(ui, p.answer, { problemText: p.text })) ctx.trace.push({ kind: 'draw', text: ui === prepared ? `Played my prepared scene "${prepared.title ?? 'Show me'}"` : `Drew ${ui.type}` });
  }
  if (ui?.type === 'Scene') markRecipeUsed(ui);
  const safe = await guardReply(ctx, ctx.speech?.text ?? '', ui);
  ctx.trace.push({ kind: 'speak', text: `Gave an L${level} hint (${style})` });
  if (!MOCK) console.log(`[tutor] turn ${Date.now() - t0} ms, ${ctx.trace.length} steps`);

  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'attempt', topic: p.topic, text: transcript, outcome, uiEvent: uiEvent ?? null, lessonId: p.lessonId ?? null });
  updateBandit(p, isProgress(outcome));
  return { reply: await commitHint(p, ctx, safe.text, safe.ui, style, level, false), solved: false };
}

async function solvedReply(p: ProblemState, transcript: string, uiEvent: UIEvent | undefined, trace: TraceStep[], draft?: string): Promise<TurnResult> {
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'attempt', topic: p.topic, text: transcript, outcome: 'solved', uiEvent: uiEvent ?? null, lessonId: p.lessonId ?? null });
  updateBandit(p, true);
  p.solved = true;
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'solved', topic: p.topic, hints: p.hintsGiven, level: p.level, lessonId: p.lessonId ?? null, practiceId: p.practiceId ?? null });
  let text = draft ?? '';
  if (!text) {
    if (MOCK) text = mockPraise();
    else {
      try {
        const msg = await createMessage({
          model: MODEL_TUTOR,
          max_tokens: 1500,
          output_config: { effort: 'low' },
          system: systemPrompt(p, lessonContext(p.lessonId)),
          messages: [{ role: 'user', content: `The child just said: "${transcript}" — that is the CORRECT final answer. Praise them warmly and specifically for how they worked it out (you may repeat their answer now), then ask if they want to try another problem.${NO_TOOLS}` }],
        });
        text = plainSpeech(msg);
      } catch (e) {
        console.warn('[tutor] praise generation failed:', (e as Error).message);
      }
      text ||= mockPraise();
    }
  }
  p.history.push({ role: 'tutor', text });
  return { reply: await finish(text, null, null, [...trace, { kind: 'speak', text: 'Praised the child' }]), solved: true };
}
