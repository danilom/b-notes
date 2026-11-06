import { LEKTOR_TIMED_OUT, LEKTOR_UNREACHED } from '../../platform/lektor-remote.ts';
import { correctionInstruction, FEEDBACK_INSTRUCTION, proposalFrom, SECOND_LOOK_INSTRUCTION, secondLookInput } from './lektor-instructions.ts';
import { type CorrectionRequest, type LektorService, LektorServiceError } from './lektor-service.ts';
import { callService, connectionCheck, isRecord, type LektorServiceParts, messageOf } from './lektor-service-call.ts';

/* The thorough Lektor, on Claude Opus, which is paid for by the word. */

const MODEL = 'claude-opus-5-5';

function refusal(status: number, reply: unknown, parts: LektorServiceParts): LektorServiceError {
  const message = messageOf(reply);
  const detail = `${status}: ${message}`;
  if (status === LEKTOR_UNREACHED) return new LektorServiceError('offline', detail);
  // Out of time: our words, not Anthropic's.
  if (status === LEKTOR_TIMED_OUT) return new LektorServiceError('overloaded', detail);
  // A monthly limit set in the Console reads the same to him: nothing he does here will help until someone acts there.
  if (/credit balance|specified (workspace )?API usage limits/i.test(message)) {
    return new LektorServiceError('no-credit', detail, message, parts.noCreditSentence());
  }
  if (status === 429) return new LektorServiceError('limit', detail, message);
  if (status === 401 || status === 403) return new LektorServiceError('bad-key', detail, message);
  if (status === 400 && /too long|too large|maximum/i.test(message)) return new LektorServiceError('too-long', detail, message);
  // The money running out is recognised only by Anthropic's wording, so one nobody has met is worth knowing about.
  if (status < 500) parts.warn('A refusal from Anthropic the Lektor does not recognise', { status, message });
  return new LektorServiceError('overloaded', detail, message);
}

export function createClaudeAi(parts: LektorServiceParts): LektorService {
  /**
   * No refusal fallback on another model, though the API offers one: he chose this level
   * and it is paid for, so he hears when it won't do something rather than getting something else.
   */
  async function ask(system: string, input: string, signal: AbortSignal): Promise<string> {
    const request = { provider: 'claude', action: 'send', key: parts.keyNow(), model: MODEL, system, input } as const;
    const { status, reply } = await callService(parts, request, signal);
    if (status !== 200) throw refusal(status, reply, parts);
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

  return {
    company: 'anthropic',
    commentModel: MODEL,
    correctionModel: () => MODEL,
    connectionCheck: (signal) => connectionCheck(parts, signal),
    keyCheck: async (key, signal) => {
      const { status, reply } = await callService(parts, { provider: 'claude', action: 'check', key, model: '', system: '', input: '' }, signal);
      if (status !== 200) throw refusal(status, reply, parts);
    },
    feedback: async (text, signal) => (await ask(FEEDBACK_INSTRUCTION, text, signal)).trim(),
    secondLook: async (text, earlier, signal) => (await ask(SECOND_LOOK_INSTRUCTION, secondLookInput(text, earlier), signal)).trim(),
    corrections,
  };
}
