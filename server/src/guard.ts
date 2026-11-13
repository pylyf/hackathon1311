// Answer handling: extract numbers from what the child said, compare with the hidden answer,
// and detect answer leaks in tutor text / UI specs.
import { evaluate, unit as mathUnit } from 'mathjs';
import type { UISpec } from './contract.js';
import type { HiddenAnswer } from './state.js';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Regex source for the spelled-out integer (0..100), or null. */
export function spell(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  if (n < 20) return ONES[n];
  if (n === 100) return 'one hundred';
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}[\\s-]?${ONES[n % 10]}` : t;
}

const ORD: Record<number, string[]> = {
  2: ['half', 'halve'], 3: ['third'], 4: ['quarter', 'fourth'], 5: ['fifth'], 6: ['sixth'], 7: ['seventh'],
  8: ['eighth'], 9: ['ninth'], 10: ['tenth'], 11: ['eleventh'], 12: ['twelfth'], 20: ['twentieth'], 100: ['hundredth'],
};
for (let d = 13; d < 20; d++) ORD[d] = [`${ONES[d]}th`];
const ordinals = (d: number): string[] => ORD[d] ?? [];

const WORD_TO_NUM: Record<string, number> = Object.fromEntries(ONES.map((w, i) => [w, i]));
TENS.forEach((w, i) => { if (w) WORD_TO_NUM[w] = i * 10; });
WORD_TO_NUM['a'] = 1;
WORD_TO_NUM['an'] = 1;
const ORD_TO_DEN: Record<string, number> = {};
for (const [d, words] of Object.entries(ORD)) for (const w of words) ORD_TO_DEN[w] = Number(d);
ORD_TO_DEN['halves'] = 2;

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : Math.abs(a); }

/** Rational p/q (q <= 100) if the value is (close to) a simple fraction. */
export function asFraction(v: number): [number, number] | null {
  for (let q = 1; q <= 100; q++) {
    const p = Math.round(v * q);
    if (Math.abs(p / q - v) < 1e-9) { const g = gcd(p, q) || 1; return [p / g, q / g]; }
  }
  return null;
}

export const approxEq = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

// ---------------- extraction from child speech/text ----------------

export interface NumberMention { value: number; index: number; unitWord?: string }

const WORDNUM = `(?:${[...ONES, ...TENS.filter(Boolean), 'a', 'an'].join('|')})`;
const ORDWORD = `(?:${Object.keys(ORD_TO_DEN).sort((a, b) => b.length - a.length).map((w) => `${w}s?`).join('|')})`;

const wn = (s: string): number => (/^\d/.test(s) ? Number(s) : WORD_TO_NUM[s.toLowerCase()] ?? NaN);
const den = (w: string): number => ORD_TO_DEN[w] ?? ORD_TO_DEN[w.replace(/s$/, '')] ?? NaN;

/** All numeric mentions in order of appearance (fractions, mixed numbers, decimals, integers, number words). */
export function extractNumbers(text: string): NumberMention[] {
  const t = text.toLowerCase().replace(/,(?=\d{3}\b)/g, '');
  const found: (NumberMention & { end: number })[] = [];
  const taken = (s: number, e: number) => found.some((f) => s < f.end && e > f.index);
  const add = (re: RegExp, fn: (m: RegExpMatchArray) => number | null) => {
    for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      if (taken(s, e)) continue;
      const v = fn(m);
      if (v === null || !Number.isFinite(v)) continue;
      const after = t.slice(e).match(/^\s*([a-z]+)/);
      found.push({ value: v, index: s, end: e, unitWord: after?.[1] });
    }
  };
  add(/\b(\d+)\s+(\d+)\s*\/\s*(\d+)\b/, (m) => Number(m[1]) + Number(m[2]) / Number(m[3])); // 1 1/2
  add(new RegExp(`\\b(\\d+|${WORDNUM})\\s+and\\s+(\\d+|${WORDNUM})[\\s-]+(${ORDWORD})\\b`), (m) => wn(m[1]) + wn(m[2]) / den(m[3])); // one and a half
  add(/(\d+)\s*\/\s*(\d+)/, (m) => (Number(m[2]) ? Number(m[1]) / Number(m[2]) : null)); // 3/4
  add(new RegExp(`\\b(\\d+|${WORDNUM})\\s+(?:over|out of)\\s+(\\d+|${WORDNUM})\\b`), (m) => (wn(m[2]) ? wn(m[1]) / wn(m[2]) : null));
  add(new RegExp(`\\b(\\d+|${WORDNUM})[\\s-]+(${ORDWORD})\\b`), (m) => wn(m[1]) / den(m[2])); // two quarters, a half
  add(/\bhalf\b/, () => 0.5);
  add(/(\d*\.\d+|\d+)/, (m) => Number(m[1]));
  add(new RegExp(`\\b(${TENS.filter(Boolean).join('|')})[\\s-](${ONES.slice(1, 10).join('|')})\\b`), (m) => WORD_TO_NUM[m[1]] + WORD_TO_NUM[m[2]]);
  add(new RegExp(`\\b(${[...ONES, ...TENS.filter(Boolean)].join('|')})\\b`), (m) => WORD_TO_NUM[m[1]]);
  return found.sort((a, b) => a.index - b.index).map(({ end: _e, ...rest }) => rest);
}

/** Value of a mention in the hidden answer's unit, if a unit word follows and is convertible. */
function inAnswerUnit(m: NumberMention, ans: HiddenAnswer): number {
  if (!ans.unit || !m.unitWord) return m.value;
  try {
    return mathUnit(m.value, m.unitWord).toNumber(ans.unit);
  } catch {
    return m.value;
  }
}

export function mentionMatches(m: NumberMention, ans: HiddenAnswer): boolean {
  return approxEq(m.value, ans.value) || approxEq(inAnswerUnit(m, ans), ans.value);
}

/** Does the child's message state the correct answer (the LAST number mentioned)? */
export function saidCorrectAnswer(text: string, ans: HiddenAnswer): boolean {
  const ms = extractNumbers(text);
  return ms.length > 0 && mentionMatches(ms[ms.length - 1], ans);
}

export function mentionsAnswerAnywhere(text: string, ans: HiddenAnswer): boolean {
  return extractNumbers(text).some((m) => mentionMatches(m, ans));
}

export type CheckResult = 'correct' | 'close' | 'wrong' | 'invalid';

/** check_answer tool: evaluate a value expression (+ optional unit) against the hidden answer. */
export function checkAnswer(value: string, unitStr: string | undefined, ans: HiddenAnswer): CheckResult {
  let v: number;
  try {
    const r = evaluate(String(value).replace(/×/g, '*').replace(/÷/g, '/'));
    v = typeof r === 'number' ? r : Number(r?.toString());
  } catch {
    const ms = extractNumbers(String(value));
    if (!ms.length) return 'invalid';
    v = ms[ms.length - 1].value;
  }
  if (!Number.isFinite(v)) return 'invalid';
  const u = unitStr?.trim();
  if (ans.unit && u && u !== ans.unit) {
    try { v = mathUnit(v, u).toNumber(ans.unit); } catch { /* not convertible: compare raw */ }
  }
  if (approxEq(v, ans.value)) return 'correct';
  if (Math.abs(v - ans.value) <= 0.1 * Math.max(Math.abs(ans.value), 1e-9)) return 'close';
  return 'wrong';
}

// ---------------- leak detection ----------------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex sources that express the answer value (number, equivalent fractions, decimals, words). */
function valuePatterns(v: number): string[] {
  const pats: string[] = [];
  if (Number.isInteger(v)) {
    pats.push(`(?<![\\d.,/])${v}(?![\\d/]|[.,]\\d)`);
    const sp = spell(v);
    if (sp) pats.push(`\\b${sp}\\b`);
    return pats;
  }
  const dec = String(Number(v.toFixed(6)));
  pats.push(`(?<![\\d.])${esc(dec)}(?!\\d)`);
  if (dec.startsWith('0.')) pats.push(`(?<![\\d.])${esc(dec.slice(1))}(?!\\d)`);
  if (v > 0 && v <= 1) pats.push(`(?<![\\d.])${Number((v * 100).toFixed(4))}\\s*(%|percent)`);
  const frac = asFraction(v);
  if (frac) {
    const [p, q] = frac;
    const whole = Math.floor(p / q);
    const rp = p - whole * q;
    for (let k = 1; k <= 12 && q * k <= 100; k++) {
      const a = p * k, b = q * k;
      pats.push(`(?<![\\d.])${a}\\s*/\\s*${b}(?!\\d)`);
      const sa = spell(a) ?? String(a), sb = spell(b) ?? String(b);
      pats.push(`\\b(${a}|${sa})\\s+(over|out of)\\s+(${b}|${sb})\\b`);
      for (const o of ordinals(b)) {
        pats.push(`\\b(${a}|${sa})[\\s-]+${o}s?\\b`);
        if (a === 1) pats.push(`\\ban?[\\s-]+${o}\\b`);
      }
      if (whole > 0) {
        const ra = rp * k;
        pats.push(`(?<![\\d.])${whole}\\s+${ra}\\s*/\\s*${b}(?!\\d)`);
        const sw = spell(whole) ?? String(whole);
        for (const o of ordinals(b)) pats.push(`\\b(${whole}|${sw})\\s+and\\s+(an?|${spell(ra) ?? ra})[\\s-]+${o}s?\\b`);
      }
    }
    if (p === 1 && q === 2) pats.push('\\bhalf\\b');
  }
  return pats;
}

export interface LeakContext { problemText: string }

/**
 * True if the text reveals the hidden answer. If a form of the answer already appears in the
 * problem text (e.g. answer 3 and the story mentions 3 apples), only "strong" forms are flagged:
 * "= 3", "is 3", "answer ... 3", "3 <unit>".
 */
export function textLeaks(text: string, ans: HiddenAnswer, ctx: LeakContext): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  const problem = ctx.problemText.toLowerCase();
  const unitPat = ans.unit ? `\\s*${esc(ans.unit.toLowerCase())}s?\\b` : null;
  for (const p of valuePatterns(ans.value)) {
    const weak = new RegExp(p, 'i');
    if (!weak.test(problem) && weak.test(t)) return true;
    const strong = [
      `(=|equals?|is|are|makes?|gives?|get|leaves?|left( with)?|answer\\b[^.?!]{0,20})\\s*(about\\s+|exactly\\s+|just\\s+)?(${p})`,
      unitPat ? `(${p})${unitPat}` : null,
    ].filter((s): s is string => !!s);
    if (strong.some((s) => new RegExp(s, 'i').test(t) && !new RegExp(s, 'i').test(problem))) return true;
  }
  return false;
}

/** Leak check for UI specs (blocks and whole scenes): values equal to the answer + any text labels. */
export function uiLeaks(ui: UISpec | null, ans: HiddenAnswer, ctx: LeakContext): boolean {
  if (!ui) return false;
  if (ui.type === 'Scene') {
    return ui.steps.some((st) => textLeaks(st.say ?? '', ans, ctx) || st.blocks.some((b) => uiLeaks(b, ans, ctx)));
  }
  // a number that equals the answer leaks unless that number is a given in the story
  const shownNumberLeaks = (v: number) => approxEq(v, ans.value) && textLeaks(String(v), ans, ctx);
  const texts: string[] = ['caption' in ui ? ui.caption ?? '' : ''];
  switch (ui.type) {
    case 'FractionBars':
      for (const r of ui.rows) {
        texts.push(r.label ?? '');
        if (r.denominator > 0 && approxEq(r.shaded / r.denominator, ans.value)) return true;
      }
      break;
    case 'FractionPie':
      for (const p of ui.pies) {
        texts.push(p.label ?? '');
        if (p.parts > 0 && approxEq(p.shaded / p.parts, ans.value)) return true;
      }
      break;
    case 'NumberLine':
    case 'Ruler':
      for (const m of ui.marks ?? []) {
        texts.push(m.label ?? '');
        if (approxEq(m.value, ans.value)) return true;
      }
      if (ui.type === 'NumberLine') {
        for (const j of ui.jumps ?? []) {
          texts.push(j.label ?? '');
          if (approxEq(j.to, ans.value)) return true;
        }
      }
      break;
    case 'BarModel':
      for (const b of ui.bars) {
        texts.push(b.label);
        for (const p of b.parts) {
          texts.push(p.label ?? '');
          if (!p.unknown && typeof p.value === 'number' && shownNumberLeaks(p.value)) return true;
        }
      }
      break;
    case 'BarChart':
      for (const b of ui.bars) {
        texts.push(b.label);
        if (!b.unknown && shownNumberLeaks(b.value)) return true;
      }
      break;
    case 'Counters': {
      for (const g of ui.groups) {
        texts.push(g.label ?? '');
        if (shownNumberLeaks(g.count)) return true;
      }
      const last = ui.groups[ui.groups.length - 1];
      if (ui.crossOut && last && approxEq(last.count - ui.crossOut, ans.value)) return true; // shows what is left
      break;
    }
    case 'PlaceValue':
      if (shownNumberLeaks(ui.number)) return true;
      break;
    case 'UnitLadder':
      if (typeof ui.value === 'number' && ans.unit && ui.fromUnit === ans.unit && approxEq(ui.value, ans.value)) return true;
      break;
    case 'Equation':
      texts.push(...ui.lines);
      break;
    case 'Compare':
      texts.push(ui.left, ui.right);
      break;
    case 'Choice':
      texts.push(ui.question); // options may include the answer: the child still has to choose
      break;
    case 'Callout':
      texts.push(ui.text);
      break;
    case 'Picture':
      for (const it of ui.items) {
        texts.push(it.label ?? '');
        if (typeof it.count === 'number' && shownNumberLeaks(it.count)) return true;
      }
      break;
    case 'Steps':
      texts.push(...ui.steps);
      break;
    case 'Balance':
      texts.push(ui.left.label, ui.right.label);
      break;
    case 'Money': {
      const total = ui.coins.reduce((a, c) => a + c.value * c.count, 0);
      if (shownNumberLeaks(total) || shownNumberLeaks(total / 100)) return true;
      break;
    }
    case 'Shape':
      texts.push(...ui.sides);
      break;
    case 'Tally':
      for (const r of ui.rows) {
        texts.push(r.label);
        if (!r.unknown && shownNumberLeaks(r.count)) return true;
      }
      break;
    default:
      break;
  }
  return texts.some((x) => textLeaks(x, ans, ctx));
}
