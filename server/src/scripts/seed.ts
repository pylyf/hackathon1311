// npm run seed — plausible demo history so the "What Nudge learned" panel looks alive.
// Overwrites bandit, memory, events, curriculum and the agent's brain (skills, recipes, change log);
// sessions.json is cleared. The child's profile is kept if onboarding was done, else a demo child is written,
// so the profile, the memory notes and the agent's skills always describe the SAME child.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { BrainChange, ChildProfile, HintStyle, MemoryNote, Recipe, Skill, Topic } from '../contract.js';
import { defaultBandit, saveBandit } from '../bandit.js';
import { saveMemory } from '../memory.js';
import { ensureDataDir, FILES, writeJson, type NudgeEvent } from '../store.js';
import { saveCurriculum } from '../curriculum.js';
import { mockCurriculum } from '../mockCurriculum.js';
import { verifyAnswer } from '../problem.js';
import { loadProfile } from '../profile.js';
import { validateScene } from '../uispec.js';

ensureDataDir();

const bandit = defaultBandit();
bandit.fractions = { verbal: [2, 6], visual: [9, 2], story: [4, 3], 'smaller-numbers': [3, 3] };
bandit['word-problems'] = { verbal: [3, 3], visual: [3, 2], story: [4, 2], 'smaller-numbers': [2, 2] };
bandit.units = { verbal: [2, 2], visual: [2, 1], story: [1, 2], 'smaller-numbers': [1, 1] };
saveBandit(bandit);

const day = 24 * 3600 * 1000;
const iso = (t: number) => new Date(t).toISOString();
const now = Date.now();

// One consistent demo child: keep the onboarding profile if there is one.
const DEMO_CHILD: ChildProfile = { name: 'Ema', grade: 3, interests: ['Football'], mathFeeling: 'tricky', dailyGoal: 3 };
const profile = loadProfile() ?? DEMO_CHILD;
writeJson(FILES.profile, profile);
const interestList = profile.interests.length ? profile.interests : DEMO_CHILD.interests;
const hobby = interestList[0].toLowerCase();

const memory: MemoryNote[] = [
  { id: randomUUID(), topic: 'fractions', kind: 'misconception', text: 'Adds denominators (1/4 + 1/4 = 2/8).', seen: 3, updatedAt: iso(now - 1 * day) },
  { id: randomUUID(), topic: 'fractions', kind: 'works', text: 'Fraction bars help: gets it after shading pieces.', seen: 2, updatedAt: iso(now - 1 * day) },
  ...interestList.map((i): MemoryNote => ({ id: randomUUID(), topic: 'any', kind: 'interest', text: `Loves ${i.toLowerCase()} — use it in story hints.`, seen: 2, updatedAt: iso(now - 2 * day) })),
  { id: randomUUID(), topic: 'word-problems', kind: 'doesnt-work', text: 'Long verbal explanations lose attention; keep it short.', seen: 1, updatedAt: iso(now - 3 * day) },
];
saveMemory(memory);

// 3 past sessions, hints per solved problem going down: 5 -> 3 -> 2
const past: { daysAgo: number; problems: { topic: Topic; text: string; hints: { style: HintStyle; reward: 0 | 1; said?: string }[] }[] }[] = [
  {
    daysAgo: 3,
    problems: [
      { topic: 'fractions', text: 'Mia ate 1/4 of a cake and Leo ate 2/4. How much did they eat together?', hints: [
        { style: 'verbal', reward: 0, said: 'three eighths' }, { style: 'verbal', reward: 0, said: 'I added the tops and the bottoms, so three eighths' }, { style: 'story', reward: 0, said: "I don't know" }, { style: 'visual', reward: 1 }, { style: 'visual', reward: 1 } ] },
    ],
  },
  {
    daysAgo: 2,
    problems: [
      { topic: 'fractions', text: 'A bottle is 5/6 full. Sam drinks 2/6. How much is left?', hints: [
        { style: 'story', reward: 0, said: 'three twelfths' }, { style: 'visual', reward: 1 }, { style: 'visual', reward: 1 } ] },
      { topic: 'word-problems', text: 'There are 24 children in 4 equal teams. How many in each team?', hints: [
        { style: 'story', reward: 1 }, { style: 'verbal', reward: 0, said: 'twenty, I took four away' }, { style: 'visual', reward: 1 } ] },
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
      events.push({ ts: at(), sessionId, problemId, type: 'attempt', topic: pr.topic, text: h.said ?? '(seeded attempt)', outcome: i === pr.hints.length - 1 ? 'solved' : h.reward ? 'correct_step' : 'wrong' });
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

// The agent's brain: what it taught itself in those past sessions (skills, a visual recipe, the change log).
const skills: Skill[] = [
  {
    id: 'adding-fractions-same-bottom', title: 'Adding fractions with the same bottom number', topic: 'fractions',
    whenToUse: 'Any add/subtract problem where the denominators match',
    body: `- Show the pieces first (pie or bar), numbers second
- Say "the slices stay the same size" before any adding
- If ${profile.name} adds the bottoms too, go straight back to the picture and count coloured pieces
- Ask for the top number only, one tiny question at a time`,
    version: 2, updatedAt: iso(now - 1 * day),
  },
  {
    id: 'keeping-attention', title: `Keeping ${profile.name} engaged`, topic: 'any',
    whenToUse: `When answers get short, off-topic or "I don't know"`,
    body: `- Keep every turn under two short sentences
- Switch to something to tap instead of explaining again
- A ${hobby} story works better than a plain rule
- Celebrate each correct step out loud`,
    version: 1, updatedAt: iso(now - 2 * day),
  },
];
writeJson(FILES.skills, skills);

const pizza = validateScene({
  type: 'Scene', title: 'Pizza slices: add same-size pieces',
  steps: [
    { say: 'Here is a pizza cut into equal slices.', blocks: [{ type: 'FractionPie', pies: [{ parts: 4, shaded: 1, label: 'first' }], interactive: false }] },
    { say: 'Some more slices of the same size arrive.', blocks: [{ type: 'FractionPie', pies: [{ parts: 4, shaded: 1, label: 'first' }, { parts: 4, shaded: 1, label: 'more' }], interactive: false }] },
    { say: 'The slices did not change size. Only count them!', blocks: [{ type: 'Callout', emoji: '💡', text: 'Same slices: the bottom number stays.', tone: 'remember' }] },
  ],
});
const recipes: Recipe[] = pizza
  ? [{ id: randomUUID(), title: pizza.title ?? 'Pizza slices', topic: 'fractions', whenToUse: 'Adding fractions with the same denominator', scene: pizza, uses: 3, updatedAt: iso(now - 1 * day) }]
  : [];
writeJson(FILES.recipes, recipes);

const changes: BrainChange[] = [
  { ts: iso(now - 3 * day), kind: 'skill-created', title: skills[0].title, why: 'Two verbal hints failed; the answer came right after a picture of the pieces.' },
  { ts: iso(now - 2 * day), kind: 'skill-created', title: skills[1].title, why: `Long explanations lost attention; a ${hobby} story got an answer straight away.` },
  { ts: iso(now - 2 * day), kind: 'recipe-created', title: recipes[0]?.title ?? 'Pizza slices', why: 'The pie picture fixed the adds-denominators mistake.' },
  { ts: iso(now - 1 * day), kind: 'skill-updated', title: `${skills[0].title} → v2`, why: 'Same mistake came back once; added "go back to the picture and count".' },
];
fs.writeFileSync(FILES.brainLog, changes.map((c) => JSON.stringify(c) + '\n').join(''));

console.log(`Seeded child "${profile.name}" (${interestList.join(', ')}), ${skills.length} skills, ${recipes.length} recipe, ${changes.length} brain changes.`);
console.log(`Seeded curriculum "${cur.title}" (${cur.lessons.length} lessons, next ${cur.nextLessonId}, warm-up ${cur.warmup.problem.text}).`);
console.log(`Seeded ${past.length} sessions, ${events.length} events, ${memory.length} memory notes, bandit favouring visual for fractions.`);
