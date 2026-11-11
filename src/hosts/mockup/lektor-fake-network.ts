import type { LektorProgress } from '../../platform/lektor-progress.ts';
import { LEKTOR_STOPPED, LEKTOR_TIMED_OUT, LEKTOR_UNREACHED, type LektorRequest, type LektorResponse } from '../../platform/lektor-remote.ts';

/*
  Google and OpenRouter, pretended, for tests: the unit tests hand it to the services as their
  way out, and the browser build's GUI tests switch it on in place of the dev server. It answers
  at the same seam as the real network (`Host.askLektorService`), with the same shapes the
  services really send: the refusal bodies below are copied from the recorded replies in
  test/fixtures/lektor-api/, and test/lektor-fake-network.test.ts holds them to those files.

  Nothing here spends anything or reaches anything. The browser build only: the app can't contain
  it (test/boundaries.test.ts keeps hosts/electron away from hosts/mockup).
*/

export interface FakeClock {
  now: () => number;
  after: (ms: number, then: () => void) => () => void;
}

/** The browser's own clock, which a GUI test drives with `page.clock`. */
export const BROWSER_CLOCK: FakeClock = {
  now: () => performance.now(),
  after: (ms, then) => {
    const timer = setTimeout(then, ms);
    return () => clearTimeout(timer);
  },
};

/** How one model answers one request. */
export type FakeTurn =
  /** Queued (free) or processing (paid) for `queueMs`, then thinking, then writing. */
  | { kind: 'answer'; queueMs?: number; thinkMs?: number; writeMs?: number; words?: string; cost?: number }
  /** Refused at once as busy: Google's 503, OpenRouter's 503 once its own fallbacks are spent. */
  | { kind: 'busy' }
  /** Queued, then refused as busy by an error event mid-stream. */
  | { kind: 'busy-after-queue'; queueMs: number }
  | { kind: 'daily-limit' }
  /** Never starts: queued until given up or out of time. */
  | { kind: 'queue-forever' }
  | { kind: 'no-credit' }
  /** Ends for length, with nothing written. */
  | { kind: 'cut-off' }
  | { kind: 'declined' }
  /** OpenRouter finds no host the request allows: our own mistake. */
  | { kind: 'no-host' };

export type FakeProvider = 'gemini' | 'openrouter';

export interface FakeDay {
  isOffline?: boolean;
  /** Keys that no longer work. Any key at all is otherwise taken. */
  deadKeys?: readonly FakeProvider[];
  /** What is left on the paid account; null when it can't be read (credits refused, the key without a cap). */
  balance?: number | null;
  /** By model, in turn; the last is repeated. Unnamed models answer after a short queue. */
  turns?: Readonly<Record<string, readonly FakeTurn[]>>;
  /** A real reply saved for this text, to come back as the correction instead of a made-up one. */
  savedCorrection?: (text: string) => Promise<string | null>;
}

/* Copied from test/fixtures/lektor-api/, where they were recorded. */
export const GOOGLE_BUSY = {
  error: { message: 'gemini-3.8-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.', code: 'service_unavailable' },
};
export const GOOGLE_WRONG_KEY = {
  error: {
    code: 400,
    message: 'API key not valid. Please pass a valid API key.',
    status: 'INVALID_ARGUMENT',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com', metadata: { service: 'generativelanguage.googleapis.com' } },
      { '@type': 'type.googleapis.com/google.rpc.LocalizedMessage', locale: 'en-US', message: 'API key not valid. Please pass a valid API key.' },
    ],
  },
};
export const OPENROUTER_WRONG_KEY = { error: { message: 'User not found.', code: 401 } };

/* Not recordable without spending a day's quota or emptying the account: shaped as the docs give them (spec §16). */
const GOOGLE_DAILY_LIMIT = { error: { message: 'You exceeded your current quota for gemini-3.8-flash requests per day.', code: 'quota_exceeded' } };
const GOOGLE_BLOCKED = { error: { message: 'The response was blocked for safety reasons.', code: 'safety' } };
const OPENROUTER_NO_CREDIT = { error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } };
const OPENROUTER_BUSY = { error: { message: 'No instances available', code: 503 } };
const OPENROUTER_MODERATED = { error: { message: 'Input flagged by moderation', code: 403 } };
const OPENROUTER_NO_HOST = { error: { message: 'No endpoints found matching your data policy', code: 404 } };

const SEND_LIMIT_MS = 600_000;
const STOPPED: LektorResponse = { status: LEKTOR_STOPPED, reply: null };

/** A request comes back as the correction rules say: the whole text. Anything else is a utisak. */
const isCorrection = (request: LektorRequest): boolean => /Return the whole text/.test(request.system);

const FAKE_UTISAK =
  'Probni utisak, bez pravog AI. Najviše mi je ostao početak, gde se mesto oseti pre nego što se išta desi.\n\nZastao sam kod sredine, gde bih voleo nešto više o ljudima.\n\nU celini, miran i tačan zapis.';

/** A made-up correction of the text: every seventh word in capitals, which the review shows as larger changes. */
export function fakeCorrectionOf(text: string): string {
  let word = 0;
  return text.replace(/\p{L}+/gu, (found) => {
    word += 1;
    return word % 7 === 0 ? found.toUpperCase() : found;
  });
}

class Stopped extends Error {}

export interface FakeNetwork {
  ask: (request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void) => Promise<LektorResponse>;
  /** What was asked, in order, without keys or text: for a test to count and check. */
  asked: { provider: FakeProvider; action: LektorRequest['action']; model: string }[];
}

export function createFakeNetwork(day: FakeDay, clock: FakeClock = BROWSER_CLOCK): FakeNetwork {
  const asked: FakeNetwork['asked'] = [];
  const turnsTaken = new Map<string, number>();

  const turnFor = (model: string): FakeTurn => {
    const turns = day.turns?.[model];
    if (turns === undefined || turns.length === 0) return { kind: 'answer' };
    const at = turnsTaken.get(model) ?? 0;
    turnsTaken.set(model, at + 1);
    return turns[Math.min(at, turns.length - 1)] ?? { kind: 'answer' };
  };

  const wait = (ms: number, stop: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      if (stop.aborted) {
        reject(new Stopped());
        return;
      }
      const onStop = (): void => {
        cancel();
        reject(new Stopped());
      };
      const cancel = clock.after(ms, () => {
        stop.removeEventListener('abort', onStop);
        resolve();
      });
      stop.addEventListener('abort', onStop, { once: true });
    });

  async function wordsFor(request: LektorRequest, turn: Extract<FakeTurn, { kind: 'answer' }>): Promise<string> {
    if (turn.words !== undefined) return turn.words;
    if (!isCorrection(request)) return FAKE_UTISAK;
    return (await day.savedCorrection?.(request.input)) ?? fakeCorrectionOf(request.input);
  }

  async function answer(request: LektorRequest, turn: Extract<FakeTurn, { kind: 'answer' }>, stop: AbortSignal, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
    const isFree = request.provider === 'gemini';
    await wait(turn.queueMs ?? (isFree ? 3000 : 500), stop);
    onProgress({ kind: 'started', model: request.model });
    onProgress({ kind: 'thinking' });
    await wait(turn.thinkMs ?? 1000, stop);
    const words = await wordsFor(request, turn);
    for (const share of [0.25, 0.5, 0.75, 1]) {
      onProgress({ kind: 'writing', characters: Math.round(words.length * share) });
      await wait((turn.writeMs ?? 1000) / 4, stop);
    }
    if (isFree) return { status: 200, reply: { text: words, status: 'completed', model: request.model, usage: null, error: null } };
    const cost = turn.cost ?? (request.model.startsWith('anthropic/') ? 0.05 : 0.01);
    return { status: 200, reply: { text: words, finish: 'stop', model: request.model, cost, usage: null, error: null } };
  }

  async function refuse(request: LektorRequest, turn: FakeTurn, stop: AbortSignal): Promise<LektorResponse> {
    const isFree = request.provider === 'gemini';
    switch (turn.kind) {
      case 'busy':
        await wait(1500, stop);
        return isFree ? { status: 503, reply: GOOGLE_BUSY } : { status: 503, reply: OPENROUTER_BUSY };
      case 'busy-after-queue':
        await wait(turn.queueMs, stop);
        return { status: 503, reply: { text: '', status: null, model: null, usage: null, error: GOOGLE_BUSY.error } };
      case 'daily-limit':
        return { status: 429, reply: GOOGLE_DAILY_LIMIT };
      case 'queue-forever':
        await wait(SEND_LIMIT_MS, stop);
        return { status: LEKTOR_TIMED_OUT, reply: { error: { message: 'TimeoutError' } } };
      case 'no-credit':
        return { status: 402, reply: OPENROUTER_NO_CREDIT };
      case 'no-host':
        return { status: 404, reply: OPENROUTER_NO_HOST };
      case 'declined':
        return isFree ? { status: 400, reply: GOOGLE_BLOCKED } : { status: 403, reply: OPENROUTER_MODERATED };
      case 'cut-off':
        await wait(1000, stop);
        return isFree
          ? { status: 200, reply: { text: '', status: 'incomplete', model: request.model, usage: null, error: null } }
          : { status: 200, reply: { text: '', finish: 'length', model: request.model, cost: 0.001, usage: null, error: null } };
      case 'answer':
        return answer(request, turn, stop, () => {});
    }
  }

  function balanceReply(isDead: boolean): LektorResponse {
    if (isDead) return { status: 401, reply: { credits: { status: 401, reply: OPENROUTER_WRONG_KEY }, key: { status: 401, reply: OPENROUTER_WRONG_KEY } } };
    const left = day.balance === undefined ? 7.47 : day.balance;
    const credits = left === null ? { status: 403, reply: { error: { message: 'Forbidden', code: 403 } } } : { status: 200, reply: { data: { total_credits: 15, total_usage: 15 - left } } };
    return { status: 200, reply: { credits, key: { status: 200, reply: { data: { limit: null, limit_remaining: null, usage: 0 } } } } };
  }

  async function respond(request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
    if (day.isOffline === true) {
      await wait(300, stop);
      return { status: LEKTOR_UNREACHED, reply: { error: { message: 'TypeError' } } };
    }
    if (request.action === 'ping') return { status: 200, reply: {} };
    // As the real network does: nothing is sent on an empty key.
    if (request.key === '') return { status: 401, reply: { error: { message: '' } } };
    const isDead = day.deadKeys?.includes(request.provider) ?? false;
    if (request.action === 'balance') return balanceReply(isDead);
    if (isDead) return request.provider === 'gemini' ? { status: 400, reply: GOOGLE_WRONG_KEY } : { status: 401, reply: OPENROUTER_WRONG_KEY };
    if (request.action === 'check') return { status: 200, reply: request.provider === 'gemini' ? { models: [{ name: 'models/gemini-3.8-flash' }] } : { data: { limit_remaining: null } } };
    const turn = turnFor(request.model);
    return turn.kind === 'answer' ? answer(request, turn, stop, onProgress) : refuse(request, turn, stop);
  }

  return {
    asked,
    ask: async (request, stop, onProgress) => {
      asked.push({ provider: request.provider, action: request.action, model: request.model });
      try {
        return await respond(request, stop, onProgress);
      } catch (error) {
        if (error instanceof Stopped) return STOPPED;
        throw error;
      }
    },
  };
}
