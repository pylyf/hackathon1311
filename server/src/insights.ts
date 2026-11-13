// Numbers for the parent-facing "Nudge's brain" charts, all derived from the event log.
import type { HintStyle, InsightsResponse, Topic } from './contract.js';
import { readEvents } from './store.js';

const STYLES: HintStyle[] = ['verbal', 'visual', 'story', 'smaller-numbers'];

export function computeInsights(): InsightsResponse {
  const events = readEvents();
  // only sessions where the child actually worked on a problem
  const sessions = new Set(events.filter((e) => e.type === 'problem').map((e) => e.sessionId)).size;

  // one row per problem: when it started, how many hints, solved or not, how long it took
  const byProblem = new Map<string, InsightsResponse['problems'][number] & { start: number }>();
  for (const e of events) {
    if (!e.problemId) continue;
    if (e.type === 'problem') {
      byProblem.set(e.problemId, { ts: e.ts, topic: (e.topic ?? 'word-problems') as Topic, hints: 0, solved: false, seconds: null, start: Date.parse(e.ts) });
    } else if (e.type === 'solved') {
      const p = byProblem.get(e.problemId);
      if (p) {
        p.solved = true;
        p.hints = Number(e.hints ?? p.hints);
        p.seconds = Math.max(1, Math.round((Date.parse(e.ts) - p.start) / 1000));
      }
    } else if (e.type === 'hint' && !e.intro) {
      const p = byProblem.get(e.problemId);
      if (p && !p.solved) p.hints += 1;
    }
  }
  const problems = [...byProblem.values()]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map(({ start: _s, ...rest }) => rest);

  const styles = Object.fromEntries(STYLES.map((s) => [s, { used: 0, helped: 0 }])) as InsightsResponse['styles'];
  for (const e of events) {
    if (e.type !== 'bandit' || !e.style || !(e.style in styles)) continue;
    styles[e.style].used += 1;
    if (e.reward === 1) styles[e.style].helped += 1;
  }

  return {
    sessions,
    problems,
    styles,
    leaksBlocked: events.filter((e) => e.type === 'leak_blocked').length,
    visualsShown: events.filter((e) => e.type === 'hint' && e.ui).length,
  };
}
