// Gamification, derived entirely from the event log: pebbles (XP), levels, streak, daily goal, badges.
import type { Badge, ProgressResponse, Topic, TopicProgress } from './contract.js';
import { loadProfile } from './profile.js';
import { readEvents } from './store.js';

const TOPICS: Topic[] = ['word-problems', 'fractions', 'units'];
const SOLVES_PER_TOPIC_LEVEL = 3;
const MAX_TOPIC_LEVEL = 5;

/** Pebbles for one solve: 10, plus a bonus for needing few hints. */
export function pebblesFor(hints: number): number {
  const bonus = hints <= 0 ? 10 : hints === 1 ? 6 : hints === 2 ? 3 : 0;
  return 10 + bonus;
}

/** Level n -> n+1 costs 40 + 20n pebbles. */
function levelOf(total: number): { level: number; inLevel: number; need: number } {
  let level = 1;
  let rest = total;
  for (;;) {
    const need = 40 + 20 * level;
    if (rest < need) return { level, inLevel: rest, need };
    rest -= need;
    level += 1;
  }
}

const dayKey = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

export function computeProgress(): ProgressResponse {
  const solves = readEvents()
    .filter((e) => e.type === 'solved')
    .map((e) => ({ ts: e.ts, topic: (e.topic ?? 'word-problems') as Topic, hints: Number(e.hints ?? 0) }))
    .sort((a, b) => a.ts.localeCompare(b.ts));

  const pebbles = solves.reduce((s, x) => s + pebblesFor(x.hints), 0);
  const lv = levelOf(pebbles);

  // days with at least one solve
  const perDay = new Map<string, number>();
  for (const s of solves) {
    const k = dayKey(new Date(s.ts));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const today = new Date();
  const todayKey = dayKey(today);
  const todaySolved = perDay.get(todayKey) ?? 0;

  // streak: count back from today (or yesterday, if nothing yet today)
  let streak = 0;
  const cursor = new Date(today);
  if (!perDay.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (perDay.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const week: ProgressResponse['week'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    week.push({ day: d.toLocaleDateString('en-US', { weekday: 'narrow' }), done: perDay.has(dayKey(d)), today: i === 0 });
  }

  const dailyGoal = loadProfile()?.dailyGoal ?? 3;
  const byTopic = (t: Topic) => solves.filter((s) => s.topic === t).length;
  const topics: TopicProgress[] = TOPICS.map((topic) => {
    const solved = byTopic(topic);
    const raw = solved / SOLVES_PER_TOPIC_LEVEL;
    const level = Math.min(MAX_TOPIC_LEVEL, Math.floor(raw) + 1);
    return { topic, solved, level, levelProgress: level >= MAX_TOPIC_LEVEL ? 1 : raw - Math.floor(raw) };
  });

  const noHintSolves = solves.filter((s) => s.hints === 0).length;
  const goalHit = [...perDay.values()].some((n) => n >= dailyGoal);
  const longest = longestStreak([...perDay.keys()]);
  const b = (id: string, title: string, description: string, icon: string, color: string, have: number, need: number): Badge => ({
    id, title, description, icon, color, earned: have >= need, progress: Math.min(1, have / need),
  });
  const badges: Badge[] = [
    b('first', 'First Splash', 'Solve your first problem', '🌊', '#2FA5F0', solves.length, 1),
    b('solo', 'Solo Star', 'Solve one with no hints', '⭐', '#FFC93C', noHintSolves, 1),
    b('goal', 'Goal Getter', 'Hit your daily goal', '🎯', '#F0506E', goalHit ? 1 : todaySolved, goalHit ? 1 : dailyGoal),
    b('streak3', 'On Fire', '3 days in a row', '🔥', '#FF7A45', longest, 3),
    b('pizza', 'Pizza Pro', 'Solve 3 fraction problems', '🍕', '#E0A800', byTopic('fractions'), 3),
    b('ruler', 'Measure Master', 'Solve 3 unit problems', '📏', '#3CC47C', byTopic('units'), 3),
    b('story', 'Story Solver', 'Solve 3 word problems', '📖', '#A06CF0', byTopic('word-problems'), 3),
    b('ten', 'Pebble Hoarder', 'Solve 10 problems', '🪨', '#9A6646', solves.length, 10),
  ];

  const last = solves[solves.length - 1];
  return {
    pebbles,
    level: lv.level,
    levelPebbles: lv.inLevel,
    nextLevelPebbles: lv.need,
    streak,
    todaySolved,
    dailyGoal,
    week,
    totalSolved: solves.length,
    noHintSolves,
    topics,
    badges,
    lastSolve: last ? { pebbles: pebblesFor(last.hints), hints: last.hints, topic: last.topic } : null,
  };
}

function longestStreak(days: string[]): number {
  const set = new Set(days);
  let best = 0;
  for (const d of days) {
    const prev = new Date(d + 'T12:00:00');
    prev.setDate(prev.getDate() - 1);
    if (set.has(dayKey(prev))) continue; // not a run start
    let n = 0;
    const c = new Date(d + 'T12:00:00');
    while (set.has(dayKey(c))) {
      n += 1;
      c.setDate(c.getDate() + 1);
    }
    best = Math.max(best, n);
  }
  return best;
}
