import { LEKTOR_TIMED_OUT, LEKTOR_UNREACHED } from '../../platform/lektor-remote.ts';
import { type LektorService, LektorServiceError } from './lektor-service.ts';
import { callService, codeOf, isRecord, type LektorServiceParts, messageOf, reasonsOf } from './lektor-service-call.ts';

/*
  The free Lektor, on Google's free tier, through `/interactions`, streamed. Which model it asks
  is the model chain's to say (lektor-model-chain.ts): 3.8 first, 3.6 standing in where allowed.
*/

/** The day's free requests are spent: Google's code for it, and only that (spec §2). */
const DAILY_QUOTA = 'quota_exceeded';
/** Busy, a per-minute limit, or out of time at Google's end: all "try a bit later". */
const BUSY_CODES = new Set(['service_unavailable', 'rate_limit_exceeded', 'too_many_requests', 'deadline_exceeded', 'unavailable', 'internal']);
/** Google's own refusals to write about this text. */
const BLOCKED_CODES = new Set(['safety', 'prohibited_content', 'recitation', 'blocklist', 'content_blocked', 'spii']);
const KEY_CODES = new Set(['permission_denied', 'authentication', 'unauthenticated']);

function failureOf(status: number, reply: unknown): LektorServiceError['failure'] | null {
  if (status === LEKTOR_UNREACHED) return 'offline';
  // Out of time: our words, not Google's, and in his eyes the same as busy.
  if (status === LEKTOR_TIMED_OUT) return 'busy';
  const code = codeOf(reply).toLowerCase();
  if (code === DAILY_QUOTA) return 'daily-limit';
  if (BUSY_CODES.has(code)) return 'busy';
  if (BLOCKED_CODES.has(code)) return 'declined';
  if (KEY_CODES.has(code) || reasonsOf(reply).includes('API_KEY_INVALID')) return 'bad-key';
  if (status === 401 || status === 403) return 'bad-key';
  if (status === 400 && /token|too long|too large|size/i.test(messageOf(reply))) return 'too-long';
  // Any other 429 is a per-minute limit, never the day's (spec §2): busy.
  if (status === 429 || status >= 500) return 'busy';
  return null;
}

/** What a refusal means to him. Only the kinds he should hear differently are told apart. */
function refusal(status: number, reply: unknown, parts: LektorServiceParts): LektorServiceError {
  const message = messageOf(reply);
  const detail = `${status} ${codeOf(reply)}: ${message}`;
  const known = failureOf(status, reply);
  if (known !== null) return new LektorServiceError(known, detail, known === 'offline' ? '' : message);
  // Only a code the Lektor doesn't know ends up here, so one nobody has met is worth knowing about.
  parts.warn('A refusal from Google the Lektor does not recognise', { status, code: codeOf(reply), message });
  return new LektorServiceError('busy', detail, message);
}

export function createGeminiAi(parts: LektorServiceParts): LektorService {
  return {
    company: 'google',
    keyCheck: async (key, signal) => {
      const { status, reply } = await callService(parts, { provider: 'gemini', action: 'check', key, model: '', system: '', input: '' }, signal);
      if (status !== 200) throw refusal(status, reply, parts);
    },
    ask: async ({ model, system, input, onProgress }, signal) => {
      const request = { provider: 'gemini', action: 'send', key: parts.keyNow(), model, system, input } as const;
      const { status, reply } = await callService(parts, request, signal, onProgress);
      if (status !== 200) throw refusal(status, reply, parts);
      const text = isRecord(reply) && typeof reply['text'] === 'string' ? reply['text'] : '';
      const finished = isRecord(reply) && reply['status'] === 'completed';
      if (!finished || text.trim() === '') {
        throw new LektorServiceError('cut-off', `${model}: ${isRecord(reply) ? String(reply['status']) : 'no reply'}`);
      }
      const answeredBy = isRecord(reply) && typeof reply['model'] === 'string' ? reply['model'] : model;
      return { words: text, model: answeredBy, cost: null };
    },
  };
}
