// zod validation for GenUI specs (must match UISpec in contract.ts)
import { z } from 'zod';
import type { UISpec } from './contract.js';

const num = z.number().finite();

const FractionBars = z.object({
  type: z.literal('FractionBars'),
  caption: z.string().optional(),
  rows: z.array(z.object({
    denominator: z.number().int().min(1).max(24),
    shaded: z.number().int().min(0),
    label: z.string().optional(),
  }).refine((r) => r.shaded <= r.denominator)).min(1).max(6),
  interactive: z.boolean(),
});

const NumberLine = z.object({
  type: z.literal('NumberLine'),
  caption: z.string().optional(),
  min: num,
  max: num,
  step: num.positive(),
  marks: z.array(z.object({ value: num, label: z.string().optional() })).optional(),
  jumps: z.array(z.object({ from: num, to: num, label: z.string().optional() })).optional(),
  interactive: z.boolean(),
}).refine((s) => s.max > s.min && (s.max - s.min) / s.step <= 100);

const BarModel = z.object({
  type: z.literal('BarModel'),
  caption: z.string().optional(),
  mode: z.enum(['part-whole', 'compare']),
  bars: z.array(z.object({
    label: z.string(),
    parts: z.array(z.object({ label: z.string().optional(), value: num.optional(), unknown: z.boolean().optional() })).min(1),
  })).min(1).max(6),
});

const UnitLadder = z.object({
  type: z.literal('UnitLadder'),
  caption: z.string().optional(),
  units: z.array(z.string()).min(2),
  factors: z.array(num.positive()),
  value: num.optional(),
  fromUnit: z.string().optional(),
  interactive: z.boolean(),
}).refine((s) => s.factors.length === s.units.length - 1);

const UISpecSchema = z.union([FractionBars, NumberLine, BarModel, UnitLadder]);

/** Returns a valid UISpec or null (invalid specs are dropped). */
export function validateUISpec(input: unknown): UISpec | null {
  let v = input;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  const r = UISpecSchema.safeParse(v);
  return r.success ? (r.data as UISpec) : null;
}

export const UI_SPEC_DOC = `UI component specs (JSON), pick one "type":
- FractionBars: { "type":"FractionBars", "caption"?:string, "rows":[{"denominator":int,"shaded":int,"label"?:string}], "interactive":bool } — bars split into equal parts; child can tap to shade.
- NumberLine: { "type":"NumberLine", "caption"?:string, "min":number, "max":number, "step":number, "marks"?:[{"value":number,"label"?:string}], "jumps"?:[{"from":number,"to":number,"label"?:string}], "interactive":bool }
- BarModel: { "type":"BarModel", "caption"?:string, "mode":"part-whole"|"compare", "bars":[{"label":string,"parts":[{"label"?:string,"value"?:number,"unknown"?:bool}]}] } — mark the unknown part with "unknown":true.
- UnitLadder: { "type":"UnitLadder", "caption"?:string, "units":["km","m","cm"], "factors":[1000,100], "value"?:number, "fromUnit"?:string, "interactive":bool } — units largest->smallest, factors[i] converts units[i]->units[i+1].`;
