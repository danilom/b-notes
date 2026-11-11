import { readGoogleStream } from './google-interaction-stream.ts';
import type { LektorProgress } from './lektor-progress.ts';
import { readOpenRouterStream } from './openrouter-reply-stream.ts';

/*
  The only code in the app that talks to anything outside his machine, and only ever when he
  has opened the Lektor. It runs where a host puts it: the main process in the app, the dev
  server in the browser build. It takes the key from the request and logs nothing: neither his
  text nor a key may ever reach a log, and whoever calls this logs what is safe to.
*/

export type LektorProvider = 'gemini' | 'openrouter';

export type LektorAction = 'ping' | 'check' | 'balance' | 'send';

export interface LektorRequest {
  provider: LektorProvider;
  /**
   * Whether the internet is there at all (no key), whether a key is taken, what is left on the
   * paid account (OpenRouter only), or the real thing.
   */
  action: LektorAction;
  key: string;
  model: string;
  system: string;
  input: string;
}

/** The service's own status and answer, or one of the three below when it wasn't reached. */
export interface LektorResponse {
  status: number;
  reply: unknown;
}

/*
  Our own outcomes, as statuses no service sends. They were once 502 and 504, until OpenRouter's
  own 502 ("the model is down") read as being offline.
*/
/** He stopped it. */
export const LEKTOR_STOPPED = 0;
/** Reached, but out of time: the service's trouble rather than his connection's. */
export const LEKTOR_TIMED_OUT = -2;
/** No answer at all, which is what being offline looks like. */
export const LEKTOR_UNREACHED = -1;

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_REVISION = '2026-05-20';
const OPENROUTER = 'https://openrouter.ai/api/v1';

const PING_LIMIT_MS = 8_000;
const LOOKUP_LIMIT_MS = 15_000;
/**
 * Free 3.8 queues for up to five minutes before it starts, and a whole essay on Opus takes
 * minutes to write, so ten minutes for either (spec §2; it was four).
 */
const SEND_LIMIT_MS = 600_000;

const TIMED_OUT = 'TimeoutError';

/** Where a test can point it instead, so that it talks to a stand-in and spends nothing. */
export interface LektorAddresses {
  gemini?: string;
  openrouter?: string;
}

/** Only this computer: a stand-in a test runs. Anything else would send his keys and his text to whoever named it. */
const ON_THIS_COMPUTER = /^http:\/\/(127\.0\.0\.1|localhost):\d+(\/|$)/;

/**
 * Stand-ins for the services, as a test run of the app names them in its environment, as JSON:
 * `{ "gemini": "http://127.0.0.1:…", "openrouter": "http://127.0.0.1:…" }`. Unset, the
 * services' own. Set to anything but addresses on this computer, also the services' own, said
 * in the log: a mistake there must not become a way to send his text elsewhere.
 */
export function testLektorAddresses(raw: string | undefined, log: { warn: (message: string, detail?: unknown) => void }): LektorAddresses {
  if (raw === undefined || raw === '') return {};
  let named: unknown;
  try {
    named = JSON.parse(raw);
  } catch (error) {
    log.warn('Test Lektor addresses are not JSON; using the services', String(error));
    return {};
  }
  if (typeof named !== 'object' || named === null) return {};
  const addresses: LektorAddresses = {};
  for (const service of ['gemini', 'openrouter'] as const) {
    const address: unknown = (named as Record<string, unknown>)[service];
    if (address === undefined) continue;
    if (typeof address === 'string' && ON_THIS_COMPUTER.test(address)) addresses[service] = address;
    else log.warn('A test Lektor address is not on this computer; using the service', { service });
  }
  return addresses;
}

export interface LektorAsking {
  /** Aborted when he gives up, which comes back as `LEKTOR_STOPPED`. */
  stop?: AbortSignal;
  addresses?: LektorAddresses;
  /** Told as a sent request moves on: begun, thinking, writing. */
  onProgress?: (progress: LektorProgress) => void;
}

function replyOf(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Not logged: this runs below any log, and a null reply is read by its caller as a refusal with nothing to say.
    return null;
  }
}

/** Read as JSON whatever its content type says: Google sends its refusals bare under `text/event-stream`. */
async function plainResponse(response: Response): Promise<LektorResponse> {
  return { status: response.status, reply: replyOf(await response.text()) };
}

const bodyOf = (response: Response): AsyncIterable<Uint8Array> => response.body as unknown as AsyncIterable<Uint8Array>;

/**
 * Google's refusals mid-stream come with a code and no status of their own. One is given here so
 * the log line says what happened; the services read the code itself.
 */
function statusOfGoogleCode(code: string): number {
  if (code === 'quota_exceeded' || code === 'rate_limit_exceeded' || code === 'too_many_requests') return 429;
  if (code === 'invalid_request') return 400;
  if (code === 'permission_denied') return 403;
  return 503;
}

async function askGemini(request: LektorRequest, signal: AbortSignal, address: string, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
  const headers = { 'x-goog-api-key': request.key, 'Api-Revision': GEMINI_API_REVISION };
  if (request.action === 'check') return plainResponse(await fetch(`${address}/models?pageSize=1`, { headers, signal }));
  const response = await fetch(`${address}/interactions?alt=sse`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    // store: false, so Google keeps no conversation of its own. Streamed, so the wait can tell queued from working.
    body: JSON.stringify({ model: request.model, system_instruction: request.system, input: request.input, store: false, stream: true }),
    signal,
  });
  if (!response.ok || response.body === null) return plainResponse(response);
  const reply = await readGoogleStream(bodyOf(response), onProgress);
  return { status: reply.error === null ? 200 : statusOfGoogleCode(reply.error.code), reply };
}

async function openRouterLookup(url: string, key: string, signal: AbortSignal): Promise<LektorResponse> {
  return plainResponse(await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal }));
}

/** No `provider` object: OpenRouter routes by its own default, on price and availability (spec §2). */
function openRouterBody(request: LektorRequest): string {
  // Opus at medium effort, as in the model tests; Flash at the service's default.
  const reasoning = request.model.startsWith('anthropic/') ? { reasoning: { effort: 'medium' } } : {};
  return JSON.stringify({
    model: request.model,
    stream: true,
    ...reasoning,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.input },
    ],
  });
}

async function askOpenRouter(request: LektorRequest, signal: AbortSignal, address: string, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
  if (request.action === 'check') return openRouterLookup(`${address}/key`, request.key, signal);
  if (request.action === 'balance') {
    // Both, since /key's limit_remaining is the key's own cap, not the account (spec §9).
    const [credits, key] = await Promise.all([openRouterLookup(`${address}/credits`, request.key, signal), openRouterLookup(`${address}/key`, request.key, signal)]);
    return { status: key.status === 401 ? 401 : 200, reply: { credits, key } };
  }
  const response = await fetch(`${address}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${request.key}`, 'Content-Type': 'application/json' },
    body: openRouterBody(request),
    signal,
  });
  if (!response.ok || response.body === null) return plainResponse(response);
  const reply = await readOpenRouterStream(bodyOf(response), onProgress);
  const failed = reply.error === null ? 200 : typeof reply.error.code === 'number' ? reply.error.code : 502;
  return { status: failed, reply };
}

function limitFor(request: LektorRequest): number {
  if (request.action === 'ping') return PING_LIMIT_MS;
  return request.action === 'send' ? SEND_LIMIT_MS : LOOKUP_LIMIT_MS;
}

async function askService(request: LektorRequest, signal: AbortSignal, addresses: LektorAddresses, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
  if (request.action === 'ping') {
    // Any answer at all means the internet is there, whatever Google thinks of the request.
    await fetch(`${addresses.gemini ?? GEMINI}/models?pageSize=1`, { signal });
    return { status: 200, reply: {} };
  }
  // Nothing is sent, least of all his text, on a request that can only be refused. No words: it isn't a service talking.
  if (request.key === '') return { status: 401, reply: { error: { message: '' } } };
  return request.provider === 'openrouter'
    ? askOpenRouter(request, signal, addresses.openrouter ?? OPENROUTER, onProgress)
    : askGemini(request, signal, addresses.gemini ?? GEMINI, onProgress);
}

/**
 * Asks a service, and always answers rather than throwing: this is handed across a process
 * boundary, where an error would arrive with its kind and meaning stripped away.
 */
export async function askLektorService(request: LektorRequest, { stop, addresses = {}, onProgress = () => {} }: LektorAsking = {}): Promise<LektorResponse> {
  const controller = new AbortController();
  let isTimedOut = false;
  const timer = setTimeout(() => {
    isTimedOut = true;
    controller.abort();
  }, limitFor(request));
  const stopping = (): void => controller.abort();
  stop?.addEventListener('abort', stopping);
  try {
    if (stop?.aborted === true) return { status: LEKTOR_STOPPED, reply: null };
    return await askService(request, controller.signal, addresses, onProgress);
  } catch (error) {
    if (isTimedOut) return { status: LEKTOR_TIMED_OUT, reply: { error: { message: TIMED_OUT } } };
    if (stop?.aborted === true) return { status: LEKTOR_STOPPED, reply: null };
    return { status: LEKTOR_UNREACHED, reply: { error: { message: error instanceof Error ? error.name : 'Unknown' } } };
  } finally {
    clearTimeout(timer);
    stop?.removeEventListener('abort', stopping);
  }
}

/**
 * What may be logged about a request: what was asked of whom, how it went, which model answered
 * and what it cost. Never the key, the instruction, his text or the reply's words.
 */
export function lektorLogDetail(request: LektorRequest, response: LektorResponse, ms: number): Record<string, unknown> {
  const reply = typeof response.reply === 'object' && response.reply !== null ? (response.reply as Record<string, unknown>) : {};
  const answeredBy = typeof reply['model'] === 'string' ? reply['model'] : undefined;
  const cost = typeof reply['cost'] === 'number' ? reply['cost'] : undefined;
  return {
    provider: request.provider,
    action: request.action,
    model: request.model,
    status: response.status,
    ms,
    ...(answeredBy === undefined ? {} : { answeredBy }),
    ...(cost === undefined ? {} : { cost }),
    ...(reply['usage'] === undefined || reply['usage'] === null ? {} : { usage: reply['usage'] }),
  };
}

const ACTIONS: readonly LektorAction[] = ['ping', 'check', 'balance', 'send'];

/** A request as it arrives across a process boundary, checked before it is believed. */
export function lektorRequestFrom(value: unknown): LektorRequest {
  if (typeof value !== 'object' || value === null) throw new Error('A Lektor request must be an object');
  const { provider, action, key, model, system, input } = value as Record<string, unknown>;
  if (provider !== 'gemini' && provider !== 'openrouter') throw new Error('A Lektor request needs a known provider');
  const known = ACTIONS.find((one) => one === action);
  if (known === undefined) throw new Error('A Lektor request needs a known action');
  if (known === 'balance' && provider !== 'openrouter') throw new Error('Only OpenRouter has a balance to read');
  if (typeof key !== 'string' || typeof model !== 'string' || typeof system !== 'string' || typeof input !== 'string') {
    throw new Error('A Lektor request needs its fields as text');
  }
  return { provider, action: known, key, model, system, input };
}
