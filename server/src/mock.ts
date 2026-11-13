// Deterministic canned behaviour used when ANTHROPIC_API_KEY is missing or MOCK=1.
// Bandit, memory and events still update for real.
import type { HintLevel, HintStyle, MemoryNote, Topic, UISpec } from './contract.js';
import type { NoteUpdate } from './memory.js';
import type { ParsedProblem } from './problem.js';
import type { StoredLesson } from './curriculum.js';
import type { ProblemState } from './state.js';
import type { NudgeEvent } from './store.js';

export function mockParseProblem(): ParsedProblem {
  return {
    text: 'Tom has 3/4 of a pizza and eats 1/4. How much is left?',
    topic: 'fractions',
    question: 'How much pizza is left?',
    quantities: [
      { name: 'pizza Tom has', value: '3/4', unit: 'pizza' },
      { name: 'pizza Tom eats', value: '1/4', unit: 'pizza' },
    ],
    answer: { value: 0.5, unit: null, expression: '3/4 - 1/4', verified: true },
    starterVisual: {
      type: 'FractionBars',
      caption: "Tom's pizza: tap a piece to take away the slice he eats",
      rows: [{ denominator: 4, shaded: 3, label: 'Tom has' }],
      interactive: true,
    },
    introText:
      'Tom has three quarters of a pizza, and then he eats one quarter of it. We need to find out how much pizza is left. Let\'s start: how much pizza does Tom have at the very beginning?',
  };
}

const LADDER: Record<HintLevel, string> = {
  1: 'Let\'s look at the story again. How much pizza does Tom have at the start, and how much does he eat?',
  2: 'Remember: when the bottom numbers are the same, they stay the same, and we only take away the top numbers. What is three quarters take away one quarter?',
  3: 'Look at the pizza bar! Tap one shaded piece to take away the slice Tom eats. How many pieces are still shaded?',
  4: 'Let\'s try a smaller one: if you have 3 cookies and eat 1, how many cookies are left? Pizza slices work the same way!',
  5: 'Here\'s the first step: Tom has 3 slices of 4 and eats 1 slice, so we do 3 take away 1 for the slices. How many quarters does he have now?',
};

const LEAD: Record<string, string> = {
  wrong: 'Good try, but not quite. ',
  dont_know: 'That\'s okay, let\'s work it out together. ',
  just_tell_me: 'I won\'t give away the answer, but I know you can find it! ',
  correct_step: 'Yes, nice thinking! ',
  other: '',
};

export function mockHint(opts: {
  outcome: string;
  level: HintLevel;
  style: HintStyle;
  starterVisual: UISpec | null;
  interest?: string;
}): { text: string; ui: UISpec | null } {
  const { outcome, level, style } = opts;
  let body = LADDER[level];
  if (style === 'smaller-numbers' && level < 4) body = LADDER[4];
  if (style === 'story') {
    const hook = opts.interest ? `Imagine Tom just got back from ${opts.interest}, hungry! ` : 'Imagine Tom is at a pizza party! ';
    body = `${hook}${body}`;
  }
  if (outcome === 'correct_step') body = 'Now tell me in your own words: how much pizza is left for Tom?';
  const wantsVisual = style === 'visual' || level === 3;
  const ui = wantsVisual ? opts.starterVisual : null;
  if (wantsVisual && level !== 3) body = `${body} You can use the pizza bar to help.`;
  return { text: `${LEAD[outcome] ?? ''}${body}`, ui };
}

export function mockPraise(): string {
  return 'Yes! That\'s exactly right, you worked it out all by yourself! Want to try another problem?';
}

export function mockAlreadySolved(): string {
  return 'You already solved this one, superstar! Snap a photo of the next problem when you\'re ready.';
}

/** Reflection without Claude: derive notes from the session's events. */
export function mockReflect(events: NudgeEvent[], _existing: MemoryNote[]): NoteUpdate[] {
  const notes: NoteUpdate[] = [];
  const byTopic = new Map<Topic, NudgeEvent[]>();
  for (const e of events) if (e.topic) byTopic.set(e.topic, [...(byTopic.get(e.topic) ?? []), e]);
  for (const [topic, evs] of byTopic) {
    const wrong = evs.filter((e) => e.type === 'attempt' && e.outcome === 'wrong').map((e) => `"${e.text}"`);
    if (wrong.length) notes.push({ topic, kind: 'misconception', text: `Sometimes gives a wrong first answer in ${topic} (e.g. ${wrong[0]}) — check each step.` });
    const rewards = new Map<HintStyle, [number, number]>();
    for (const e of evs) {
      if (e.type !== 'bandit' || !e.style) continue;
      const r = rewards.get(e.style) ?? [0, 0];
      r[e.reward ? 0 : 1] += 1;
      rewards.set(e.style, r);
    }
    for (const [style, [ok, bad]] of rewards) {
      if (ok > bad) notes.push({ topic, kind: 'works', text: `${style} hints help with ${topic}.` });
      else if (bad > ok) notes.push({ topic, kind: 'doesnt-work', text: `${style} hints don't help much with ${topic}.` });
    }
    const solved = evs.filter((e) => e.type === 'solved');
    if (solved.some((e) => (e.hints ?? 99) <= 1)) notes.push({ topic, kind: 'mastered', text: `Solved a ${topic} problem with almost no help.` });
  }
  return notes;
}

const firstSentence = (s: string) => (s.match(/^[^.!?]*[.!?]/)?.[0] ?? s).trim();

/** Generic ladder for curriculum problems, grounded in the lesson's method (mock mode). */
export function mockLessonHint(opts: {
  mode: 'turn' | 'intro';
  outcome: string;
  level: HintLevel;
  style: HintStyle;
  p: ProblemState;
  lesson: StoredLesson;
  interest?: string;
  warmupMessage?: string;
}): { text: string; ui: UISpec | null } {
  const { p, lesson, level, style, outcome } = opts;
  const visual = p.starterVisual ?? lesson.visual ?? null;
  const wantsVisual = style === 'visual' || level === 3;
  if (opts.mode === 'intro') {
    const hook = style === 'story' && opts.interest ? `Imagine you're at ${opts.interest} practice and this pops up! ` : '';
    if (opts.warmupMessage) return { text: `${opts.warmupMessage} Here it is: ${p.text} What does the problem tell us?`, ui: wantsVisual ? visual : null };
    const text = `Let's practise ${lesson.title.toLowerCase()}! ${hook}${firstSentence(lesson.summary)} Here is your problem: ${p.text} What does the problem tell us?`;
    return { text, ui: wantsVisual ? visual : null };
  }
  const ladder: Record<HintLevel, string> = {
    1: `Let's read it again together. ${p.question} What do we know already?`,
    2: `Remember our lesson: ${firstSentence(lesson.methodNote)} Can you try that first step?`,
    3: 'Look at the picture on your screen. What does it show you, and what should we do with it?',
    4: "Let's make it tiny first: try the very same idea with really small numbers. What would you do first?",
    5: `Here is how our worked example starts: ${firstSentence(lesson.workedExample.split(String.fromCharCode(10))[0].replace(/\.?$/, '.'))} Can you do the same with our numbers?`,
  };
  let body = ladder[level];
  if (style === 'smaller-numbers' && level < 4) body = ladder[4];
  if (style === 'story') body = `${opts.interest ? `Think of it like ${opts.interest}: every part counts. ` : 'Imagine sharing it with a friend. '}${body}`;
  if (outcome === 'correct_step') body = `Yes, that step is right! ${p.question} What comes next?`;
  if (wantsVisual && level !== 3 && visual) body = `${body} You can use the picture to help.`;
  return { text: `${LEAD[outcome] ?? ''}${body}`, ui: wantsVisual ? visual : null };
}
