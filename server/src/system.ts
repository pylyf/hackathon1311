// "Under the hood": a technical snapshot of the agent for the parent dashboard / demo.
import { ELEVEN_STT_MODEL, ELEVEN_TTS_MODEL, HAS_ELEVEN, MOCK, MODEL_SOLVER, MODEL_TUTOR } from './config.js';
import type { HintLevel, HintStyle, SystemResponse, Topic, TraceStep } from './contract.js';
import { loadBandit } from './bandit.js';
import { brain } from './brain.js';
import { loadMemory } from './memory.js';
import { readEvents, type NudgeEvent } from './store.js';
import { vectorStatus } from './vector/semantic.js';

const TOOLS = ['recall_memory', 'get_strategy_advice', 'show_component', 'check_answer', 'check_step', 'write_memory', 'speak'];
const BLOCKS = [
  'FractionPie', 'FractionBars', 'Counters', 'ArrayGrid', 'BarChart', 'BarModel', 'NumberLine', 'PlaceValue', 'Ruler', 'UnitLadder', 'Clock',
  'Equation', 'Compare', 'Choice', 'Slider', 'Callout', 'Picture', 'Steps', 'Balance', 'Money', 'Shape', 'Tally',
];

const cut = (t: unknown, n = 60) => {
  const s = typeof t === 'string' ? t : '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function summary(e: NudgeEvent): string {
  switch (e.type) {
    case 'problem':
      return `new ${e.topic} problem: "${cut(e.text, 48)}"`;
    case 'hint':
      return `L${e.level} ${e.style} hint${e.ui ? ` + ${e.ui}` : ''}${typeof e.ms === 'number' ? ` · ${e.ms} ms` : ''}`;
    case 'attempt':
      return `child: "${cut(e.text, 36)}" → ${e.outcome}`;
    case 'solved':
      return `solved with ${e.hints} hint${e.hints === 1 ? '' : 's'}`;
    case 'bandit':
      return `${e.style} on ${e.topic}: ${e.reward ? 'helped (α+1)' : 'no progress (β+1)'}`;
    case 'leak_blocked':
      return 'guard blocked a reply that leaked the answer';
    case 'session_start':
      return 'session started';
    case 'session_end':
      return `session ended · ${e.notes ?? 0} notes · ${e.changes ?? 0} self-upgrades`;
    case 'plan':
      return 'planner updated the lesson plan';
    default:
      return e.type;
  }
}

export async function computeSystem(): Promise<SystemResponse> {
  const v = (await vectorStatus().catch(() => ({}))) as Record<string, any>;
  const events = readEvents();
  const hints = events.filter((e) => e.type === 'hint');
  const ms = hints.map((e) => Number(e.ms)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const b = brain();
  const traces = hints
    .filter((e) => !e.intro && Array.isArray(e.trace) && (e.trace as unknown[]).length)
    .slice(-6)
    .reverse()
    .map((e) => ({
      ts: e.ts,
      topic: (e.topic ?? 'word-problems') as Topic,
      style: (e.style ?? 'verbal') as HintStyle,
      level: (e.level ?? 1) as HintLevel,
      ...(typeof e.ms === 'number' ? { ms: e.ms } : {}),
      text: cut(e.text, 140),
      ui: (e.ui as string | null) ?? null,
      steps: (e.trace as TraceStep[]).slice(0, 10),
    }));
  return {
    live: !MOCK,
    voice: HAS_ELEVEN,
    models: { solver: MODEL_SOLVER, tutor: MODEL_TUTOR, tts: ELEVEN_TTS_MODEL, stt: ELEVEN_STT_MODEL },
    tools: TOOLS,
    blocks: BLOCKS,
    counts: {
      events: events.length,
      problems: events.filter((e) => e.type === 'problem').length,
      hints: hints.length,
      visuals: hints.filter((e) => e.ui).length,
      leaksBlocked: events.filter((e) => e.type === 'leak_blocked').length,
      skills: b.skills.length,
      recipes: b.recipes.length,
      upgrades: b.changes.filter((c) => c.kind !== 'note').length,
      memory: loadMemory().length,
    },
    latency: {
      avgMs: ms.length ? Math.round(ms.reduce((a, x) => a + x, 0) / ms.length) : null,
      p90Ms: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.9))] : null,
      samples: ms.length,
    },
    bandit: loadBandit(),
    traces,
    log: events.slice(-40).reverse().map((e) => ({ ts: e.ts, type: e.type, summary: summary(e) })),
    memory: {
      state: String(v.state ?? 'off'),
      backend: v.backend === 'qdrant' ? 'qdrant' : 'keyword',
      model: String(v.model ?? ''),
      dims: Number(v.dims ?? 0),
      url: v.qdrant?.url ?? null,
      managed: !!v.qdrant?.managed,
      notes: v.collections?.nudge_notes ?? null,
      moments: v.collections?.nudge_attempts ?? null,
      lastSync: v.lastSync ?? null,
    },
  };
}
