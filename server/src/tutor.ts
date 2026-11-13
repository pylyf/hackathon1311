// Tutor orchestration: code decides the hint level (ladder) and style (bandit); Claude writes the words.
import type Anthropic from '@anthropic-ai/sdk';
import { MOCK, MODEL_TUTOR } from './config.js';
import type { HintLevel, HintStyle, MemoryNote, TutorReply, UIEvent, UISpec } from './contract.js';
import { pickStyle, rewardStyle } from './bandit.js';
import { checkAnswer, mentionsAnswerAnywhere, saidCorrectAnswer, textLeaks, uiLeaks, approxEq } from './guard.js';
import { createMessage, textOf } from './llm.js';
import { interests, relevantNotes } from './memory.js';
import { profileLine } from './profile.js';
import { brainPrompt, markRecipeUsed, peekPreparedScene } from './brain.js';
import { mockAlreadySolved, mockHint, mockPraise } from './mock.js';
import type { ProblemState } from './state.js';
import { logEvent } from './store.js';
import { UI_SPEC_DOC, validateUISpec } from './uispec.js';
import { synthesize } from './voice.js';

export type Outcome = 'solved' | 'correct_step' | 'wrong' | 'dont_know' | 'just_tell_me' | 'other';

const LEVEL_DESC: Record<HintLevel, string> = {
  1: 'L1 Question: ask a guiding question about the story ("What does the story tell us?").',
  2: 'L2 Concept reminder: remind the child of the one idea/rule they need, then ask them to try.',
  3: 'L3 Visual: use a GenUI component (show_component) and ask the child to look at / interact with it.',
  4: 'L4 Simpler twin: pose the same kind of problem with small, different numbers and ask them to solve that first.',
  5: 'L5 Worked first step: do ONLY the first step for them and ask them to do the rest. Never the final step.',
};
const STYLE_DESC: Record<HintStyle, string> = {
  verbal: 'verbal: plain, clear words.',
  visual: 'visual: draw it! You MUST call show_component with a fitting component.',
  story: "story: wrap the hint in a tiny story or analogy, ideally using the child's interests.",
  'smaller-numbers': 'smaller-numbers: illustrate with the same situation using smaller, friendlier numbers.',
};

const FALLBACK_L1 = "Let's look at the story together again. What does the problem tell us, and what does it want us to find?";

const nextLevel = (cur: HintLevel, o: Outcome): HintLevel =>
  o === 'wrong' || o === 'dont_know' || o === 'just_tell_me' ? (Math.min(cur + 1, 5) as HintLevel) : cur;

const isProgress = (o: Outcome) => o === 'solved' || o === 'correct_step';

/** Fast code-side classification. 'ambiguous' => let Claude assess (real mode) or treat as wrong/other (mock). */
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

// ---------------- Claude tutor call ----------------

const TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: 'show_component',
    description: `Show an interactive visual on the child's screen (replaces the current one). ${UI_SPEC_DOC}\nThe visual must show the given situation or a step, NEVER the final answer.`,
    input_schema: {
      type: 'object',
      properties: { spec: { type: 'object', description: 'The UI spec object.' } },
      required: ['spec'],
    },
  },
  {
    name: 'check_answer',
    description: "Check a value the child proposed against the hidden answer (server-side). Returns correct / close / wrong. Use it whenever the child states a final answer you are unsure about.",
    input_schema: {
      type: 'object',
      properties: {
        value: { type: 'string', description: 'The child\'s value as a number or expression, e.g. "1/2", "0.5", "12".' },
        unit: { type: 'string', description: 'Unit the child used, if any.' },
      },
      required: ['value'],
    },
  },
  {
    name: 'assess_turn',
    description: "Classify the child's latest message. Call this FIRST when asked to. The result tells you which hint level and style to use.",
    input_schema: {
      type: 'object',
      properties: {
        outcome: {
          type: 'string',
          enum: ['correct_step', 'wrong', 'dont_know', 'just_tell_me', 'other'],
          description: 'correct_step = a correct partial step or correct reasoning toward the answer; wrong = an incorrect attempt; dont_know = stuck; just_tell_me = asks for the answer; other = chit-chat / unclear.',
        },
      },
      required: ['outcome'],
    },
  },
];

function systemPrompt(p: ProblemState, notes: MemoryNote[]): string {
  const ans = `${p.answer.value}${p.answer.unit ? ` ${p.answer.unit}` : ''} (computed as ${p.answer.expression})`;
  const mem = notes.map((n) => `- [${n.kind}, ${n.topic}, seen ${n.seen}x] ${n.text}`).join('\n') || '- (nothing yet)';
  return `You are Nudge, a warm, playful voice math tutor for a primary-school child (age 6-10). You help them solve ONE homework problem by themselves.
${profileLine()}

THE PROBLEM: ${p.text}
Asks: ${p.question}
Topic: ${p.topic}
SECRET ANSWER (for your reasoning only): ${ans}

ABSOLUTE RULE: never say the final answer or anything that gives it away: not the number, not an equivalent fraction or decimal, not the number in words, not number+unit, not "it's half". Never do the last step. If the child asks you to just tell them, kindly say you won't, then give the hint. Only after the child has said the correct answer themselves may you repeat it while praising.

HINT LADDER (the app tells you which level to use each turn):
${Object.values(LEVEL_DESC).join('\n')}

HINT STYLES (the app tells you which style to use):
${Object.values(STYLE_DESC).join('\n')}

HOW TO SPEAK: your reply is read aloud by text-to-speech. 1-2 short sentences (max ~35 words), simple words, warm and encouraging, end with ONE question for the child. No markdown, no emojis, no lists, no LaTeX. Write fractions in words ("three quarters"). Do not describe what you are doing ("I'll show you a picture") at length; just talk to the child.

WHAT WE KNOW ABOUT THIS CHILD (use it; interests are great for story hints):
${mem}

${brainPrompt(p.topic)}

VISUALS: prefer an animated Scene (2-4 steps) that builds the idea one step at a time; reuse your recipes when they fit. A visual is your best tool to keep a distractible child's attention: when the child is stuck, unsure or off-topic, show something they can touch (Counters, FractionPie, Slider, Choice).

TOOLS: show_component draws a visual; check_answer verifies a value the child said; assess_turn classifies the child's message when the app asks you to. Write your spoken reply as plain text after any tool calls.`;
}

interface GenResult { text: string; ui: UISpec | null; assessed?: Outcome; checkedCorrect: boolean }

async function claudeGenerate(opts: {
  p: ProblemState;
  transcript: string;
  uiEvent?: UIEvent;
  mode: 'hint' | 'praise';
  level: HintLevel;
  style: HintStyle;
  needAssess: boolean;
  strict?: boolean;
}): Promise<GenResult> {
  const { p } = opts;
  const notes = relevantNotes(p.topic, 8);
  const convo = p.history.map((h) => `${h.role === 'tutor' ? 'Nudge' : 'Child'}: ${h.text}`).join('\n') || '(nothing yet)';
  const obs = opts.uiEvent
    ? `\nObservation from the screen: the child interacted with the ${opts.uiEvent.component} (action "${opts.uiEvent.action}", data ${JSON.stringify(opts.uiEvent.data)}).`
    : '';
  const lvlUp = Math.min(opts.level + 1, 5) as HintLevel;
  let task: string;
  if (opts.mode === 'praise') {
    task = 'The child just gave the CORRECT final answer. Praise them warmly and specifically for how they worked it out (you may repeat their answer now), then ask if they want to try another problem. Do not call any tools.';
  } else if (opts.needAssess) {
    task = `First call assess_turn to classify the child's latest message (use check_answer first if they stated a final answer). The tool result tells you the hint level and style. For reference: correct_step/other -> level ${opts.level}, wrong/dont_know/just_tell_me -> level ${lvlUp}.`;
  } else {
    task = `Give a hint at level ${opts.level} (${LEVEL_DESC[opts.level]}) in style ${STYLE_DESC[opts.style]}`;
  }
  if (opts.mode === 'hint' && !opts.needAssess && (opts.style === 'visual' || opts.level === 3)) task += ' You MUST call show_component this turn.';
  if (opts.strict) task += '\nIMPORTANT: your previous draft gave away the answer. Rewrite it so that neither the text nor the visual contains the answer or any equivalent form. Ask a question instead.';

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    {
      role: 'user',
      content: `Conversation so far:\n${convo}\n\nThe child just said: "${opts.transcript || '(nothing, only touched the screen)'}"${obs}\n\nYOUR TASK: ${task}`,
    },
  ];

  const res: GenResult = { text: '', ui: null, checkedCorrect: false };
  let level = opts.level;
  const style = opts.style;
  for (let i = 0; i < 5; i++) {
    const msg = await createMessage({
      model: MODEL_TUTOR,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: systemPrompt(p, notes),
      tools: opts.mode === 'praise' ? undefined : TOOLS,
      messages,
    });
    const text = textOf(msg);
    if (text) res.text = text;
    const uses = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
    if (msg.stop_reason !== 'tool_use' || uses.length === 0) break;
    messages.push({ role: 'assistant', content: msg.content });
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      let out: string;
      let isError = false;
      if (u.name === 'show_component') {
        const spec = validateUISpec(input.spec);
        if (!spec) { out = 'Invalid spec, not shown. Fix it to match the documented shape.'; isError = true; }
        else if (uiLeaks(spec, p.answer, { problemText: p.text })) { out = 'Rejected: this visual shows the final answer. Show the starting situation or a step instead.'; isError = true; }
        else { res.ui = spec; out = 'Shown on screen.'; }
      } else if (u.name === 'check_answer') {
        const r = checkAnswer(String(input.value ?? ''), typeof input.unit === 'string' ? input.unit : undefined, p.answer);
        const childSaidIt = mentionsAnswerAnywhere(opts.transcript, p.answer);
        if (r === 'correct' && childSaidIt) {
          res.checkedCorrect = true;
          out = 'correct — the child solved it! Praise them warmly (you may repeat their answer) and ask if they want another problem.';
        } else {
          out = r === 'correct' ? 'correct (but the child has not said it — do NOT reveal it)' : r;
        }
      } else if (u.name === 'assess_turn') {
        const o = String(input.outcome ?? 'other') as Outcome;
        const valid: Outcome[] = ['correct_step', 'wrong', 'dont_know', 'just_tell_me', 'other'];
        res.assessed = valid.includes(o) ? o : 'other';
        level = nextLevel(opts.level, res.assessed);
        const needUi = style === 'visual' || level === 3;
        out = `Use hint level ${level}: ${LEVEL_DESC[level]} Style: ${STYLE_DESC[style]}${needUi ? ' You MUST call show_component.' : ''}`;
      } else {
        out = `Unknown tool ${u.name}`;
        isError = true;
      }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: out, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  return res;
}

// ---------------- public API ----------------

export interface TurnResult { reply: TutorReply; solved: boolean }

async function finish(text: string, ui: UISpec | null, hint: TutorReply['hint']): Promise<TutorReply> {
  return { text, audioBase64: await synthesize(text), ui, hint };
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

/** Intro reply for a fresh problem (L1 question, bandit-picked style). */
export async function introReply(p: ProblemState, introText: string): Promise<TutorReply> {
  const style = pickStyle(p.topic);
  const level: HintLevel = p.level;
  let text = introText;
  if (textLeaks(text, p.answer, { problemText: p.text })) {
    logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'leak_blocked', topic: p.topic, text });
    text = `${p.question} ${FALLBACK_L1}`;
    if (textLeaks(text, p.answer, { problemText: p.text })) text = FALLBACK_L1;
  }
  const ui = style === 'visual' && !uiLeaks(p.starterVisual, p.answer, { problemText: p.text }) ? p.starterVisual : null;
  p.pendingHints.push({ style, level, turnsSeen: 0 });
  p.history.push({ role: 'tutor', text });
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'hint', topic: p.topic, level, style, text, ui: ui?.type ?? null, intro: true });
  return finish(text, ui, { level, style });
}

export async function tutorTurn(p: ProblemState, transcript: string, uiEvent?: UIEvent): Promise<TurnResult> {
  if (p.solved) {
    const text = MOCK ? mockAlreadySolved() : 'You already solved this one, superstar! Snap a photo of the next problem when you are ready.';
    return { reply: await finish(text, null, null), solved: true };
  }
  const ctx = { problemText: p.text };
  const cls = classify(transcript, uiEvent, p);
  p.history.push({ role: 'child', text: transcript || `(touched the ${uiEvent?.component ?? 'screen'})` });

  // ---- solved ----
  if (cls === 'solved') {
    return solvedReply(p, transcript, uiEvent);
  }

  const style = pickStyle(p.topic);
  let outcome: Outcome;
  let level: HintLevel;
  let text: string;
  let ui: UISpec | null = null;

  if (MOCK) {
    outcome = cls === 'ambiguous_numeric' ? 'wrong' : cls === 'ambiguous' ? 'other' : cls;
    level = nextLevel(p.level, outcome);
    const mem = interests();
    ({ text, ui } = mockHint({ outcome, level, style, starterVisual: p.starterVisual, interest: interestKeyword(mem) }));
  } else {
    const known = cls !== 'ambiguous' && cls !== 'ambiguous_numeric';
    const lvl0 = known ? nextLevel(p.level, cls as Outcome) : p.level;
    const gen = await claudeGenerate({ p, transcript, uiEvent, mode: 'hint', level: lvl0, style, needAssess: !known });
    if (gen.checkedCorrect) return solvedReply(p, transcript, uiEvent, gen.text);
    outcome = known ? (cls as Outcome) : gen.assessed ?? (cls === 'ambiguous_numeric' ? 'wrong' : 'other');
    level = known ? lvl0 : nextLevel(p.level, outcome);
    text = gen.text;
    ui = gen.ui;
    // answer-leak guard: regenerate once, then fall back to a template L1 question
    if (!text || textLeaks(text, p.answer, ctx) || uiLeaks(ui, p.answer, ctx)) {
      logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'leak_blocked', topic: p.topic, text });
      const retry = await claudeGenerate({ p, transcript, uiEvent, mode: 'hint', level, style, needAssess: false, strict: true });
      text = retry.text;
      ui = retry.ui;
      if (!text || textLeaks(text, p.answer, ctx) || uiLeaks(ui, p.answer, ctx)) {
        logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'leak_blocked', topic: p.topic, text, fallback: true });
        text = FALLBACK_L1;
        ui = null;
      }
    }
    // visual style / L3 must show something: the prepared explainer scene, else the starter visual
    if (!ui && (style === 'visual' || level === 3)) {
      const prepared = await peekPreparedScene(p.id);
      if (prepared && !uiLeaks(prepared, p.answer, ctx)) ui = prepared;
      else if (!uiLeaks(p.starterVisual, p.answer, ctx)) ui = p.starterVisual;
    }
    if (ui?.type === 'Scene') markRecipeUsed(ui);
  }
  // final safety net (also covers mock templates)
  if (textLeaks(text, p.answer, ctx)) text = FALLBACK_L1;
  if (uiLeaks(ui, p.answer, ctx)) ui = null;

  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'attempt', topic: p.topic, text: transcript, outcome, uiEvent: uiEvent ?? null });
  updateBandit(p, isProgress(outcome));
  p.level = level;
  p.hintsGiven += 1;
  p.pendingHints.push({ style, level, turnsSeen: 0 });
  p.history.push({ role: 'tutor', text });
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'hint', topic: p.topic, level, style, text, ui: ui?.type ?? null, scene: ui?.type === 'Scene' ? ui.title ?? 'untitled' : undefined });
  return { reply: await finish(text, ui, { level, style }), solved: false };
}

async function solvedReply(p: ProblemState, transcript: string, uiEvent: UIEvent | undefined, draft?: string): Promise<TurnResult> {
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'attempt', topic: p.topic, text: transcript, outcome: 'solved', uiEvent: uiEvent ?? null });
  updateBandit(p, true);
  p.solved = true;
  logEvent({ sessionId: p.sessionId, problemId: p.id, type: 'solved', topic: p.topic, hints: p.hintsGiven, level: p.level });
  let text = draft ?? '';
  if (!text) {
    if (MOCK) text = mockPraise();
    else {
      try {
        text = (await claudeGenerate({ p, transcript, uiEvent, mode: 'praise', level: p.level, style: 'verbal', needAssess: false })).text;
      } catch (e) {
        console.warn('[tutor] praise generation failed:', (e as Error).message);
      }
      text ||= mockPraise();
    }
  }
  p.history.push({ role: 'tutor', text });
  return { reply: await finish(text, null, null), solved: true };
}
