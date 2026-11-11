import type { LektorProgress } from './lektor-progress.ts';
import { LEKTOR_STOPPED, LEKTOR_TIMED_OUT, LEKTOR_UNREACHED, type LektorRequest, type LektorResponse } from './lektor-remote.ts';

/*
  Google and OpenRouter, pretended: the unit tests hand it to the services as their way out, and
  in the app or the browser build it stands in for the real network for every Lektor at once, when
  Advanced → "Fake AI network" is on (a per-machine setting, so never on his machines by sync). It
  answers at the same seam as the real network (`Host.askLektorService`), with the same shapes the
  services really send: the refusal bodies below are copied from the recorded replies in
  test/fixtures/lektor-api/, and test/lektor-fake-network.test.ts holds them to those files.

  Nothing here spends anything or reaches anything.
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
  | { kind: 'no-host' }
  /** No answer at all: the internet gone just as he sent it. */
  | { kind: 'offline' };

export type FakeProvider = 'gemini' | 'openrouter';

export interface FakeDay {
  isOffline?: boolean;
  /** Keys that no longer work. Any key at all is otherwise taken. */
  deadKeys?: readonly FakeProvider[];
  /** Keys that pass the opening check but are refused on sending: a key revoked meanwhile. */
  keysDieOnSend?: readonly FakeProvider[];
  /** What is left on the paid account; null when it can't be read (credits refused, the key without a cap). */
  balance?: number | null;
  /** By model, in turn; the last is repeated. Unnamed models answer after a short queue. */
  turns?: Readonly<Record<string, readonly FakeTurn[]>>;
  /** A real reply saved for this text and this kind (by its instruction), to come back as the correction instead of a made-up one. */
  savedCorrection?: (text: string, system: string) => Promise<string | null>;
}

/** Where the setting lives, in `userData` (the app folder): per machine, never synced. */
export const FAKE_DAY_FILE = 'lektor-fake-network.json';

/**
 * The days the overlay offers, each acting out one thing that can happen. Anything not named
 * answers normally: free after a short queue, paid at once.
 */
export const FAKE_SCENARIOS = {
  normal: {},
  'slow free queue': { turns: { 'gemini-3.8-flash': [{ kind: 'queue-forever' }], 'gemini-3.6-flash': [{ kind: 'queue-forever' }] } },
  'Google busy': { turns: { 'gemini-3.8-flash': [{ kind: 'busy' }], 'gemini-3.6-flash': [{ kind: 'busy' }] } },
  'free day spent': { turns: { 'gemini-3.8-flash': [{ kind: 'daily-limit' }], 'gemini-3.6-flash': [{ kind: 'daily-limit' }] } },
  'paid busy': { turns: { 'google/gemini-3.8-flash': [{ kind: 'busy' }], 'anthropic/claude-opus-5.5': [{ kind: 'busy' }] } },
  'no money': { balance: 0, turns: { 'google/gemini-3.8-flash': [{ kind: 'no-credit' }], 'anthropic/claude-opus-5.5': [{ kind: 'no-credit' }] } },
  'low balance': { balance: 0.9 },
  'balance unreadable': { balance: null },
  offline: { isOffline: true },
  'dead keys': { deadKeys: ['gemini', 'openrouter'] },
  'keys refused on sending': { keysDieOnSend: ['gemini', 'openrouter'] },
  'cut off': { turns: Object.fromEntries(['gemini-3.8-flash', 'gemini-3.6-flash', 'google/gemini-3.8-flash', 'anthropic/claude-opus-5.5'].map((model) => [model, [{ kind: 'cut-off' }]])) },
  'refuses to write': { turns: Object.fromEntries(['gemini-3.8-flash', 'gemini-3.6-flash', 'google/gemini-3.8-flash', 'anthropic/claude-opus-5.5'].map((model) => [model, [{ kind: 'declined' }]])) },
} as const satisfies Record<string, FakeDay>;

export type FakeScenario = keyof typeof FAKE_SCENARIOS;

export const isFakeScenario = (value: unknown): value is FakeScenario => typeof value === 'string' && Object.hasOwn(FAKE_SCENARIOS, value);

/** The model a saved reply comes back as: real Opus words, marked as saved so the review says so. */
export const SAVED_REPLY_MODEL = 'saved/anthropic/claude-opus-5.5';

const TURN_KINDS: readonly FakeTurn['kind'][] = ['answer', 'busy', 'busy-after-queue', 'daily-limit', 'queue-forever', 'no-credit', 'cut-off', 'declined', 'no-host', 'offline'];

function answerFrom(turn: Record<string, unknown>): FakeTurn {
  const answer: Extract<FakeTurn, { kind: 'answer' }> = { kind: 'answer' };
  for (const name of ['queueMs', 'thinkMs', 'writeMs', 'cost'] as const) {
    const value = turn[name];
    if (typeof value === 'number') answer[name] = value;
  }
  if (typeof turn['words'] === 'string') answer.words = turn['words'];
  return answer;
}

function turnFrom(raw: unknown): FakeTurn | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const turn = raw as Record<string, unknown>;
  const kind = TURN_KINDS.find((known) => known === turn['kind']);
  if (kind === undefined) return null;
  if (kind === 'busy-after-queue') return { kind, queueMs: typeof turn['queueMs'] === 'number' ? turn['queueMs'] : 30_000 };
  return kind === 'answer' ? answerFrom(turn) : { kind };
}

/** A day as a test wrote it, checked: anything it doesn't recognise is left out, and anything but an object gives null. */
export function fakeDayFrom(raw: unknown): FakeDay | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { isOffline, deadKeys, keysDieOnSend, balance, turns } = raw as Record<string, unknown>;
  const day: { -readonly [K in keyof FakeDay]: FakeDay[K] } = {};
  if (typeof isOffline === 'boolean') day.isOffline = isOffline;
  const providers = (list: unknown[]): FakeProvider[] => list.filter((one): one is FakeProvider => one === 'gemini' || one === 'openrouter');
  if (Array.isArray(deadKeys)) day.deadKeys = providers(deadKeys);
  if (Array.isArray(keysDieOnSend)) day.keysDieOnSend = providers(keysDieOnSend);
  if (typeof balance === 'number' || balance === null) day.balance = balance;
  if (typeof turns === 'object' && turns !== null) {
    day.turns = Object.fromEntries(
      Object.entries(turns).flatMap(([model, list]) => (Array.isArray(list) ? [[model, list.map(turnFrom).filter((turn): turn is FakeTurn => turn !== null)]] : [])),
    );
  }
  return day;
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
  'Probni utisak, bez pravog AI. Najviše mi je ostao početak, gde se mesto oseti pre nego što se išta desi: ' +
  '„ulica je mirisala na kišu koja još nije pala”. Ta rečenica me je odmah uvela u priču, i posle nje sam čitao ' +
  'sporije, pažljivije, kao da hodam tom ulicom zajedno s tobom.\n\n' +
  'Zastao sam kod sredine, gde se iz sećanja na kuću prelazi na ljude koji su u njoj živeli. Tu bih voleo nešto ' +
  'više o njima: kako su govorili, čega su se plašili, šta su jedni drugima prećutali. Pominješ ih s mnogo ' +
  'topline, ali ih ne vidim dovoljno jasno da bih ih upamtio kao što sam upamtio ulicu.\n\n' +
  'U celini, ovo je miran i tačan zapis, bez suvišnih reči. Završetak se ne žuri i ne objašnjava previše, ' +
  'pa ostavlja prostora čitaocu da sam oseti ono što je ostalo neizrečeno.';

/** Words he types without their diacritics, as a proofreader would give them back. */
const DIACRITICS_RESTORED: Readonly<Record<string, string>> = {
  sto: 'što', sta: 'šta', zasto: 'zašto', cak: 'čak', ce: 'će', cu: 'ću', ces: 'ćeš', kaze: 'kaže', kazu: 'kažu',
  rijec: 'riječ', rec: 'reč', covjek: 'čovjek', covek: 'čovek', cuti: 'ćuti', cutao: 'ćutao', sutnja: 'šutnja',
  casa: 'čaša', vise: 'više', zivot: 'život', zena: 'žena', dosao: 'došao', reci: 'reći', moze: 'može',
  mozda: 'možda', prica: 'priča', pricu: 'priču', vec: 'već', kuca: 'kuća', noc: 'noć', dje: 'đe', medju: 'među', izmedju: 'između', vidis: 'vidiš',
};

const restoreDiacritics = (word: string): string => {
  const restored = DIACRITICS_RESTORED[word.toLowerCase()];
  if (restored === undefined) return word;
  return word.charAt(0) === word.charAt(0).toUpperCase() ? restored.charAt(0).toUpperCase() + restored.slice(1) : restored;
};

/** Commas, spaces and line ends, which the review counts as small fixes. */
const tidySpacing = (text: string): string =>
  text
    .replace(/[ \t]+$/gm, '')
    .replace(/(\p{L}) {2,}(?=\p{L})/gu, '$1 ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/([,;])(?=\p{L})/gu, '$1 ')
    .replace(/(\p{L}) (a|ali|pa|nego) /gu, '$1, $2 ');

/**
 * A made-up correction of the text. Every seventh word goes into capitals, which the review shows
 * as larger changes. Common words get their diacritics back, and commas, spaces and line ends are
 * tidied, all of which the review counts as small fixes.
 */
export function fakeCorrectionOf(text: string): string {
  let word = 0;
  const worded = text.replace(/\p{L}+/gu, (found) => {
    word += 1;
    return word % 7 === 0 ? found.toUpperCase() : restoreDiacritics(found);
  });
  return tidySpacing(worded);
}

class Stopped extends Error {}

export interface FakeNetwork {
  ask: (request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void) => Promise<LektorResponse>;
  /** What was asked, in order, without keys or text: for a test to count and check. */
  asked: { provider: FakeProvider; action: LektorRequest['action']; model: string }[];
}

/**
 * @param dayNow The day, or a way to read it as it is now: switching scenario while the app runs
 * takes effect from the next request.
 */
export function createFakeNetwork(dayNow: FakeDay | (() => FakeDay), clock: FakeClock = BROWSER_CLOCK): FakeNetwork {
  let day: FakeDay = typeof dayNow === 'function' ? dayNow() : dayNow;
  const asked: FakeNetwork['asked'] = [];
  const turnsTaken = new Map<string, number>();

  const refresh = (): void => {
    if (typeof dayNow !== 'function') return;
    const next = dayNow();
    // A new day starts its turns afresh.
    if (next !== day) turnsTaken.clear();
    day = next;
  };

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

  /** The words, and the model they come back as: a saved reply is real Opus, said to be saved. */
  async function wordsFor(request: LektorRequest, turn: Extract<FakeTurn, { kind: 'answer' }>): Promise<{ words: string; model: string }> {
    if (turn.words !== undefined) return { words: turn.words, model: request.model };
    if (!isCorrection(request)) return { words: FAKE_UTISAK, model: request.model };
    const saved = (await day.savedCorrection?.(request.input, request.system)) ?? null;
    return saved === null ? { words: fakeCorrectionOf(request.input), model: request.model } : { words: saved, model: SAVED_REPLY_MODEL };
  }

  async function answer(request: LektorRequest, turn: Extract<FakeTurn, { kind: 'answer' }>, stop: AbortSignal, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
    const isFree = request.provider === 'gemini';
    await wait(turn.queueMs ?? (isFree ? 3000 : 500), stop);
    onProgress({ kind: 'started', model: request.model });
    onProgress({ kind: 'thinking' });
    await wait(turn.thinkMs ?? 1000, stop);
    const { words, model } = await wordsFor(request, turn);
    for (const share of [0.25, 0.5, 0.75, 1]) {
      onProgress({ kind: 'writing', characters: Math.round(words.length * share) });
      await wait((turn.writeMs ?? 1000) / 4, stop);
    }
    if (isFree) return { status: 200, reply: { text: words, status: 'completed', model, usage: null, error: null } };
    const cost = turn.cost ?? (request.model.startsWith('anthropic/') ? 0.05 : 0.01);
    return { status: 200, reply: { text: words, finish: 'stop', model, cost, usage: null, error: null } };
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
      case 'offline':
        await wait(300, stop);
        return { status: LEKTOR_UNREACHED, reply: { error: { message: 'TypeError' } } };
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
    const isDead = (day.deadKeys?.includes(request.provider) ?? false) || (request.action === 'send' && (day.keysDieOnSend?.includes(request.provider) ?? false));
    if (request.action === 'balance') return balanceReply(isDead);
    if (isDead) return request.provider === 'gemini' ? { status: 400, reply: GOOGLE_WRONG_KEY } : { status: 401, reply: OPENROUTER_WRONG_KEY };
    if (request.action === 'check') return { status: 200, reply: request.provider === 'gemini' ? { models: [{ name: 'models/gemini-3.8-flash' }] } : { data: { limit_remaining: null } } };
    const turn = turnFor(request.model);
    return turn.kind === 'answer' ? answer(request, turn, stop, onProgress) : refuse(request, turn, stop);
  }

  return {
    asked,
    ask: async (request, stop, onProgress) => {
      refresh();
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
