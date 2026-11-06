import { correctionInstruction, FEEDBACK_INSTRUCTION, proposalFrom, SECOND_LOOK_INSTRUCTION, secondLookInput } from './lektor-instructions.ts';
import { callServer, connectionCheck, isRecord, keyIsWithServer, messageOf } from './lektor-server-call.ts';
import { type CorrectionRequest, type LektorService, LektorServiceError, NO_CREDIT_SENTENCE } from './lektor-service.ts';
import { costOfReply } from './lektor-spending.ts';

/* The thorough Lektor, on Claude Opus, which is paid for by the word. */

const MODEL = 'claude-opus-5-5';
const KEY_STORE = 'lektor-claude-key';
const SPENT_STORE = 'lektor-claude-spent';

function spentSoFar(): number {
  const amount = Number(window.localStorage.getItem(SPENT_STORE));
  return Number.isFinite(amount) ? amount : 0;
}

const count = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** A reply is paid for even if it is then refused or cut off. */
function noteSpending(reply: unknown): void {
  if (!isRecord(reply) || !isRecord(reply['usage'])) return;
  const { inputTokens, outputTokens } = reply['usage'];
  const cost = costOfReply({ inputTokens: count(inputTokens), outputTokens: count(outputTokens) });
  window.localStorage.setItem(SPENT_STORE, String(spentSoFar() + cost));
}

function refusal(status: number, reply: unknown): LektorServiceError {
  const message = messageOf(reply);
  const detail = `${status}: ${message}`;
  console.error('The Lektor service refused', { status, message });
  if (status === 502) return new LektorServiceError('offline', detail);
  // Out of time: the dev server's words, not Anthropic's.
  if (status === 504) return new LektorServiceError('overloaded', detail);
  if (/credit balance/i.test(message)) return new LektorServiceError('no-credit', detail, message, NO_CREDIT_SENTENCE);
  if (status === 429) return new LektorServiceError('limit', detail, message);
  if (status === 401 || status === 403) return new LektorServiceError('bad-key', detail, message);
  if (status === 400 && /too long|too large|maximum/i.test(message)) return new LektorServiceError('too-long', detail, message);
  return new LektorServiceError('overloaded', detail, message);
}

/**
 * No refusal fallback on another model, though the API offers one: he chose this level
 * and pays for it, so he hears when it won't do something rather than getting something else.
 */
async function ask(system: string, input: string, signal: AbortSignal): Promise<string> {
  const key = window.sessionStorage.getItem(KEY_STORE) ?? '';
  const { status, reply } = await callServer({ provider: 'claude', action: 'send', key, model: MODEL, system, input }, signal);
  if (status !== 200) throw refusal(status, reply);
  noteSpending(reply);
  if (!isRecord(reply)) throw new LektorServiceError('cut-off', 'no reply');
  const { text, stopReason, explanation } = reply;
  if (stopReason === 'refusal') {
    throw new LektorServiceError('declined', 'refusal', typeof explanation === 'string' ? explanation : '');
  }
  if (typeof text !== 'string' || text.trim() === '' || stopReason !== 'end_turn') {
    throw new LektorServiceError('cut-off', `${MODEL}: ${String(stopReason)}`);
  }
  return text;
}

async function corrections(request: CorrectionRequest, signal: AbortSignal): Promise<string> {
  return proposalFrom(await ask(correctionInstruction(request), request.text, signal), request.text);
}

export const claudeAi: LektorService = {
  commentModel: MODEL,
  correctionModel: () => MODEL,
  recipient: 'firmi Anthropic',
  whoseWords: 'Poruka firme Anthropic',
  spent: spentSoFar,
  isKeySaved: async (signal) => {
    const key = window.sessionStorage.getItem(KEY_STORE) ?? '';
    return keyIsWithServer(await callServer({ provider: 'claude', action: 'has-key', key }, signal));
  },
  // The dev server has its own, from testdata/, and answers as for a bad key if it has none either.
  hasKey: () => true,
  rememberKey: (key) => window.sessionStorage.setItem(KEY_STORE, key),
  connectionCheck,
  keyCheck: async (key, signal) => {
    const { status, reply } = await callServer({ provider: 'claude', action: 'check', key }, signal);
    if (status !== 200) throw refusal(status, reply);
  },
  feedback: async (text, signal) => (await ask(FEEDBACK_INSTRUCTION, text, signal)).trim(),
  secondLook: async (text, earlier, signal) => (await ask(SECOND_LOOK_INSTRUCTION, secondLookInput(text, earlier), signal)).trim(),
  corrections,
};
