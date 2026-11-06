import { dailyCapSentence } from './lektor-daily-cap.ts';
import { correctionInstruction, FEEDBACK_INSTRUCTION, proposalFrom, SECOND_LOOK_INSTRUCTION, secondLookInput } from './lektor-instructions.ts';
import { callServer, connectionCheck, isRecord, keyIsWithServer, messageOf } from './lektor-server-call.ts';
import { type CorrectionRequest, type LektorService, LektorServiceError, type PresetId } from './lektor-service.ts';

/* The free Lektor, on Google's Gemini. */

const KEY_STORE = 'lektor-real-key';

/**
 * Only the good one: a weaker model's comment would be taken for what the Lektor is like,
 * so when this one can't answer he is told, rather than quietly given something worse.
 */
const THINKING_MODELS = ['gemini-3.6-flash'];
/** Plain corrections are as good on the quick model, and an overloaded one is passed over for the better. */
const CORRECTION_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'];

/** Suggesting takes more thought than correcting: the quicker model hardly offers any. */
const modelsFor = (preset: PresetId): readonly string[] => (preset === 'wording' || preset === 'rewrite' ? THINKING_MODELS : CORRECTION_MODELS);

function keyNow(): string {
  // None saved means the dev server uses its own, from testdata/.
  return window.sessionStorage.getItem(KEY_STORE) ?? '';
}

/** What a refusal means to him. Only the kinds he should hear differently are told apart. */
function refusal(status: number, reply: unknown): LektorServiceError {
  const message = messageOf(reply);
  const detail = `${status}: ${message}`;
  console.error('The Lektor service refused', { status, message });
  if (status === 502) return new LektorServiceError('offline', detail);
  // Out of time: the dev server's words, not Google's.
  if (status === 504) return new LektorServiceError('overloaded', detail);
  if (status === 429) return new LektorServiceError('limit', detail, message, dailyCapSentence(message, new Date()) ?? '');
  if (status === 401 || status === 403 || /api.?key/i.test(message)) return new LektorServiceError('bad-key', detail, message);
  if (status === 400 && /token|too long|too large|size/i.test(message)) return new LektorServiceError('too-long', detail, message);
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

async function ask(models: readonly string[], system: string, input: string, signal: AbortSignal): Promise<string> {
  let lastTried = '';
  let lastSaid = '';
  for (const model of models) {
    const { status, reply } = await callServer({ action: 'send', key: keyNow(), model, system, input }, signal);
    if (status === 503 || status === 500) {
      lastSaid = messageOf(reply);
      lastTried = `${status}: ${lastSaid}`;
      console.warn('A Lektor model passed over', { model, status });
      continue;
    }
    if (status !== 200) throw refusal(status, reply);
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

export const geminiAi: LektorService = {
  commentModel: THINKING_MODELS[0] ?? '',
  correctionModel: (preset) => modelsFor(preset)[0] ?? '',
  recipient: 'Guglu',
  whoseWords: 'Poruka Gugla',
  isKeySaved: async (signal) => keyIsWithServer(await callServer({ action: 'has-key', key: keyNow() }, signal)),
  // The dev server has its own, from testdata/, for when none has been pasted.
  hasKey: () => true,
  rememberKey: (key) => window.sessionStorage.setItem(KEY_STORE, key),
  connectionCheck,
  keyCheck: async (key, signal) => {
    const { status, reply } = await callServer({ action: 'check', key }, signal);
    if (status !== 200) throw refusal(status, reply);
  },
  feedback: async (text, signal) => (await ask(THINKING_MODELS, FEEDBACK_INSTRUCTION, text, signal)).trim(),
  secondLook: async (text, earlier, signal) => (await ask(THINKING_MODELS, SECOND_LOOK_INSTRUCTION, secondLookInput(text, earlier), signal)).trim(),
  corrections,
};
