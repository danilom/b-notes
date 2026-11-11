import type { LektorProgress } from './lektor-progress.ts';
import { jsonOf, readStreamLines, recordOf, textOf } from './server-sent-events.ts';

/*
  Reads OpenRouter's streamed chat completion to the end, as recorded on 2026-11-11
  (test/fixtures/lektor-api/openrouter-stream-*): `: OPENROUTER PROCESSING` comments while it
  waits, then chunks whose `delta.reasoning_details` are the thinking and `delta.content` the
  words. The finish comes as a chunk with `finish_reason`, then a last one repeating it with
  `usage.cost`, then `[DONE]`. An error mid-stream is a chunk with a top-level `error`.
  Keeps nothing and logs nothing.
*/

export interface OpenRouterReply {
  text: string;
  /** `stop` when it finished; `length` cut off; `content_filter` refused; `error` failed mid-stream. */
  finish: string | null;
  /** The model that ran, as the reply names it. */
  model: string | null;
  /** In dollars, as OpenRouter charged it; null if the reply never said. */
  cost: number | null;
  usage: unknown;
  error: { code: number | string; message: string } | null;
}

type Phase = 'none' | 'thinking' | 'writing';

function errorOf(value: unknown): OpenRouterReply['error'] {
  const error = recordOf(value);
  if (error === null) return null;
  const code = error['code'];
  return { code: typeof code === 'number' || typeof code === 'string' ? code : '', message: textOf(error['message']) ?? '' };
}

function hasThinking(delta: Record<string, unknown> | null): boolean {
  const details = delta?.['reasoning_details'];
  return (Array.isArray(details) && details.length > 0) || (textOf(delta?.['reasoning']) ?? '') !== '';
}

/**
 * @param chunks The response body, split wherever the network split it.
 * @param onProgress Told each change of phase, and each piece of writing; `started` once, on the first chunk.
 */
export async function readOpenRouterStream(chunks: AsyncIterable<Uint8Array>, onProgress: (progress: LektorProgress) => void): Promise<OpenRouterReply> {
  const reply: OpenRouterReply = { text: '', finish: null, model: null, cost: null, usage: null, error: null };
  let phase: Phase = 'none';
  let hasStarted = false;

  const applyChunk = (chunk: Record<string, unknown>): void => {
    reply.model = textOf(chunk['model']) ?? reply.model;
    if (!hasStarted) {
      hasStarted = true;
      onProgress({ kind: 'started', model: reply.model ?? '' });
    }
    reply.error = errorOf(chunk['error']) ?? reply.error;
    const usage = recordOf(chunk['usage']);
    if (usage !== null) {
      reply.usage = usage;
      if (typeof usage['cost'] === 'number') reply.cost = usage['cost'];
    }
    const choice = recordOf(Array.isArray(chunk['choices']) ? chunk['choices'].at(0) : null);
    // The last chunk repeats the finish beside the cost: the first one said is the one that counts.
    reply.finish ??= textOf(choice?.['finish_reason']);
    const delta = recordOf(choice?.['delta']);
    const content = textOf(delta?.['content']) ?? '';
    if (content !== '') {
      reply.text += content;
      phase = 'writing';
      onProgress({ kind: 'writing', characters: reply.text.length });
    } else if (phase === 'none' && hasThinking(delta)) {
      phase = 'thinking';
      onProgress({ kind: 'thinking' });
    }
  };

  await readStreamLines(chunks, (line) => {
    if (line.kind !== 'data') return;
    const chunk = jsonOf(line.data);
    if (chunk !== null) applyChunk(chunk);
  });
  return reply;
}
