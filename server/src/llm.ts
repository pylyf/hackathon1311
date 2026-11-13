// Thin wrapper around the Anthropic SDK (beta endpoint for server-side refusal fallbacks).
import Anthropic from '@anthropic-ai/sdk';
import { MOCK } from './config.js';

let _client: Anthropic | null = null;
export function client(): Anthropic {
  if (MOCK) throw new Error('Anthropic client requested in MOCK mode');
  if (!_client) _client = new Anthropic();
  return _client;
}

type Params = Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, 'betas' | 'fallbacks' | 'stream'>;

/** messages.create with server-side refusal fallback enabled ("default" routing). */
export async function createMessage(params: Params): Promise<Anthropic.Beta.Messages.BetaMessage> {
  const res = await client().beta.messages.create({
    ...params,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  if (res.stop_reason === 'refusal') {
    throw new Error(`Claude declined the request (${res.stop_details?.category ?? 'unknown'})`);
  }
  return res;
}

export function textOf(msg: Anthropic.Beta.Messages.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** Structured-output JSON call: returns parsed JSON (schema enforced by output_config.format). */
export async function createJson<T>(params: Params & { schema: Record<string, unknown> }): Promise<T> {
  const { schema, ...rest } = params;
  const res = await createMessage({
    ...rest,
    output_config: { ...(rest.output_config ?? {}), format: { type: 'json_schema', schema } },
  });
  if (res.stop_reason === 'max_tokens') throw new Error('Claude response truncated (max_tokens)');
  return JSON.parse(textOf(res)) as T;
}
