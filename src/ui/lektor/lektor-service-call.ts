import { LEKTOR_STOPPED, type LektorRequest, type LektorResponse } from '../../platform/lektor-remote.ts';
import { LektorServiceError } from './lektor-service.ts';

/** How a service reaches the host, and what it needs to know from outside. */
export interface LektorServiceParts {
  ask: (request: LektorRequest, stop: AbortSignal) => Promise<LektorResponse>;
  keyNow: () => string;
  /** The final sentences a service composes, in his language. */
  noCreditSentence: () => string;
  /** Says what became of a refusal; never his text. */
  warn: (message: string, detail: unknown) => void;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Asks, and turns his having stopped it back into what stopping is everywhere else. */
export async function callService(parts: LektorServiceParts, request: LektorRequest, signal: AbortSignal): Promise<LektorResponse> {
  const response = await parts.ask(request, signal);
  if (response.status === LEKTOR_STOPPED || signal.aborted) throw new DOMException('Stopped', 'AbortError');
  return response;
}

/** The service's own words about what went wrong, if it gave any. */
export function messageOf(answer: unknown): string {
  // Gemini's Interactions wraps its refusals in a list; nothing else does.
  const reply: unknown = Array.isArray(answer) ? answer.at(0) : answer;
  if (!isRecord(reply) || !isRecord(reply['error'])) return '';
  const message = reply['error']['message'];
  return typeof message === 'string' ? message : '';
}

/** Whether the internet can be reached, asked of no AI in particular. */
export async function connectionCheck(parts: LektorServiceParts, signal: AbortSignal): Promise<void> {
  const blank = { provider: 'gemini', action: 'ping', key: '', model: '', system: '', input: '' } as const;
  const { status, reply } = await callService(parts, blank, signal);
  if (status !== 200) throw new LektorServiceError('offline', `${status}: ${messageOf(reply)}`);
}
