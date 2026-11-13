// npm run seed — plausible demo history so the "What Nudge learned" panel looks alive.
// Overwrites data/bandit.json, data/memory.json, data/events.jsonl (sessions.json is cleared).
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { HintStyle, MemoryNote, Topic } from '../contract.js';
import { defaultBandit, saveBandit } from '../bandit.js';
import { saveMemory } from '../memory.js';
import { ensureDataDir, FILES, writeJson, type NudgeEvent } from '../store.js';
import { saveCurriculum } from '../curriculum.js';
import { mockCurriculum } from '../mockCurriculum.js';
import { verifyAnswer } from '../problem.js';

ensureDataDir();

const bandit = defaultBandit();
bandit.fractions = { verbal: [2, 6], visual: [9, 2], story: [4, 3], 'smaller-numbers': [3, 3] };
bandit['word-problems'] = { verbal: [3, 3], visual: [3, 2], story: [4, 2], 'smaller-numbers': [2, 2] };
bandit.units = { verbal: [2, 2], visual: [2, 1], story: [1, 2], 'smaller-numbers': [1, 1] };
saveBandit(bandit);

const day = 24 * 3600 * 1000;
const iso = (t: number) => new Date(t).toISOString();
const now = Date.now();

const memory: MemoryNote[] = [
  { id: randomUUID(), topic: 'fractions', kind: 'misconception', text: 'Adds denominators (1/4 + 1/4 = 2/8).', seen: 3, updatedAt: iso(now - 1 * day) },
  { id: randomUUID(), topic: 'fractions', kind: 'works', text: 'Fraction bars help: gets it after shading pieces.', seen: 2, updatedAt: iso(now - 1 * day) },
  { id: randomUUID(), topic: 'any', kind: 'interest', text: 'Loves football — use it in story hints.', seen: 2, updatedAt: iso(now - 2 * day) },
  { id: randomUUID(), topic: 'word-problems', kind: 'doesnt-work', text: 'Long verbal explanations lose attention; keep it short.', seen: 1, updatedAt: iso(now - 3 * day) },
];
saveMemory(memory);

// 3 past sessions, hints per solved problem going down: 5 -> 3 -> 2
const past: { daysAgo: number; problems: { topic: Topic; text: string; hints: { style: HintStyle; reward: 0 | 1 }[] }[] }[] = [
  {
    daysAgo: 3,
    problems: [
      { topic: 'fractions', text: 'Mia ate 1/4 of a cake and Leo ate 2/4. How much did they eat together?', hints: [
        { style: 'verbal', reward: 0 }, { style: 'verbal', reward: 0 }, { style: 'story', reward: 0 }, { style: 'visual', reward: 1 }, { style: 'visual', reward: 1 } ] },
    ],
  },
  {
    daysAgo: 2,
    problems: [
      { topic: 'fractions', text: 'A bottle is 5/6 full. Sam drinks 2/6. How much is left?', hints: [
        { style: 'story', reward: 0 }, { style: 'visual', reward: 1 }, { style: 'visual', reward: 1 } ] },
      { topic: 'word-problems', text: 'There are 24 children in 4 equal teams. How many in each team?', hints: [
        { style: 'story', reward: 1 }, { style: 'verbal', reward: 0 }, { style: 'visual', reward: 1 } ] },
    ],
  },
  {
    daysAgo: 1,
    problems: [
      { topic: 'fractions', text: 'Ana has 2/3 of a chocolate bar and gives away 1/3. How much does she keep?', hints: [
        { style: 'visual', reward: 1 }, { style: 'visual', reward: 1 } ] },
    ],
  },
];

const events: NudgeEvent[] = [];
for (const s of past) {
  const sessionId = randomUUID();
  let t = now - s.daysAgo * day;
  const at = () => iso((t += 20_000));
  events.push({ ts: at(), sessionId, type: 'session_start' });
  for (const pr of s.problems) {
    const problemId = randomUUID();
    events.push({ ts: at(), sessionId, problemId, type: 'problem', topic: pr.topic, text: pr.text, verified: true });
    pr.hints.forEach((h, i) => {
      const level = Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5;
      events.push({ ts: at(), sessionId, problemId, type: 'hint', topic: pr.topic, level, style: h.style, text: '(seeded hint)' });
      events.push({ ts: at(), sessionId, problemId, type: 'attempt', topic: pr.topic, text: '(seeded attempt)', outcome: i === pr.hints.length - 1 ? 'solved' : h.reward ? 'correct_step' : 'wrong' });
      events.push({ ts: at(), sessionId, problemId, type: 'bandit', topic: pr.topic, style: h.style, level, reward: h.reward });
    });
    events.push({ ts: at(), sessionId, problemId, type: 'solved', topic: pr.topic, hints: pr.hints.length });
  }
  events.push({ ts: at(), sessionId, type: 'session_end' });
}
fs.writeFileSync(FILES.events, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
writeJson(FILES.sessions, {});
// Ready-made curriculum (the demo never waits for building): lesson 1 mastered, lesson 3 in progress, warm-up planned.
const cur = mockCurriculum('textbook-fractions.pdf');
cur.createdAt = iso(now - 3 * day);
const [l1, l2, l3] = cur.lessons;
l1.status = 'mastered'; l1.mastery = 0.9; l1.problems.forEach((p) => { p.solved = true; });
l2.status = 'ready'; l2.mastery = 0.1;
l3.status = 'in-progress'; l3.mastery = 0.35; l3.problems[0].solved = true;
cur.nextLessonId = l3.id;
const wExpr = '1/5 + 2/5';
cur.warmup = {
  lessonId: l3.id,
  message: 'Last time adding fractions was a bit tricky. Remember: the bottom number stays the same! Quick warm-up?',
  problem: {
    id: 'warmup-seed', text: '1/5 + 2/5 = ?', topic: 'fractions', skill: l3.skill, difficulty: 1,
    question: 'What is 1/5 plus 2/5?',
    answer: { value: verifyAnswer(wExpr, 0.6).value, unit: null, expression: wExpr, verified: verifyAnswer(wExpr, 0.6).verified },
    starterVisual: { type: 'FractionBars', caption: 'One fifth and two fifths', rows: [{ denominator: 5, shaded: 1, label: '1/5' }, { denominator: 5, shaded: 2, label: '2/5' }], interactive: true },
  },
};
saveCurriculum(cur);

console.log(`Seeded curriculum "${cur.title}" (${cur.lessons.length} lessons, next ${cur.nextLessonId}, warm-up ${cur.warmup.problem.text}).`);
console.log(`Seeded ${past.length} sessions, ${events.length} events, ${memory.length} memory notes, bandit favouring visual for fractions.`);
