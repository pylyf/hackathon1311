// Photo -> structured problem + privately solved, mathjs-verified hidden answer.
import { evaluate } from 'mathjs';
import { MOCK, MODEL_SOLVER } from './config.js';
import type { MemoryNote, Topic, UISpec } from './contract.js';
import { approxEq } from './guard.js';
import { createJson } from './llm.js';
import { mockParseProblem } from './mock.js';
import type { HiddenAnswer } from './state.js';
import { UI_SPEC_DOC, validateUISpec } from './uispec.js';

export interface ParsedProblem {
  text: string;
  topic: Topic;
  question: string;
  quantities: { name: string; value: string; unit: string }[];
  answer: HiddenAnswer;
  starterVisual: UISpec | null;
  introText: string;
}

export class NotAProblemError extends Error {}

/** Evaluate a plain-number mathjs expression; null if it fails or is not a finite number. */
export function evalExpression(expression: string): number | null {
  try {
    const r = evaluate(String(expression).replace(/×/g, '*').replace(/÷/g, '/'));
    const n = typeof r === 'number' ? r : Number(r?.toString());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** mathjs check of a model's answer. Prefers the computed value when the model's arithmetic disagrees. */
export function verifyAnswer(expression: string, modelValue: number): { value: number; verified: boolean; computed: number | null } {
  const computed = evalExpression(expression);
  // The model often reports fractions as rounded decimals (2/3 → 0.6667). Accept rounding
  // differences up to 4 decimal places; the exact computed value is what we keep.
  const verified = computed !== null
    && (approxEq(computed, modelValue) || Math.abs(computed - modelValue) <= 5e-4 * Math.max(1, Math.abs(computed)));
  return { value: computed ?? modelValue, verified, computed };
}

interface SolverOutput {
  isMathProblem: boolean;
  text: string;
  topic: Topic;
  question: string;
  quantities: { name: string; value: string; unit: string }[];
  answerValue: number;
  answerUnit: string;
  answerExpression: string;
  introText: string;
  starterVisualJson: string;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isMathProblem', 'text', 'topic', 'question', 'quantities', 'answerValue', 'answerUnit', 'answerExpression', 'introText', 'starterVisualJson'],
  properties: {
    isMathProblem: { type: 'boolean' },
    text: { type: 'string', description: 'The problem exactly as written in the photo (one problem only).' },
    topic: { type: 'string', enum: ['word-problems', 'fractions', 'units'] },
    question: { type: 'string', description: 'What the problem asks for, in one short sentence.' },
    quantities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'value', 'unit'],
        properties: { name: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' } },
      },
    },
    answerValue: { type: 'number', description: 'Final numeric answer (decimal form, e.g. 0.5 for 1/2).' },
    answerUnit: { type: 'string', description: 'Unit of the answer as a mathjs unit name (e.g. "cm", "kg", "min") or "" if none / not convertible (apples, pizza).' },
    answerExpression: { type: 'string', description: 'A mathjs expression with plain numbers that computes answerValue, e.g. "3/4 - 1/4" or "(12 - 4) * 3".' },
    introText: { type: 'string' },
    starterVisualJson: { type: 'string', description: 'A UI spec as a JSON string, or "".' },
  },
};

function systemPrompt(notes: MemoryNote[]): string {
  const interests = notes.filter((n) => n.kind === 'interest').map((n) => `- ${n.text}`).join('\n');
  return `You read a photo of a primary-school (age 6-10) math homework problem and privately solve it for a tutoring app.
If several problems are visible, take the first unsolved one. If the photo has no math problem, set isMathProblem=false and fill the other fields with empty values.

Fields:
- topic: "fractions" if the problem is about fractions, "units" if it is about measurement/unit conversion, otherwise "word-problems".
- answerValue / answerExpression: solve carefully; the expression must evaluate to answerValue in mathjs.
- introText: what the tutor says out loud first, to the child: 2-3 short, warm, simple sentences that retell the story in kid-friendly words and say what we need to find, then ONE easy opening question about the story (e.g. what do we know / what happens first). It is spoken by text-to-speech: no markdown, no emojis, write fractions in words ("three quarters"). It MUST NOT contain the answer or any hint that gives it away.
- starterVisualJson: a helpful starting visual for this problem that shows the GIVEN situation, never the result (e.g. for 3/4 - 1/4 show a bar with 3 of 4 parts shaded, not the result). Return "" if no component fits.
${UI_SPEC_DOC}
${interests ? `\nThe child's interests (you may use them in the intro):\n${interests}` : ''}`;
}

export async function parseProblem(imageBase64: string, mediaType: 'image/jpeg' | 'image/png', notes: MemoryNote[]): Promise<ParsedProblem> {
  if (MOCK) return mockParseProblem();

  const out = await createJson<SolverOutput>({
    model: MODEL_SOLVER,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    system: systemPrompt(notes),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Read and solve this homework problem.' },
        ],
      },
    ],
    schema: SCHEMA,
  });

  if (!out.isMathProblem || !out.text.trim()) throw new NotAProblemError('I could not find a math problem in that photo. Try again with the problem in focus.');

  const { value, verified } = verifyAnswer(out.answerExpression, out.answerValue);
  if (!verified) console.warn(`[problem] answer not verified: model=${out.answerValue} mathjs(${out.answerExpression})=${value}`);

  return {
    text: out.text.trim(),
    topic: out.topic,
    question: out.question,
    quantities: out.quantities,
    answer: { value, unit: out.answerUnit.trim() || null, expression: out.answerExpression, verified },
    starterVisual: out.starterVisualJson ? validateUISpec(out.starterVisualJson) : null,
    introText: out.introText.trim(),
  };
}
