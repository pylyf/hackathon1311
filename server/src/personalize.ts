// Which practice problem comes next in a lesson: not simply "the first unsolved one", but the unsolved one closest
// (by meaning, via the vector memory) to what this child struggled with before. Without the vector index, or when
// nothing in the past is similar enough, it is the first unsolved problem exactly as before.
import type { StoredLesson, StoredProblem } from './curriculum.js';
import { ago, struggleAffinity } from './vector/semantic.js';

const MIN_AFFINITY = 0.5;      // below this the past is not similar enough to change the order
const HARDER_PENALTY = 0.12;   // per difficulty level above the easiest open problem: keep the textbook progression

export async function pickPractice(lesson: StoredLesson): Promise<{ problem: StoredProblem; because?: string } | null> {
  const open = lesson.problems.filter((p) => !p.solved);
  if (!open.length) return null;
  const first = open[0];
  if (open.length === 1) return { problem: first };
  const affinity = await struggleAffinity(open.map((p) => ({ id: p.id, text: p.text })), lesson.topic, lesson.skill);
  const easiest = Math.min(...open.map((p) => p.difficulty));
  let best = first;
  let bestScore = MIN_AFFINITY;
  for (const p of open) {
    const a = affinity.get(p.id);
    const score = a ? a.score - HARDER_PENALTY * (p.difficulty - easiest) : 0;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  const why = affinity.get(best.id);
  return why && bestScore > MIN_AFFINITY
    ? { problem: best, because: `Picked for you: like the one that was tricky ${ago(why.because.ts)}` }
    : { problem: first };
}
