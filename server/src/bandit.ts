import type { BanditState, HintStyle, Topic } from './contract.js';
import { FILES, readJson, writeJson } from './store.js';

export const TOPICS: Topic[] = ['word-problems', 'fractions', 'units'];
export const STYLES: HintStyle[] = ['verbal', 'visual', 'story', 'smaller-numbers'];

export function defaultBandit(): BanditState {
  const s = {} as BanditState;
  for (const t of TOPICS) {
    s[t] = {} as Record<HintStyle, [number, number]>;
    for (const st of STYLES) s[t][st] = [1, 1];
  }
  return s;
}

export function loadBandit(): BanditState {
  const raw = readJson<Partial<BanditState>>(FILES.bandit, {});
  const s = defaultBandit();
  for (const t of TOPICS) {
    for (const st of STYLES) {
      const v = raw[t]?.[st];
      if (Array.isArray(v) && v.length === 2) s[t][st] = [Number(v[0]) || 1, Number(v[1]) || 1];
    }
  }
  return s;
}

export function saveBandit(s: BanditState): void {
  writeJson(FILES.bandit, s);
}

// --- Thompson sampling: Beta(a,b) via two Gamma draws (Marsaglia–Tsang) ---
function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function gamma(k: number): number {
  if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(a: number, b: number): number {
  const x = gamma(a);
  const y = gamma(b);
  return x / (x + y);
}

export function pickStyle(topic: Topic): HintStyle {
  const s = loadBandit();
  let best: HintStyle = 'verbal';
  let bestScore = -1;
  for (const st of STYLES) {
    const [a, b] = s[topic][st];
    const score = sampleBeta(a, b);
    if (score > bestScore) {
      bestScore = score;
      best = st;
    }
  }
  return best;
}

export function rewardStyle(topic: Topic, style: HintStyle, success: boolean): BanditState {
  const s = loadBandit();
  if (success) s[topic][style][0] += 1;
  else s[topic][style][1] += 1;
  saveBandit(s);
  return s;
}
