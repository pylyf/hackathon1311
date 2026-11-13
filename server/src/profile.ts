// The one child's profile, filled in by the app's onboarding. Interests also become memory notes.
import type { ChildProfile } from './contract.js';
import { mergeNotes } from './memory.js';
import { FILES, readJson, writeJson } from './store.js';

export function loadProfile(): ChildProfile | null {
  const p = readJson<ChildProfile | null>(FILES.profile, null);
  return p && typeof p.name === 'string' ? p : null;
}

const clean = (s: unknown, max = 40) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function saveProfile(input: Partial<ChildProfile>): ChildProfile {
  const grade = typeof input.grade === 'number' && input.grade >= 1 && input.grade <= 6 ? Math.round(input.grade) : null;
  const feeling = input.mathFeeling === 'love' || input.mathFeeling === 'ok' || input.mathFeeling === 'tricky' ? input.mathFeeling : null;
  const goal = typeof input.dailyGoal === 'number' && input.dailyGoal > 0 ? Math.min(20, Math.round(input.dailyGoal)) : null;
  const profile: ChildProfile = {
    name: clean(input.name, 30),
    grade,
    interests: Array.isArray(input.interests) ? input.interests.map((x) => clean(x)).filter(Boolean).slice(0, 8) : [],
    mathFeeling: feeling,
    dailyGoal: goal,
  };
  writeJson(FILES.profile, profile);
  // "Loves X — ..." matches the interest format the tutor/mock already understand.
  mergeNotes(profile.interests.map((i) => ({ topic: 'any' as const, kind: 'interest' as const, text: `Loves ${i.toLowerCase()} — use it in story hints.` })));
  return profile;
}

/** One line for prompts, e.g. "The child is Ema, grade 2, who finds math tricky." */
export function profileLine(): string {
  const p = loadProfile();
  if (!p) return '';
  const parts: string[] = [];
  if (p.name) parts.push(`The child's name is ${p.name} (use it now and then, not every turn).`);
  if (p.grade) parts.push(`They are in grade ${p.grade}; pitch words and numbers at that level.`);
  if (p.mathFeeling === 'tricky') parts.push('They say math feels tricky: be extra gentle and celebrate small steps.');
  if (p.mathFeeling === 'love') parts.push('They love math: a little extra challenge is welcome.');
  return parts.join(' ');
}
