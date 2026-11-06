import { LEKTOR_TIMED_OUT, LEKTOR_UNREACHED } from '../../platform/lektor-remote.ts';
import { type DailyCapWords, dailyCapSentence } from './lektor-daily-cap.ts';
import { correctionInstruction, FEEDBACK_INSTRUCTION, proposalFrom, SECOND_LOOK_INSTRUCTION, secondLookInput } from './lektor-instructions.ts';
import { type CorrectionRequest, type LektorService, LektorServiceError, type PresetId } from './lektor-service.ts';
import { callService, connectionCheck, isRecord, type LektorServiceParts, messageOf } from './lektor-service-call.ts';

/* The free Lektor, on Google's Gemini. */

/**
 * Only the good one: a weaker model's comment would be taken for what the Lektor is like,
 * so when this one can't answer he is told, rather than quietly given something worse.
 */
const THINKING_MODELS = ['gemini-3.6-flash'];
/** Plain corrections are as good on the quick model, and an overloaded one is passed over for the better. */
const CORRECTION_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'];

/** Suggesting takes more thought than correcting: the quicker model hardly offers any. */
const modelsFor = (preset: PresetId): readonly string[] => (preset === 'wording' || preset === 'rewrite' ? THINKING_MODELS : CORRECTION_MODELS);

/** What a refusal means to him. Only the kinds he should hear differently are told apart. */
function refusal(status: number, reply: unknown, parts: GeminiParts): LektorServiceError {
  const message = messageOf(reply);
  const detail = `${status}: ${message}`;
  if (status === LEKTOR_UNREACHED) return new LektorServiceError('offline', detail);
  // Out of time: our words, not Google's.
  if (status === LEKTOR_TIMED_OUT) return new LektorServiceError('overloaded', detail);
  if (status === 429) return new LektorServiceError('limit', detail, message, dailyCapSentence(message, new Date(), parts.dailyCapWords()) ?? '');
  if (status === 401 || status === 403 || /api.?key/i.test(message)) return new LektorServiceError('bad-key', detail, message);
  if (status === 400 && /token|too long|too large|size/i.test(message)) return new LektorServiceError('too-long', detail, message);
  // Google's wording is all the cap and the key are recognised by, so one nobody has met is worth knowing about.
  if (status < 500) parts.warn('A refusal from Google the Lektor does not recognise', { status, message });
  return new LektorServiceError('overloaded', detail, message);
}

/** The reply's words, from the last of the model's steps: an earlier one may be its thinking. */
function wordsOf(reply: unknown): string | null {
  if (!isRecord(reply)) return null;
  if (typeof reply['output_text'] === 'string') return reply['output_text'];
  const steps = reply['steps'];
  if (!Array.isArray(steps)) return null;
  const last = steps.filter(isRecord).findLast((step) => step['type'] === 'model_output');
  const content = last?.['content'];
  if (!Array.isArray(content)) return null;
  const texts = content.filter(isRecord).flatMap((part) => (typeof part['text'] === 'string' ? [part['text']] : []));
  return texts.length === 0 ? null : texts.join('');
}

export interface GeminiParts extends LektorServiceParts {
  dailyCapWords: () => DailyCapWords;
}

export function createGeminiAi(parts: GeminiParts): LektorService {
  async function ask(models: readonly string[], system: string, input: string, signal: AbortSignal): Promise<string> {
    let lastTried = '';
    let lastSaid = '';
    for (const model of models) {
      const request = { provider: 'gemini', action: 'send', key: parts.keyNow(), model, system, input } as const;
      const { status, reply } = await callService(parts, request, signal);
      if (status === 503 || status === 500) {
        lastSaid = messageOf(reply);
        lastTried = `${status}: ${lastSaid}`;
        parts.warn('A Lektor model passed over', { model, status });
        continue;
      }
      if (status !== 200) throw refusal(status, reply, parts);
      const words = wordsOf(reply);
      const finished = !isRecord(reply) || reply['status'] === undefined || reply['status'] === 'completed';
      if (words === null || words.trim() === '' || !finished) {
        throw new LektorServiceError('cut-off', `${model}: ${isRecord(reply) ? String(reply['status']) : 'no reply'}`);
      }
      return words;
    }
    throw new LektorServiceError('overloaded', lastTried, lastSaid);
  }

  async function corrections(request: CorrectionRequest, signal: AbortSignal): Promise<string> {
    const reply = await ask(modelsFor(request.preset), correctionInstruction(request), request.text, signal);
    return proposalFrom(reply, request.text);
  }

  return {
    company: 'google',
    commentModel: THINKING_MODELS[0] ?? '',
    correctionModel: (preset) => modelsFor(preset)[0] ?? '',
    connectionCheck: (signal) => connectionCheck(parts, signal),
    keyCheck: async (key, signal) => {
      const { status, reply } = await callService(parts, { provider: 'gemini', action: 'check', key, model: '', system: '', input: '' }, signal);
      if (status !== 200) throw refusal(status, reply, parts);
    },
    feedback: async (text, signal) => (await ask(THINKING_MODELS, FEEDBACK_INSTRUCTION, text, signal)).trim(),
    secondLook: async (text, earlier, signal) => (await ask(THINKING_MODELS, SECOND_LOOK_INSTRUCTION, secondLookInput(text, earlier), signal)).trim(),
    corrections,
  };
}
