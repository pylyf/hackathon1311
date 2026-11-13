// zod validation for GenUI specs (must match UISpec in contract.ts)
import { z } from 'zod';
import type { BlockSpec, SceneSpec, UISpec } from './contract.js';

const num = z.number().finite();
const caption = z.string().max(140).optional();

const FractionBars = z.object({
  type: z.literal('FractionBars'),
  caption,
  rows: z.array(z.object({
    denominator: z.number().int().min(1).max(24),
    shaded: z.number().int().min(0),
    label: z.string().optional(),
  }).refine((r) => r.shaded <= r.denominator)).min(1).max(6),
  interactive: z.boolean(),
});

const NumberLine = z.object({
  type: z.literal('NumberLine'),
  caption,
  min: num,
  max: num,
  step: num.positive(),
  marks: z.array(z.object({ value: num, label: z.string().optional() })).optional(),
  jumps: z.array(z.object({ from: num, to: num, label: z.string().optional() })).optional(),
  interactive: z.boolean(),
}).refine((s) => s.max > s.min && (s.max - s.min) / s.step <= 100);

const BarModel = z.object({
  type: z.literal('BarModel'),
  caption,
  mode: z.enum(['part-whole', 'compare']),
  bars: z.array(z.object({
    label: z.string(),
    parts: z.array(z.object({ label: z.string().optional(), value: num.optional(), unknown: z.boolean().optional() })).min(1),
  })).min(1).max(6),
});

const UnitLadder = z.object({
  type: z.literal('UnitLadder'),
  caption,
  units: z.array(z.string()).min(2),
  factors: z.array(num.positive()),
  value: num.optional(),
  fromUnit: z.string().optional(),
  interactive: z.boolean(),
}).refine((s) => s.factors.length === s.units.length - 1);

const FractionPie = z.object({
  type: z.literal('FractionPie'),
  caption,
  pies: z.array(z.object({ parts: z.number().int().min(1).max(16), shaded: z.number().int().min(0), label: z.string().optional() })
    .refine((p) => p.shaded <= p.parts)).min(1).max(4),
  interactive: z.boolean(),
});

const Counters = z.object({
  type: z.literal('Counters'),
  caption,
  groups: z.array(z.object({ emoji: z.string().min(1).max(8), count: z.number().int().min(0).max(40), label: z.string().optional() })).min(1).max(6),
  crossOut: z.number().int().min(0).optional(),
  interactive: z.boolean(),
}).refine((s) => s.groups.reduce((a, g) => a + g.count, 0) <= 60);

const ArrayGrid = z.object({
  type: z.literal('ArrayGrid'),
  caption,
  rows: z.number().int().min(1).max(12),
  cols: z.number().int().min(1).max(12),
  emoji: z.string().max(8).optional(),
  interactive: z.boolean(),
});

const BarChart = z.object({
  type: z.literal('BarChart'),
  caption,
  bars: z.array(z.object({ label: z.string(), value: num.min(0), emoji: z.string().max(8).optional(), unknown: z.boolean().optional() })).min(1).max(8),
  unit: z.string().optional(),
});

const PlaceValue = z.object({ type: z.literal('PlaceValue'), caption, number: z.number().int().min(0).max(9999) });

const Ruler = z.object({
  type: z.literal('Ruler'),
  caption,
  max: z.number().int().min(1).max(30),
  unit: z.string().max(6),
  marks: z.array(z.object({ value: num, label: z.string().optional() })).optional(),
  interactive: z.boolean(),
});

const Clock = z.object({ type: z.literal('Clock'), caption, hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) });

const Equation = z.object({ type: z.literal('Equation'), caption, lines: z.array(z.string().max(60)).min(1).max(5) });

const Compare = z.object({
  type: z.literal('Compare'),
  caption,
  left: z.string().max(20),
  right: z.string().max(20),
  leftEmoji: z.string().max(8).optional(),
  rightEmoji: z.string().max(8).optional(),
});

const Choice = z.object({ type: z.literal('Choice'), question: z.string().max(120), options: z.array(z.string().max(30)).min(2).max(4) });

const Slider = z.object({
  type: z.literal('Slider'),
  caption,
  min: num,
  max: num,
  step: num.positive(),
  unit: z.string().optional(),
  emoji: z.string().max(8).optional(),
}).refine((s) => s.max > s.min && (s.max - s.min) / s.step <= 200);

const Callout = z.object({
  type: z.literal('Callout'),
  emoji: z.string().min(1).max(8),
  text: z.string().max(140),
  tone: z.enum(['idea', 'tip', 'wow', 'remember']).optional(),
});

const Picture = z.object({
  type: z.literal('Picture'),
  caption,
  items: z.array(z.object({ emoji: z.string().min(1).max(8), label: z.string().max(20).optional(), count: z.number().int().min(1).max(12).optional() })).min(1).max(5),
});

const Steps = z.object({
  type: z.literal('Steps'),
  caption,
  steps: z.array(z.string().max(60)).min(2).max(5),
  current: z.number().int().min(0).optional(),
});

const side = z.object({ label: z.string().max(20), emoji: z.string().max(8).optional() });
const Balance = z.object({ type: z.literal('Balance'), caption, left: side, right: side, tilt: z.enum(['left', 'right', 'even', 'unknown']) });

const Money = z.object({
  type: z.literal('Money'),
  caption,
  currency: z.enum(['€', '$', '£']),
  coins: z.array(z.object({ value: z.number().int().min(1).max(10000), count: z.number().int().min(1).max(10) })).min(1).max(6),
});

const Shape = z.object({
  type: z.literal('Shape'),
  caption,
  shape: z.enum(['square', 'rectangle', 'triangle']),
  sides: z.array(z.string().max(12)).max(4),
  grid: z.boolean().optional(),
  cols: z.number().int().min(1).max(12).optional(),
  rows: z.number().int().min(1).max(12).optional(),
});

const Tally = z.object({
  type: z.literal('Tally'),
  caption,
  rows: z.array(z.object({ label: z.string().max(20), emoji: z.string().max(8).optional(), count: z.number().int().min(0).max(40), unknown: z.boolean().optional() })).min(1).max(6),
});

const BLOCKS = [FractionBars, NumberLine, BarModel, UnitLadder, FractionPie, Counters, ArrayGrid, BarChart, PlaceValue, Ruler, Clock, Equation, Compare, Choice, Slider, Callout, Picture, Steps, Balance, Money, Shape, Tally] as const;
const BlockSchema = z.union(BLOCKS);

function parseBlock(v: unknown): BlockSpec | null {
  if (!v || typeof v !== 'object') return null;
  const { focus, ...rest } = v as Record<string, unknown>; // emphasis is allowed on every block
  const r = BlockSchema.safeParse(rest);
  if (!r.success) return null;
  return (focus === true ? { ...r.data, focus: true } : r.data) as BlockSpec;
}

const THEMES = ['orange', 'blue', 'green', 'purple', 'yellow', 'pink'] as const;

/** Scenes are validated leniently: invalid blocks are dropped, empty steps removed. */
function parseScene(v: Record<string, unknown>): SceneSpec | null {
  const steps = Array.isArray(v.steps) ? v.steps : [];
  const out: SceneSpec['steps'] = [];
  for (const st of steps.slice(0, 3)) {
    if (!st || typeof st !== 'object') continue;
    const s = st as { say?: unknown; blocks?: unknown };
    const blocks = (Array.isArray(s.blocks) ? s.blocks : []).map(parseBlock).filter((b): b is BlockSpec => !!b).slice(0, 2);
    const say = typeof s.say === 'string' ? s.say.slice(0, 160) : undefined;
    const layout = (s as { layout?: unknown }).layout === 'row' && blocks.length === 2 ? ('row' as const) : undefined;
    if (blocks.length || say) out.push({ say, blocks, ...(layout ? { layout } : {}) });
  }
  if (!out.some((s) => s.blocks.length)) return null;
  const theme = THEMES.find((t) => t === v.theme);
  const art = typeof v.art === 'string' && v.art.trim() ? v.art.trim().slice(0, 16) : undefined;
  return { type: 'Scene', title: typeof v.title === 'string' ? v.title.slice(0, 60) : undefined, ...(theme ? { theme } : {}), ...(art ? { art } : {}), steps: out };
}

/** Returns a valid UISpec or null (invalid specs are dropped). */
export function validateUISpec(input: unknown): UISpec | null {
  let v = input;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== 'object') return null;
  if ((v as { type?: unknown }).type === 'Scene') return parseScene(v as Record<string, unknown>);
  return parseBlock(v);
}

export function validateScene(input: unknown): SceneSpec | null {
  const s = validateUISpec(input);
  return s && s.type === 'Scene' ? s : null;
}

export const UI_SPEC_DOC = `VISUALS. Prefer a "Scene": a short animated explanation whose steps appear one at a time, each with a spoken line and 1-2 blocks:
{ "type":"Scene", "title"?:string, "theme"?:"orange"|"blue"|"green"|"purple"|"yellow"|"pink", "art"?:"🍕🎂", "steps":[ { "say"?: "one short sentence", "blocks":[ BLOCK ], "layout"?:"stack"|"row" }, ... ] }  (2-3 steps; build the idea up: situation -> what changes -> question)
DESIGN IT: pick a "theme" colour that fits the story (pizza/cake=orange, sea/sky=blue, garden/money=green, magic/space=purple, sun/gold=yellow, sweets=pink) and 1-3 "art" emoji for the header. In "say", wrap the ONE key word or number in **double stars** to highlight it. Use "layout":"row" with exactly 2 blocks to put them side by side for comparing (e.g. two pies). Add "focus":true to the block the child should look at or touch first.
A single BLOCK may also be sent on its own. BLOCK types:
- FractionPie { "type":"FractionPie", "pies":[{"parts":int,"shaded":int,"label"?:string}], "interactive":bool } — pizza/cake circles; child can tap slices.
- FractionBars { "type":"FractionBars", "rows":[{"denominator":int,"shaded":int,"label"?:string}], "interactive":bool } — chocolate-bar strips; compare fractions.
- Counters { "type":"Counters", "groups":[{"emoji":"🍪","count":int,"label"?:string}], "crossOut"?:int, "interactive":bool } — real objects to count, add (several groups), take away (crossOut), share/divide (equal groups).
- ArrayGrid { "type":"ArrayGrid", "rows":int, "cols":int, "emoji"?:string, "interactive":bool } — rows x columns for multiplication.
- BarChart { "type":"BarChart", "bars":[{"label":string,"value":number,"emoji"?:string,"unknown"?:bool}], "unit"?:string } — compare amounts; unknown bar shows "?".
- BarModel { "type":"BarModel", "mode":"part-whole"|"compare", "bars":[{"label":string,"parts":[{"label"?:string,"value"?:number,"unknown"?:bool}]}] } — Singapore bar model for word problems.
- NumberLine { "type":"NumberLine", "min":number, "max":number, "step":number, "marks"?:[{"value":number,"label"?:string}], "jumps"?:[{"from":number,"to":number,"label"?:string}], "interactive":bool } — hops for adding/subtracting, fractions between 0 and 1.
- PlaceValue { "type":"PlaceValue", "number":int } — thousands/hundreds/tens/ones blocks.
- Ruler { "type":"Ruler", "max":int, "unit":"cm", "marks"?:[{"value":number,"label"?:string}], "interactive":bool } — measuring lengths.
- UnitLadder { "type":"UnitLadder", "units":["km","m","cm"], "factors":[1000,100], "value"?:number, "fromUnit"?:string, "interactive":bool } — unit conversion steps.
- Clock { "type":"Clock", "hour":int, "minute":int } — telling time / durations.
- Equation { "type":"Equation", "lines":["12 + 5 = 17","17 - 4 = ?"] } — number sentences built step by step; "?" shows an empty box to fill.
- Compare { "type":"Compare", "left":"3/4", "right":"2/3", "leftEmoji"?:string, "rightEmoji"?:string } — which is bigger; the sign is left as "?".
- Choice { "type":"Choice", "question":string, "options":[2-4 short strings] } — a quick tap-to-answer check of ONE small step (never the final answer as the only sensible option).
- Slider { "type":"Slider", "min":number, "max":number, "step":number, "unit"?:string, "emoji"?:string, "caption"?:string } — child estimates/chooses a number by dragging.
- Callout { "type":"Callout", "emoji":"💡", "text":"one short idea", "tone"?:"idea"|"tip"|"wow"|"remember" } — explain the key idea in kid words.
- Picture { "type":"Picture", "items":[{"emoji":"👧","label"?:"Mia","count"?:int}] } — a tiny illustrated story scene (1-5 items, e.g. who has what) to set the scene before any maths.
- Steps { "type":"Steps", "steps":["Find the whole","Take away","Count what is left"], "current"?:int } — the METHOD as a short checklist; highlight the step the child is on.
- Balance { "type":"Balance", "left":{"label":"3 kg","emoji"?:"🎒"}, "right":{"label":"500 g","emoji"?:"🍎"}, "tilt":"left"|"right"|"even"|"unknown" } — compare weights / which is more.
- Money { "type":"Money", "currency":"€"|"$"|"£", "coins":[{"value":50,"count":2}] } — coins (value in cents) and notes (value >= 500) to count or pay with.
- Shape { "type":"Shape", "shape":"square"|"rectangle"|"triangle", "sides":["5 cm","3 cm","?","3 cm"], "grid"?:bool, "cols"?:int, "rows"?:int } — perimeter (side labels) or area (grid of unit squares).
- Tally { "type":"Tally", "rows":[{"label":"Cats","emoji"?:"🐱","count":7,"unknown"?:bool}] } — tally marks in groups of five, for data / counting questions.
Every block except Choice/Callout takes an optional "caption" (short); every block may take "focus":true. Use concrete objects (emoji counters, pizzas) before abstract ones (equations). Show the numbers given in the story clearly (labels like "36 stickers", not "start"). Never show the final result.
COLOURS: the app picks the colours. Shaded parts are ORANGE in the 1st row/pie/group, BLUE in the 2nd, GREEN in the 3rd, PURPLE in the 4th; empty parts are light grey. If you mention a colour, use exactly these; otherwise just say "coloured" or "shaded".
KEEP IT SHORT: every "say", caption and label is at most ~10 words. Labels are 1-2 words (e.g. "Tom", "1/2").`;
