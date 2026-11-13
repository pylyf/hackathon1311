// The agent's self-improvement layer.
// - Skills: short teaching playbooks the agent writes (and rewrites) for itself about THIS child.
// - Recipes: reusable animated scenes it invented that worked; reused/adapted next time.
// - Prepared scenes: a "Show me" explainer generated ahead of time for each new problem.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { MOCK, MODEL_SOLVER, MODEL_TUTOR } from './config.js';
import type { BrainChange, BrainResponse, MemoryNote, Recipe, SceneSpec, Skill, Topic } from './contract.js';
import { loadBandit } from './bandit.js';
import { uiLeaks } from './guard.js';
import { createJson } from './llm.js';
import { loadMemory } from './memory.js';
import { profileLine } from './profile.js';
import type { ProblemState } from './state.js';
import { FILES, readEvents, readJson, writeJson, ensureDataDir } from './store.js';
import { UI_SPEC_DOC, validateScene } from './uispec.js';

// ---------------------------------------------------------------- storage

export function loadSkills(): Skill[] {
  const s = readJson<Skill[]>(FILES.skills, []);
  return Array.isArray(s) ? s : [];
}
export function loadRecipes(): Recipe[] {
  const r = readJson<Recipe[]>(FILES.recipes, []);
  return Array.isArray(r) ? r : [];
}
function loadChanges(): BrainChange[] {
  try {
    return fs
      .readFileSync(FILES.brainLog, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as BrainChange)
      .reverse();
  } catch {
    return [];
  }
}
function logChange(c: Omit<BrainChange, 'ts'>): BrainChange {
  ensureDataDir();
  const full = { ts: new Date().toISOString(), ...c };
  fs.appendFileSync(FILES.brainLog, JSON.stringify(full) + '\n');
  return full;
}

export function brain(): BrainResponse {
  return { skills: loadSkills(), recipes: loadRecipes(), changes: loadChanges().slice(0, 40) };
}

const forTopic = <T extends { topic: Topic | 'any' }>(xs: T[], topic: Topic) => xs.filter((x) => x.topic === topic || x.topic === 'any');

export function relevantSkills(topic: Topic): Skill[] {
  return forTopic(loadSkills(), topic).slice(0, 6);
}
export function relevantRecipes(topic: Topic): Recipe[] {
  return forTopic(loadRecipes(), topic)
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 3);
}

/** Prompt section: the agent's own skills + recipes for this topic. */
export function brainPrompt(topic: Topic): string {
  const skills = relevantSkills(topic);
  const recipes = relevantRecipes(topic);
  const sk = skills.length
    ? skills.map((s) => `### ${s.title} (v${s.version}; use when: ${s.whenToUse})\n${s.body}`).join('\n\n')
    : '(none yet — you will write them after this session)';
  const rc = recipes.length
    ? recipes.map((r) => `- "${r.title}" (use when: ${r.whenToUse}): ${JSON.stringify(r.scene)}`).join('\n')
    : '(none yet)';
  return `YOUR OWN SKILLS (you wrote these from past sessions with this child; follow them):\n${sk}\n\nYOUR VISUAL RECIPES (scenes that worked before; reuse and adapt them with this problem's numbers):\n${rc}`;
}

export function markRecipeUsed(scene: SceneSpec | null): void {
  if (!scene?.title) return;
  const all = loadRecipes();
  const r = all.find((x) => x.title === scene.title);
  if (!r) return;
  r.uses += 1;
  writeJson(FILES.recipes, all);
}

// ---------------------------------------------------------------- prepared "Show me" scenes

const prepared = new Map<string, Promise<SceneSpec | null>>();

const SCENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sceneJson'],
  properties: { sceneJson: { type: 'string', description: 'The Scene as a JSON string.' } },
};

async function generateScene(p: ProblemState, strict: boolean): Promise<SceneSpec | null> {
  const ans = `${p.answer.value}${p.answer.unit ? ' ' + p.answer.unit : ''}`;
  const out = await createJson<{ sceneJson: string }>({
    model: MODEL_TUTOR,
    max_tokens: 6000,
    output_config: { effort: 'low' },
    system: `You design short animated visual explanations ("Scenes") for a primary-school child (age 6-10) in a math tutoring app. ${profileLine()}
${brainPrompt(p.topic)}

${UI_SPEC_DOC}

Make a SHORT Scene of 2-3 steps, one block per step, that helps the child UNDERSTAND the method: step 1 shows the situation with concrete objects (Counters, FractionPie, BarModel…), step 2 shows what changes, the last step asks the child to do the final step themselves (an Equation with "?" or a Choice about a small step). Prefer the clearest picture over many pictures. Keep numbers readable: Counters only up to ~30 objects; for bigger numbers use a BarModel or NumberLine. Always show the numbers GIVEN in the story (e.g. label a bar 36, not "start") — only the final result is secret. Each "say" is ONE short sentence of at most 10 words. Use the child's interests if natural.
SECRET ANSWER: ${ans}. The scene must NEVER show or say it, or any equivalent form (no result shaded, no result counted, no "= ${p.answer.value}").${strict ? '\nYour previous scene leaked the answer. Stop one step earlier.' : ''}`,
    messages: [{ role: 'user', content: `Problem: ${p.text}\nQuestion: ${p.question}\nTopic: ${p.topic}` }],
    schema: SCENE_SCHEMA,
  });
  return validateScene(out.sceneJson);
}

export function prepareScene(p: ProblemState): void {
  if (MOCK || prepared.has(p.id)) {
    if (MOCK) prepared.set(p.id, Promise.resolve(mockScene(p)));
    return;
  }
  const job = (async () => {
    try {
      const ctx = { problemText: p.text };
      let scene = await generateScene(p, false);
      if (scene && uiLeaks(scene, p.answer, ctx)) scene = await generateScene(p, true);
      if (scene && uiLeaks(scene, p.answer, ctx)) return null;
      return scene;
    } catch (e) {
      console.warn('[brain] prepareScene failed:', (e as Error).message);
      return null;
    }
  })();
  prepared.set(p.id, job);
}

/** Wait up to `ms` for the prepared scene. */
export async function getPreparedScene(problemId: string, ms = 25000): Promise<{ scene: SceneSpec | null; ready: boolean }> {
  const job = prepared.get(problemId);
  if (!job) return { scene: null, ready: false };
  const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms));
  const res = await Promise.race([job, timeout]);
  if (res === 'timeout') return { scene: null, ready: false };
  return { scene: res, ready: true };
}

/** Non-blocking peek, for the tutor. */
export async function peekPreparedScene(problemId: string): Promise<SceneSpec | null> {
  return (await getPreparedScene(problemId, 1)).scene;
}

function mockScene(p: ProblemState): SceneSpec {
  return {
    type: 'Scene',
    title: 'Let me show you',
    steps: [
      { say: "Let's look at what the story gives us.", blocks: [{ type: 'Callout', emoji: '🔎', text: p.question || 'What does the story ask?', tone: 'idea' }] },
      { say: 'Now you try the last step!', blocks: [{ type: 'Equation', lines: ['? '] }] },
    ],
  };
}

// ---------------------------------------------------------------- self-improvement after a session

const IMPROVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['skills', 'recipes'],
  properties: {
    skills: {
      type: 'array',
      description: 'Skills to create or rewrite (max 3). Omit skills that do not need changes.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'topic', 'whenToUse', 'body', 'why'],
        properties: {
          id: { type: 'string', description: 'existing skill id to rewrite, or a new kebab-case id' },
          title: { type: 'string' },
          topic: { type: 'string', enum: ['word-problems', 'fractions', 'units', 'any'] },
          whenToUse: { type: 'string', description: 'one line' },
          body: { type: 'string', description: 'the full playbook, 3-8 short bullet lines starting with "- "' },
          why: { type: 'string', description: 'one sentence: what in this session made you write/change it' },
        },
      },
    },
    recipes: {
      type: 'array',
      description: 'New reusable visual recipes (max 2) — only for visuals that clearly helped, or a better design for one that did not.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'topic', 'whenToUse', 'sceneJson', 'why'],
        properties: {
          title: { type: 'string' },
          topic: { type: 'string', enum: ['word-problems', 'fractions', 'units', 'any'] },
          whenToUse: { type: 'string' },
          sceneJson: { type: 'string', description: 'a generic Scene JSON (example numbers are fine)' },
          why: { type: 'string' },
        },
      },
    },
  },
};

type ImproveOut = {
  skills: { id: string; title: string; topic: Skill['topic']; whenToUse: string; body: string; why: string }[];
  recipes: { title: string; topic: Recipe['topic']; whenToUse: string; sceneJson: string; why: string }[];
};

/** Reads the session, then rewrites the agent's own skills and saves new visual recipes. */
export async function improve(sessionId: string, newNotes: MemoryNote[]): Promise<BrainChange[]> {
  const events = readEvents().filter((e) => e.sessionId === sessionId);
  if (!events.some((e) => e.type === 'attempt' || e.type === 'hint')) return [];
  const skills = loadSkills();
  const recipes = loadRecipes();
  let out: ImproveOut;
  if (MOCK) {
    out = mockImprove(events.find((e) => e.topic)?.topic as Topic | undefined, skills);
  } else {
    const log = events
      .filter((e) => e.type !== 'session_start' && e.type !== 'session_end')
      .map(({ ts: _t, sessionId: _s, ...rest }) => JSON.stringify(rest))
      .join('\n');
    out = await createJson<ImproveOut>({
      model: MODEL_SOLVER,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      system: `You are Nudge, a self-improving AI math tutor for ONE primary-school child. After each session you improve YOURSELF: you rewrite your own teaching skills (playbooks you will read before every future session with this child) and save visual recipes (animated scenes) that worked.
${profileLine()}
A good skill is concrete and specific to THIS child: what to do first, which visuals/analogies/words work, what to avoid, how to react when they are stuck or distracted, how to keep their attention. Rewrite an existing skill (same id, full new body) when the session gives new evidence; create a new one only for a genuinely new situation. Keep each body short (3-8 bullets). Max 3 skills and 2 recipes per session; return empty arrays if nothing was learned.
Evidence: "hint" events show what you tried (style, level, visual type); "attempt" events show the child's reaction (outcome); "bandit" reward 1 = that hint style led to progress; "leak_blocked" = you almost gave the answer away.

${UI_SPEC_DOC}`,
      messages: [
        {
          role: 'user',
          content: `Your current skills:\n${JSON.stringify(skills.map(({ id, title, topic, whenToUse, body, version }) => ({ id, title, topic, whenToUse, body, version })))}

Your recipe titles: ${JSON.stringify(recipes.map((r) => `${r.title} (${r.topic}, used ${r.uses}x)`))}

Hint-style success so far (alpha, beta per topic/style): ${JSON.stringify(loadBandit())}

Memory notes about the child (new this session first): ${JSON.stringify([...newNotes, ...loadMemory().slice(0, 12)].map((n) => `${n.kind}: ${n.text}`))}

Session log:\n${log}`,
        },
      ],
      schema: IMPROVE_SCHEMA,
    });
  }

  const now = new Date().toISOString();
  const changes: BrainChange[] = [];
  for (const s of out.skills.slice(0, 3)) {
    if (!s.body?.trim()) continue;
    const existing = skills.find((x) => x.id === s.id);
    if (existing) {
      Object.assign(existing, { title: s.title, topic: s.topic, whenToUse: s.whenToUse, body: s.body.trim(), version: existing.version + 1, updatedAt: now });
      changes.push(logChange({ kind: 'skill-updated', title: `${s.title} → v${existing.version}`, why: s.why }));
    } else {
      const id = (s.id || s.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || randomUUID();
      skills.push({ id, title: s.title, topic: s.topic, whenToUse: s.whenToUse, body: s.body.trim(), version: 1, updatedAt: now });
      changes.push(logChange({ kind: 'skill-created', title: s.title, why: s.why }));
    }
  }
  for (const r of out.recipes.slice(0, 2)) {
    const scene = validateScene(r.sceneJson);
    if (!scene) continue;
    scene.title = r.title;
    recipes.push({ id: randomUUID(), title: r.title, topic: r.topic, whenToUse: r.whenToUse, scene, uses: 0, updatedAt: now });
    changes.push(logChange({ kind: 'recipe-created', title: r.title, why: r.why }));
  }
  writeJson(FILES.skills, skills);
  writeJson(FILES.recipes, recipes);
  return changes;
}

function mockImprove(topic: Topic | undefined, skills: Skill[]): ImproveOut {
  const t = topic ?? 'any';
  const existing = skills.find((s) => s.topic === t);
  return {
    skills: [
      {
        id: existing?.id ?? `${t}-basics`,
        title: existing?.title ?? `Teaching ${t} to this child`,
        topic: t,
        whenToUse: `Any ${t} problem`,
        body: '- Start with a concrete picture before any numbers\n- Ask one tiny question at a time\n- Celebrate every correct step out loud',
        why: 'Mock mode: the child made progress after a visual hint.',
      },
    ],
    recipes: [],
  };
}
