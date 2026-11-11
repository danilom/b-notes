import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { recorded } from './lektor-api-fixtures.ts';

/*
  The dev server's route to Google and OpenRouter, run for real but pointed at stand-ins on this
  machine that answer with the recorded replies, piece by piece. No request leaves it and no
  credit is spent. Covers what each service is sent and the route's lines of JSON: progress as
  the request moves on, then the answer.
*/

interface Received {
  url: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

let received: Received | null = null;
let respond: (response: ServerResponse) => void = () => undefined;
let standIn: Server;
let devServer: ChildProcess;
const devPort = 41_000 + Math.floor(Math.random() * 10_000);

async function readAll(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function untilServing(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${devPort}/`);
      return;
    } catch {
      // Not listening yet, which is the expected answer until it is: a retry loop, so not worth logging.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('The dev server did not start');
}

interface Lines {
  progress: unknown[];
  status: number;
  reply: Record<string, unknown>;
}

async function ask(body: object): Promise<Lines> {
  const response = await fetch(`http://127.0.0.1:${devPort}/lektor-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const lines = (await response.text()).split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
  const last = lines.at(-1) ?? {};
  return { progress: lines.flatMap((line) => (line['progress'] === undefined ? [] : [line['progress']])), status: last['status'] as number, reply: last['reply'] as Record<string, unknown> };
}

/** Replays a recorded reply: its status, then its pieces as they came, all at once. */
function replay(name: string): (response: ServerResponse) => void {
  const { status, pieces } = recorded(name);
  return (response) => {
    response.writeHead(status, { 'content-type': 'text/event-stream' });
    for (const piece of pieces) response.write(piece);
    response.end();
  };
}

const FREE = { provider: 'gemini', action: 'send', key: 'google-test-key', model: 'gemini-3.6-flash', system: 'Uputstvo.', input: 'Tekst.' };
const PAID = { provider: 'openrouter', action: 'send', key: 'openrouter-test-key', model: 'anthropic/claude-opus-5.5', system: 'Uputstvo.', input: 'Tekst.' };

before(async () => {
  standIn = createServer((request, response) => {
    void readAll(request).then((raw) => {
      received = { url: request.url ?? '', headers: request.headers, body: raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>) };
      respond(response);
    });
  });
  await new Promise<void>((resolve) => standIn.listen(0, '127.0.0.1', resolve));
  const { port } = standIn.address() as AddressInfo;
  devServer = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(devPort)], {
    env: { ...process.env, LEKTOR_GOOGLE_URL: `http://127.0.0.1:${port}/google`, LEKTOR_OPENROUTER_URL: `http://127.0.0.1:${port}/openrouter` },
    stdio: 'ignore',
  });
  await untilServing();
});

after(() => {
  devServer.kill();
  standIn.close();
});

beforeEach(() => {
  received = null;
});

describe('the dev server route to Google', () => {
  it('streams /interactions with the key in its header, storing nothing at Google', async () => {
    respond = replay('google-stream-whole-gemini-3.6-flash');
    await ask(FREE);
    assert.equal(received?.url, '/google/interactions?alt=sse');
    assert.equal(received?.headers['x-goog-api-key'], 'google-test-key');
    assert.equal(received?.body['stream'], true);
    assert.equal(received?.body['store'], false);
    assert.equal(received?.body['system_instruction'], 'Uputstvo.');
    assert.equal(received?.body['input'], 'Tekst.');
  });

  it('tells the page each step as it comes, then gives the whole reply and the model that ran', async () => {
    respond = replay('google-stream-whole-gemini-3.6-flash');
    const { progress, status, reply } = await ask(FREE);
    assert.equal(status, 200);
    assert.deepEqual(progress[0], { kind: 'started', model: 'gemini-3.6-flash' });
    assert.ok(progress.some((one) => (one as { kind: string }).kind === 'writing'));
    assert.equal(reply['status'], 'completed');
    assert.equal(reply['model'], 'gemini-3.6-flash');
    assert.match(reply['text'] as string, /\S/);
  });

  it("passes Google's bare-JSON refusal through, whatever its content type says", async () => {
    respond = replay('google-busy-at-once-gemini-3.8-flash');
    const { status, reply } = await ask({ ...FREE, model: 'gemini-3.8-flash' });
    assert.equal(status, 503);
    assert.equal((reply['error'] as Record<string, unknown>)['code'], 'service_unavailable');
  });

  it('sends nothing at all without a key, least of all his text', async () => {
    const { status } = await ask({ ...FREE, key: '' });
    assert.equal(status, 401);
    assert.equal(received, null);
  });
});

describe('the dev server route to OpenRouter', () => {
  it('asks Opus at medium effort, streamed, with no host rules', async () => {
    respond = replay('openrouter-stream-claude-opus-5.5');
    await ask(PAID);
    assert.equal(received?.url, '/openrouter/chat/completions');
    assert.equal(received?.headers['authorization'], 'Bearer openrouter-test-key');
    assert.equal(received?.body['stream'], true);
    assert.deepEqual(received?.body['reasoning'], { effort: 'medium' });
    assert.equal(received?.body['provider'], undefined);
    assert.deepEqual(received?.body['messages'], [
      { role: 'system', content: 'Uputstvo.' },
      { role: 'user', content: 'Tekst.' },
    ]);
  });

  it('gives paid Flash no reasoning setting, leaving the service its default', async () => {
    respond = replay('openrouter-stream-gemini-3.8-flash');
    await ask({ ...PAID, model: 'google/gemini-3.8-flash' });
    assert.equal(received?.body['reasoning'], undefined);
  });

  it('gives back the words, the finish and what it cost', async () => {
    respond = replay('openrouter-stream-claude-opus-5.5');
    const { progress, status, reply } = await ask(PAID);
    assert.equal(status, 200);
    assert.equal(reply['finish'], 'stop');
    assert.equal(reply['cost'], 0.015804);
    assert.deepEqual(progress[0], { kind: 'started', model: 'anthropic/claude-opus-5.5' });
  });

  it('reads the balance from both lookups', async () => {
    respond = replay('openrouter-credits');
    const { status, reply } = await ask({ ...PAID, action: 'balance', model: '', system: '', input: '' });
    assert.equal(status, 200);
    assert.ok(reply['credits'] !== undefined && reply['key'] !== undefined);
  });

  it('checks a key with its own lookup', async () => {
    respond = replay('openrouter-wrong-key-key');
    const { status } = await ask({ ...PAID, action: 'check', model: '', system: '', input: '' });
    assert.equal(status, 401);
    assert.equal(received?.url, '/openrouter/key');
  });
});
