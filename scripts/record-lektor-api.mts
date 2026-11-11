/**
 * Records how Google and OpenRouter really answer, as raw material for the fake network the
 * OpenRouter Lektor's tests use (design/lektor-openrouter-spec.md §11). Free calls only:
 *
 * - Google's free tier, streamed `/interactions`, on a made-up Serbian text written below (never
 *   one of his), for each model named;
 * - Google with a wrong key and with none, and the model list with the real key;
 * - OpenRouter with a wrong key (a completion refused at the door, so nothing runs), and `/key`
 *   and `/credits` with the real key.
 * - `openrouter-stream`, the one case that spends money (a few cents, asked for only by name): a
 *   streamed utisak from paid Flash and from Opus at medium effort, Flash cut short by a tiny
 *   `max_tokens` (the cut-off's shape), and a request no host can take (refused before any model runs).
 *
 *   node scripts/record-lektor-api.mts --out <folder> [--cases google-stream,google-errors,openrouter]
 *        [--models gemini-3.8-flash,gemini-3.6-flash]
 *
 * Writes each reply as it came, with each piece's time, to the folder given, which should be
 * outside the repository: the replies are not yet cleaned of account details.
 * `scripts/clean-lektor-recordings.mts` makes fixtures of them. Prints no key.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { FEEDBACK_INSTRUCTION } from '../src/ui/lektor/lektor-instructions.ts';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_REVISION = '2026-05-20';
const OPENROUTER = 'https://openrouter.ai/api/v1';
const STREAM_LIMIT_MS = 600_000;
const PLAIN_LIMIT_MS = 30_000;
/** Shaped like a Google key and an OpenRouter key, so the refusal is the one a mistyped paste gets. */
const WRONG_GOOGLE_KEY = `AIzaSy${'X'.repeat(33)}`;
const WRONG_OPENROUTER_KEY = `sk-or-v1-${'0'.repeat(64)}`;

/** Made up for this recording; nothing of his. A few slips on purpose, so a utisak has something to say. */
const MADE_UP_TEXT = [
  'Jutros sam izašao rano, pre nego što se grad probudio. Na pijaci su tek postavljali tezge, a miris',
  'hleba iz pekare na uglu se širio celom ulicom. Kupio sam kilo jabuka i jednu veliku dinju, iako',
  'znam da je niko u kući neće jesti osim mene.',
  '',
  'Kod česme sam sreo starog Milutina, koji je ceo život radio na železnici. Pričao mi je o vozovima',
  'koji više ne idu, i o stanicama na kojima više niko ne čeka. Rekao je da mu najviše nedostaje zvuk',
  'pištaljke u zoru. Ja nisam znao šta da mu kažem, pa sam samo klimnuo glavom.',
].join('\n');

type CaseName = 'google-stream' | 'google-errors' | 'openrouter' | 'openrouter-stream';

interface Piece {
  /** Milliseconds from sending, by `performance.now()`. */
  atMs: number;
  text: string;
}

interface Recording {
  name: string;
  recordedAt: string;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  status: number | null;
  headers: Record<string, string>;
  headersAtMs: number | null;
  pieces: Piece[];
  endAtMs: number | null;
  /** What went wrong on our side (a timeout, no connection), as opposed to what the service said. */
  failure: string | null;
}

async function keyFrom(file: string): Promise<string> {
  try {
    return (await readFile(path.resolve('testdata', file), 'utf8')).trim();
  } catch (error) {
    throw new Error(`Could not read testdata/${file}`, { cause: error });
  }
}

/** The headers a key travels in, named but never written down. */
const KEY_HEADERS = new Set(['x-goog-api-key', 'authorization']);

function shownHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, KEY_HEADERS.has(name.toLowerCase()) ? '<KEY>' : value]));
}

interface Ask {
  name: string;
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  limitMs: number;
}

/** Sends one request and keeps every piece of the reply as it arrived, so a stream's pace survives. */
async function record(ask: Ask): Promise<Recording> {
  const recording: Recording = {
    name: ask.name,
    recordedAt: new Date().toISOString(),
    request: { method: ask.method, url: ask.url, headers: shownHeaders(ask.headers), body: ask.body ?? null },
    status: null,
    headers: {},
    headersAtMs: null,
    pieces: [],
    endAtMs: null,
    failure: null,
  };
  const start = performance.now();
  const since = (): number => Math.round(performance.now() - start);
  try {
    const response = await fetch(ask.url, {
      method: ask.method,
      headers: ask.headers,
      body: ask.body === undefined ? undefined : JSON.stringify(ask.body),
      signal: AbortSignal.timeout(ask.limitMs),
    });
    recording.status = response.status;
    recording.headersAtMs = since();
    recording.headers = Object.fromEntries(response.headers.entries());
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      if (reader === undefined) break;
      const { done, value } = await reader.read();
      if (done) break;
      recording.pieces.push({ atMs: since(), text: decoder.decode(value, { stream: true }) });
    }
    recording.endAtMs = since();
  } catch (error) {
    recording.failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    recording.endAtMs = since();
  }
  return recording;
}

function googleHeaders(key: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Api-Revision': GEMINI_API_REVISION, 'Content-Type': 'application/json' };
  if (key !== null) headers['x-goog-api-key'] = key;
  return headers;
}

function interactionsAsk(name: string, key: string | null, model: string, limitMs: number): Ask {
  return {
    name,
    method: 'POST',
    url: `${GEMINI}/interactions?alt=sse`,
    headers: { ...googleHeaders(key), Accept: 'text/event-stream' },
    body: { model, system_instruction: FEEDBACK_INSTRUCTION, input: MADE_UP_TEXT, store: false, stream: true },
    limitMs,
  };
}

function googleStreamAsks(key: string, models: string[]): Ask[] {
  return models.map((model) => interactionsAsk(`google-stream-${model}`, key, model, STREAM_LIMIT_MS));
}

function googleErrorAsks(key: string): Ask[] {
  return [
    interactionsAsk('google-wrong-key-interactions', WRONG_GOOGLE_KEY, 'gemini-3.8-flash', PLAIN_LIMIT_MS),
    interactionsAsk('google-no-key-interactions', null, 'gemini-3.8-flash', PLAIN_LIMIT_MS),
    { name: 'google-wrong-key-models', method: 'GET', url: `${GEMINI}/models?pageSize=1`, headers: googleHeaders(WRONG_GOOGLE_KEY), limitMs: PLAIN_LIMIT_MS },
    { name: 'google-models-page-1', method: 'GET', url: `${GEMINI}/models?pageSize=1`, headers: googleHeaders(key), limitMs: PLAIN_LIMIT_MS },
    { name: 'google-models-all', method: 'GET', url: `${GEMINI}/models?pageSize=1000`, headers: googleHeaders(key), limitMs: PLAIN_LIMIT_MS },
  ];
}

function openRouterAsks(key: string): Ask[] {
  const bearer = (value: string): Record<string, string> => ({ Authorization: `Bearer ${value}`, 'Content-Type': 'application/json' });
  return [
    {
      name: 'openrouter-wrong-key-completion',
      method: 'POST',
      url: `${OPENROUTER}/chat/completions`,
      headers: bearer(WRONG_OPENROUTER_KEY),
      // Refused at the door for the key; a model and a tiny limit all the same, in case it ever weren't.
      body: { model: 'google/gemini-3.8-flash', stream: true, max_tokens: 1, messages: [{ role: 'user', content: 'Zdravo.' }] },
      limitMs: PLAIN_LIMIT_MS,
    },
    { name: 'openrouter-wrong-key-key', method: 'GET', url: `${OPENROUTER}/key`, headers: bearer(WRONG_OPENROUTER_KEY), limitMs: PLAIN_LIMIT_MS },
    { name: 'openrouter-key', method: 'GET', url: `${OPENROUTER}/key`, headers: bearer(key), limitMs: PLAIN_LIMIT_MS },
    { name: 'openrouter-credits', method: 'GET', url: `${OPENROUTER}/credits`, headers: bearer(key), limitMs: PLAIN_LIMIT_MS },
  ];
}

/** A streamed OpenRouter utisak, as the app asks for one: no provider rules, Opus at medium effort, Flash at its default. */
function openRouterStreamAsk(name: string, key: string, model: string, extra: Record<string, unknown> = {}): Ask {
  const reasoning = model.startsWith('anthropic/') ? { reasoning: { effort: 'medium' } } : {};
  return {
    name,
    method: 'POST',
    url: `${OPENROUTER}/chat/completions`,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: {
      model,
      stream: true,
      ...reasoning,
      messages: [
        { role: 'system', content: FEEDBACK_INSTRUCTION },
        { role: 'user', content: MADE_UP_TEXT },
      ],
      ...extra,
    },
    limitMs: STREAM_LIMIT_MS,
  };
}

function openRouterStreamAsks(key: string): Ask[] {
  return [
    openRouterStreamAsk('openrouter-stream-gemini-3.8-flash', key, 'google/gemini-3.8-flash'),
    openRouterStreamAsk('openrouter-stream-claude-opus-5.5', key, 'anthropic/claude-opus-5.5'),
    openRouterStreamAsk('openrouter-stream-cut-off', key, 'google/gemini-3.8-flash', { max_tokens: 40 }),
    // No such host: refused before any model runs, so it costs nothing.
    openRouterStreamAsk('openrouter-no-host', key, 'google/gemini-3.8-flash', { provider: { only: ['no-such-host'], allow_fallbacks: false } }),
  ];
}

async function asksFor(cases: CaseName[], models: string[]): Promise<Ask[]> {
  const asks: Ask[] = [];
  if (cases.includes('google-stream') || cases.includes('google-errors')) {
    const googleKey = await keyFrom('gemini-key.txt');
    if (cases.includes('google-stream')) asks.push(...googleStreamAsks(googleKey, models));
    if (cases.includes('google-errors')) asks.push(...googleErrorAsks(googleKey));
  }
  if (cases.includes('openrouter')) asks.push(...openRouterAsks(await keyFrom('open-router-key.txt')));
  if (cases.includes('openrouter-stream')) asks.push(...openRouterStreamAsks(await keyFrom('open-router-key.txt')));
  return asks;
}

const KNOWN_CASES: readonly CaseName[] = ['google-stream', 'google-errors', 'openrouter', 'openrouter-stream'];
/** What runs when no case is named: everything free. The paid stream only when asked for by name. */
const FREE_CASES: readonly CaseName[] = ['google-stream', 'google-errors', 'openrouter'];

function casesFrom(list: string): CaseName[] {
  const names = list.split(',').map((name) => name.trim());
  const unknown = names.filter((name) => !(KNOWN_CASES as readonly string[]).includes(name));
  if (unknown.length > 0) throw new Error(`Unknown case: ${unknown.join(', ')}`);
  return names as CaseName[];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      cases: { type: 'string', default: FREE_CASES.join(',') },
      models: { type: 'string', default: 'gemini-3.8-flash,gemini-3.6-flash' },
    },
  });
  if (values.out === undefined) throw new Error('--out <folder> is required');
  const out = path.resolve(values.out);
  await mkdir(out, { recursive: true });
  const asks = await asksFor(casesFrom(values.cases), values.models.split(','));
  // All at once: the streams queue for minutes, and the quick ones needn't wait behind them.
  await Promise.all(
    asks.map(async (ask) => {
      const recording = await record(ask);
      await writeFile(path.join(out, `${ask.name}.json`), `${JSON.stringify(recording, null, 2)}\n`);
      console.log(`${ask.name}: status ${recording.status ?? '-'}, ${recording.pieces.length} pieces, ${recording.endAtMs ?? '-'} ms${recording.failure === null ? '' : `, ${recording.failure}`}`);
    }),
  );
}

await main();
