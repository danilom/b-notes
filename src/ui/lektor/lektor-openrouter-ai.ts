import { LEKTOR_TIMED_OUT, LEKTOR_UNREACHED } from '../../platform/lektor-remote.ts';
import { type LektorService, LektorServiceError } from './lektor-service.ts';
import { callService, codeOf, isRecord, type LektorServiceParts, messageOf } from './lektor-service-call.ts';

/*
  The paid Lektors, through OpenRouter, which is paid for by the word. Which model it asks is the
  model chain's to say: Opus for the utisak and the rework, Flash for letters and grammar, and
  Flash for a slow free request handed on. No host rules: OpenRouter routes by its own default.
*/

function failureOf(status: number, reply: unknown, parts: LektorServiceParts): LektorServiceError['failure'] | null {
  if (status === LEKTOR_UNREACHED) return 'offline';
  if (status === LEKTOR_TIMED_OUT) return 'busy';
  if (status === 401) return 'bad-key';
  // The account or the key's own cap is spent; no retry helps (spec §2).
  if (status === 402) return 'no-credit';
  // Moderation: OpenRouter refusing this text.
  if (status === 403) return 'declined';
  if (status === 404) {
    // "No endpoints found…": the routing rules allow no host at all, which is our mistake, not his.
    parts.error('OpenRouter found no host for a Lektor request', { status, message: messageOf(reply) });
    return 'busy';
  }
  if (status === 400 && /too long|too large|context|maximum/i.test(messageOf(reply))) return 'too-long';
  // A timeout, a rate limit, a model down, no host free: OpenRouter's own fallbacks are spent, so busy.
  if (status === 408 || status === 429 || status >= 500) return 'busy';
  return null;
}

function refusal(status: number, reply: unknown, parts: LektorServiceParts): LektorServiceError {
  const message = messageOf(reply);
  const detail = `${status} ${codeOf(reply)}: ${message}`;
  const known = failureOf(status, reply, parts);
  if (known !== null) return new LektorServiceError(known, detail, known === 'offline' ? '' : message);
  parts.warn('A refusal from OpenRouter the Lektor does not recognise', { status, message });
  return new LektorServiceError('busy', detail, message);
}

/** How the reply ended, when it was read whole: anything but a whole set of words is a failure of its own kind. */
function endingFailure(finish: unknown, text: string): LektorServiceError['failure'] | null {
  if (finish === 'content_filter') return 'declined';
  if (finish === 'error') return 'busy';
  if (finish !== 'stop' || text.trim() === '') return 'cut-off';
  return null;
}

export function createOpenRouterAi(parts: LektorServiceParts): LektorService {
  return {
    company: 'openrouter',
    keyCheck: async (key, signal) => {
      const { status, reply } = await callService(parts, { provider: 'openrouter', action: 'check', key, model: '', system: '', input: '' }, signal);
      if (status !== 200) throw refusal(status, reply, parts);
    },
    ask: async ({ model, system, input, onProgress }, signal) => {
      const request = { provider: 'openrouter', action: 'send', key: parts.keyNow(), model, system, input } as const;
      const { status, reply } = await callService(parts, request, signal, onProgress);
      if (status !== 200) throw refusal(status, reply, parts);
      if (!isRecord(reply)) throw new LektorServiceError('cut-off', `${model}: no reply`);
      const text = typeof reply['text'] === 'string' ? reply['text'] : '';
      const failure = endingFailure(reply['finish'], text);
      if (failure !== null) throw new LektorServiceError(failure, `${model}: ${String(reply['finish'])}`);
      return {
        words: text,
        model: typeof reply['model'] === 'string' ? reply['model'] : model,
        cost: typeof reply['cost'] === 'number' ? reply['cost'] : null,
      };
    },
  };
}
