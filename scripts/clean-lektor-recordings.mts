/**
 * Makes test fixtures of what `scripts/record-lektor-api.mts` recorded: takes out the keys,
 * account and request identifiers and e-mail addresses, keeps only the headers a fake needs, and
 * shortens a long stream by trimming its middle. Every byte left is as the service sent it.
 *
 *   node scripts/clean-lektor-recordings.mts --from <raw folder> --to test/fixtures/lektor-api
 *        [--rename old-name=new-name,...]
 *
 * Refuses to write a fixture in which a real key, or anything shaped like one, is still there.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

/** What a fake needs to answer as the service did; the rest is cookies, tracing and request ids. */
const KEPT_HEADERS = new Set(['content-type', 'retry-after', 'x-openrouter-error-origin']);

/** Fields that name an account, a key or one request. Their values are replaced wherever they appear. */
const IDENTIFYING_FIELDS: Record<string, string> = {
  label: 'sk-or-v1-abc...xyz',
  creator_user_id: 'user_REDACTED',
  organization_id: 'org_REDACTED',
  workspace_id: 'workspace_REDACTED',
  id: 'REDACTED_ID',
  interaction_id: 'REDACTED_ID',
  event_id: 'REDACTED_EVENT_ID',
  continuation_token: 'REDACTED_TOKEN',
  budget_id: 'REDACTED_BUDGET_ID',
  guardrail_id: 'REDACTED_GUARDRAIL_ID',
  nextPageToken: 'REDACTED_PAGE_TOKEN',
};

const KEY_SHAPES = [/sk-or-v1-[0-9a-f]{20,}/g, /AIza[0-9A-Za-z_-]{30,}/g, /sk-ant-[0-9A-Za-z_-]{20,}/g];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** The made-up keys the recorder sends on purpose, which may stay. */
const MADE_UP_KEYS = new Set([`AIzaSy${'X'.repeat(33)}`, `sk-or-v1-${'0'.repeat(64)}`]);

/** A stream with more text pieces than this keeps its first and last few and says how many it dropped. */
const MOST_TEXT_PIECES = 24;
const KEPT_AT_EACH_END = 8;

interface Piece {
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
  failure: string | null;
  /** Set here, never by the recorder: what was taken out, so a reader knows the fixture is not whole. */
  trimmed?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecording(value: unknown, file: string): Recording {
  if (!isRecord(value) || typeof value['name'] !== 'string' || !Array.isArray(value['pieces'])) {
    throw new Error(`${file} is not a recording`);
  }
  return value as unknown as Recording;
}

/** Every value of an identifying field in a JSON document, wherever it is nested. */
function identifyingValues(value: unknown, found: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) identifyingValues(item, found);
    return;
  }
  if (!isRecord(value)) return;
  for (const [name, inner] of Object.entries(value)) {
    const placeholder = IDENTIFYING_FIELDS[name];
    if (placeholder !== undefined && typeof inner === 'string' && inner !== '') found.set(inner, placeholder);
    else identifyingValues(inner, found);
  }
}

/** The JSON documents in a body: the whole body, or each `data:` line of a stream. */
function documentsIn(body: string): unknown[] {
  const candidates = [body, ...body.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())];
  const documents: unknown[] = [];
  for (const candidate of candidates) {
    try {
      documents.push(JSON.parse(candidate) as unknown);
    } catch {
      // Most candidates aren't JSON (a whole stream, a keep-alive); only the ones that are matter here.
    }
  }
  return documents;
}

function replaceAll(text: string, replacements: Map<string, string>): string {
  let result = text;
  for (const [value, placeholder] of replacements) result = result.split(value).join(placeholder);
  for (const shape of KEY_SHAPES) result = result.replace(shape, (match) => (MADE_UP_KEYS.has(match) ? match : '<KEY>'));
  return result.replace(EMAIL, 'someone@example.com');
}

/** Drops the middle of a long run of text pieces, keeping keep-alives and every non-text event. */
function trimMiddle(recording: Recording): void {
  const isWords = (piece: Piece): boolean => piece.text.includes('"step.delta"');
  const words = recording.pieces.filter(isWords);
  if (words.length <= MOST_TEXT_PIECES) return;
  const dropped = new Set(words.slice(KEPT_AT_EACH_END, words.length - KEPT_AT_EACH_END));
  recording.pieces = recording.pieces.filter((piece) => !dropped.has(piece));
  recording.trimmed = `${dropped.size} of ${words.length} step.delta pieces taken out of the middle; the text is not whole`;
}

/** The full model list is long and changes weekly; the Flash models the Lektor asks for are what matter. */
function trimModelList(recording: Recording): void {
  if (!recording.name.endsWith('models-all')) return;
  const body = JSON.parse(recording.pieces.map((piece) => piece.text).join('')) as unknown;
  if (!isRecord(body) || !Array.isArray(body['models'])) return;
  const all = body['models'];
  const kept = all.filter((model) => isRecord(model) && /gemini-3\.[0-9]-flash$/.test(String(model['name'])));
  body['models'] = kept;
  recording.pieces = [{ atMs: recording.pieces.at(-1)?.atMs ?? 0, text: `${JSON.stringify(body, null, 2)}\n` }];
  recording.trimmed = `models other than gemini-3.x-flash taken out (${all.length} listed, ${kept.length} kept); re-serialised, and the pieces joined`;
}

function leftovers(text: string, secrets: string[]): string[] {
  const shaped = KEY_SHAPES.flatMap((shape) => text.match(shape) ?? []).filter((match) => !MADE_UP_KEYS.has(match));
  return [...secrets.filter((secret) => text.includes(secret)).map(() => 'a real key'), ...shaped];
}

function clean(recording: Recording, secrets: string[]): Recording {
  const cleaned = structuredClone(recording);
  const replacements = new Map<string, string>(secrets.map((secret) => [secret, '<KEY>']));
  for (const document of documentsIn(recording.pieces.map((piece) => piece.text).join(''))) identifyingValues(document, replacements);
  cleaned.headers = Object.fromEntries(Object.entries(recording.headers).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())));
  cleaned.pieces = recording.pieces.map((piece) => ({ atMs: piece.atMs, text: replaceAll(piece.text, replacements) }));
  trimMiddle(cleaned);
  trimModelList(cleaned);
  const left = leftovers(JSON.stringify(cleaned), secrets);
  if (left.length > 0) throw new Error(`${recording.name}: still holds ${left.length} key-like value(s); not written`);
  const joined = cleaned.pieces.map((piece) => piece.text).join('');
  const missed = [...replacements.keys()].filter((value) => joined.includes(value));
  if (missed.length > 0) throw new Error(`${recording.name}: an identifier split across pieces survived; not written`);
  return cleaned;
}

async function secretsFrom(files: string[]): Promise<string[]> {
  const secrets: string[] = [];
  for (const file of files) {
    try {
      secrets.push((await readFile(path.resolve('testdata', file), 'utf8')).trim());
    } catch (error) {
      throw new Error(`Could not read testdata/${file}, which is needed to check that it isn't in a fixture`, { cause: error });
    }
  }
  return secrets.filter((secret) => secret.length >= 16);
}

function renamesFrom(list: string | undefined): Map<string, string> {
  const pairs = (list ?? '').split(',').filter((pair) => pair.includes('='));
  return new Map(pairs.map((pair) => pair.split('=', 2) as [string, string]));
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, rename: { type: 'string' } } });
  if (values.from === undefined || values.to === undefined) throw new Error('--from <raw folder> and --to <fixtures folder> are required');
  const secrets = await secretsFrom(['gemini-key.txt', 'open-router-key.txt', 'claude-key.txt']);
  const renames = renamesFrom(values.rename);
  await mkdir(values.to, { recursive: true });
  for (const file of (await readdir(values.from)).filter((name) => name.endsWith('.json'))) {
    const recording = asRecording(JSON.parse(await readFile(path.join(values.from, file), 'utf8')) as unknown, file);
    const cleaned = clean(recording, secrets);
    cleaned.name = renames.get(cleaned.name) ?? cleaned.name;
    await writeFile(path.join(values.to, `${cleaned.name}.json`), `${JSON.stringify(cleaned, null, 2)}\n`);
    console.log(`${cleaned.name}: ${cleaned.pieces.length} pieces${cleaned.trimmed === undefined ? '' : ` (${cleaned.trimmed})`}`);
  }
}

await main();
