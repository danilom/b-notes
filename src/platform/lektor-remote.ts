import { readClaudeStream } from './claude-reply-stream.ts';

/*
  The only code in the app that talks to anything outside his machine, and only ever when he
  has opened the Lektor. It runs where a host puts it: the main process in the app, the dev
  server in the browser build. It takes the key from the request and logs nothing: neither his
  text nor a key may ever reach a log, and whoever calls this logs what is safe to.
*/

export type LektorProvider = 'gemini' | 'claude';

export interface LektorRequest {
  provider: LektorProvider;
  /** Whether the internet is there at all, whether a key is taken, or the real thing. */
  action: 'ping' | 'check' | 'send';
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

/** He stopped it. */
export const LEKTOR_STOPPED = 0;
/** Reached, but out of time: the service's trouble rather than his connection's. */
export const LEKTOR_TIMED_OUT = 504;
/** No answer at all, which is what being offline looks like. */
export const LEKTOR_UNREACHED = 502;

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_REVISION = '2026-05-20';
const CLAUDE = 'https://api.anthropic.com/v1';
const CLAUDE_API_VERSION = '2026-10-21';
const CLAUDE_LONGEST_REPLY_TOKENS = 64_000;

const PING_LIMIT_MS = 8_000;
const KEY_CHECK_LIMIT_MS = 15_000;
const GEMINI_LIMIT_MS = 180_000;
/** A long essay took over four minutes when tried, so more than Gemini's three. */
const CLAUDE_LIMIT_MS = 600_000;

const TIMED_OUT = 'TimeoutError';

/** Where a test can point it instead, so that it talks to a stand-in and spends nothing. */
export interface LektorAddresses {
  gemini?: string;
  claude?: string;
}

function replyOf(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Not logged: this runs below any log, and a null reply is read by its caller as a refusal with nothing to say.
    return null;
  }
}

async function plainResponse(response: Response): Promise<LektorResponse> {
  return { status: response.status, reply: replyOf(await response.text()) };
}

async function askGemini(request: LektorRequest, signal: AbortSignal, address: string): Promise<LektorResponse> {
  const headers = { 'x-goog-api-key': request.key, 'Api-Revision': GEMINI_API_REVISION };
  if (request.action === 'check') return plainResponse(await fetch(`${address}/models?pageSize=1`, { headers, signal }));
  return plainResponse(
    await fetch(`${address}/interactions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      // store: false, so Google keeps no conversation of its own.
      body: JSON.stringify({ model: request.model, system_instruction: request.system, input: request.input, store: false }),
      signal,
    }),
  );
}

async function askClaude(request: LektorRequest, signal: AbortSignal, address: string): Promise<LektorResponse> {
  const headers = { 'x-api-key': request.key, 'anthropic-version': CLAUDE_API_VERSION };
  if (request.action === 'check') return plainResponse(await fetch(`${address}/models?limit=1`, { headers, signal }));
  const response = await fetch(`${address}/messages`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      max_tokens: CLAUDE_LONGEST_REPLY_TOKENS,
      output_config: { effort: 'medium' },
      stream: true,
      system: request.system,
      messages: [{ role: 'user', content: request.input }],
    }),
    signal,
  });
  if (!response.ok || response.body === null) return plainResponse(response);
  const { text, stopReason, explanation, usage, error } = await readClaudeStream(response.body as unknown as AsyncIterable<Uint8Array>);
  if (error !== null) return { status: error.type === 'rate_limit_error' ? 429 : 529, reply: { error } };
  return { status: 200, reply: { text, stopReason, explanation, usage } };
}

function limitFor(request: LektorRequest): number {
  if (request.action === 'ping') return PING_LIMIT_MS;
  if (request.action === 'check') return KEY_CHECK_LIMIT_MS;
  return request.provider === 'claude' ? CLAUDE_LIMIT_MS : GEMINI_LIMIT_MS;
}

async function askService(request: LektorRequest, signal: AbortSignal, addresses: LektorAddresses): Promise<LektorResponse> {
  if (request.action === 'ping') {
    // Any answer at all means the internet is there, whatever Google thinks of the request.
    await fetch(`${addresses.gemini ?? GEMINI}/models?pageSize=1`, { signal });
    return { status: 200, reply: {} };
  }
  // Nothing is sent, least of all his text, on a request that can only be refused. No words: it isn't a service talking.
  if (request.key === '') return { status: 401, reply: { error: { message: '' } } };
  return request.provider === 'claude'
    ? askClaude(request, signal, addresses.claude ?? CLAUDE)
    : askGemini(request, signal, addresses.gemini ?? GEMINI);
}

/**
 * Asks a service, and always answers rather than throwing: this is handed across a process
 * boundary, where an error would arrive with its kind and meaning stripped away.
 *
 * @param stop Aborted when he presses Prekini, which comes back as `LEKTOR_STOPPED`.
 */
export async function askLektorService(request: LektorRequest, stop?: AbortSignal, addresses: LektorAddresses = {}): Promise<LektorResponse> {
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
    return await askService(request, controller.signal, addresses);
  } catch (error) {
    if (isTimedOut) return { status: LEKTOR_TIMED_OUT, reply: { error: { message: TIMED_OUT } } };
    if (stop?.aborted === true) return { status: LEKTOR_STOPPED, reply: null };
    return { status: LEKTOR_UNREACHED, reply: { error: { message: error instanceof Error ? error.name : 'Unknown' } } };
  } finally {
    clearTimeout(timer);
    stop?.removeEventListener('abort', stopping);
  }
}

/** A request as it arrives across a process boundary, checked before it is believed. */
export function lektorRequestFrom(value: unknown): LektorRequest {
  if (typeof value !== 'object' || value === null) throw new Error('A Lektor request must be an object');
  const { provider, action, key, model, system, input } = value as Record<string, unknown>;
  if (provider !== 'gemini' && provider !== 'claude') throw new Error('A Lektor request needs a known provider');
  if (action !== 'ping' && action !== 'check' && action !== 'send') throw new Error('A Lektor request needs a known action');
  if (typeof key !== 'string' || typeof model !== 'string' || typeof system !== 'string' || typeof input !== 'string') {
    throw new Error('A Lektor request needs its fields as text');
  }
  return { provider, action, key, model, system, input };
}
