import type { LektorProgress } from '../../platform/lektor-progress.ts';
import { LEKTOR_STOPPED, type LektorRequest, type LektorResponse } from '../../platform/lektor-remote.ts';
import { LektorServiceError } from './lektor-service.ts';

/** How a service reaches the host, and what it needs to know from outside. */
export interface LektorServiceParts {
  ask: (request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void) => Promise<LektorResponse>;
  keyNow: () => string;
  /** Says what became of a refusal nobody has met before; never his text. */
  warn: (message: string, detail: unknown) => void;
  /** For a refusal that means our own mistake rather than the service's trouble. */
  error: (message: string, detail: unknown) => void;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Asks, and turns his having stopped it back into what stopping is everywhere else. */
export async function callService(parts: LektorServiceParts, request: LektorRequest, signal: AbortSignal, onProgress: (progress: LektorProgress) => void = () => {}): Promise<LektorResponse> {
  const response = await parts.ask(request, signal, onProgress);
  if (response.status === LEKTOR_STOPPED || signal.aborted) throw new DOMException('Stopped', 'AbortError');
  return response;
}

/** The refusal itself: Google's `/interactions` wraps it in a list, and a stream reader keeps it as `error`. */
function errorOf(answer: unknown): Record<string, unknown> | null {
  const reply: unknown = Array.isArray(answer) ? answer.at(0) : answer;
  if (!isRecord(reply) || !isRecord(reply['error'])) return null;
  return reply['error'];
}

/** The service's own words about what went wrong, if it gave any. */
export function messageOf(answer: unknown): string {
  const message = errorOf(answer)?.['message'];
  return typeof message === 'string' ? message : '';
}

/**
 * The refusal's code: Google's `/interactions` names its kind as a string (`quota_exceeded`),
 * OpenRouter and Google's older errors give a number. Empty when there is none.
 */
export function codeOf(answer: unknown): string {
  const code = errorOf(answer)?.['code'];
  return typeof code === 'string' || typeof code === 'number' ? String(code) : '';
}

/** Google's older refusals give their kind in `details[].reason` (`API_KEY_INVALID`). */
export function reasonsOf(answer: unknown): string[] {
  const details = errorOf(answer)?.['details'];
  if (!Array.isArray(details)) return [];
  return details.flatMap((detail) => (isRecord(detail) && typeof detail['reason'] === 'string' ? [detail['reason']] : []));
}

/** Whether the internet can be reached, asked of no AI in particular. */
export async function connectionCheck(parts: Pick<LektorServiceParts, 'ask'>, signal: AbortSignal): Promise<void> {
  const blank = { provider: 'gemini', action: 'ping', key: '', model: '', system: '', input: '' } as const;
  const { status, reply } = await callService({ ...parts, keyNow: () => '', warn: () => {}, error: () => {} }, blank, signal);
  if (status !== 200) throw new LektorServiceError('offline', `${status}: ${messageOf(reply)}`);
}
