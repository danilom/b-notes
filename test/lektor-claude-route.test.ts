import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

/*
  The dev server's route to Claude, run for real but pointed at a stand-in for Anthropic
  on this machine. No request leaves it and no credit is spent. A wrong key in the body
  also means testdata's own, if there is one, is never read.
*/

const STREAM = [
  { type: 'message_start', message: { usage: { input_tokens: 50, output_tokens: 1 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Utisak.' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } },
]
  .map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`)
  .join('');

interface Received {
  url: string;
  key: string | undefined;
  version: string | undefined;
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

async function ask(body: object): Promise<{ status: number; reply: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${devPort}/lektor-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, reply: (await response.json()) as Record<string, unknown> };
}

const SEND = { provider: 'claude', action: 'send', key: 'test-key', model: 'claude-opus-5-5', system: 'Uputstvo.', input: 'Tekst.' };

before(async () => {
  standIn = createServer((request, response) => {
    void readAll(request).then((raw) => {
      received = {
        url: request.url ?? '',
        key: request.headers['x-api-key'] as string | undefined,
        version: request.headers['anthropic-version'] as string | undefined,
        body: raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>),
      };
      respond(response);
    });
  });
  await new Promise<void>((resolve) => standIn.listen(0, '127.0.0.1', resolve));
  const { port } = standIn.address() as AddressInfo;
  devServer = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(devPort)], {
    env: { ...process.env, LEKTOR_CLAUDE_URL: `http://127.0.0.1:${port}/v1` },
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

describe('the dev server route to Claude', () => {
  it('sends the key, the version, and a streaming request holding the instruction and the text', async () => {
    respond = (response) => response.writeHead(200, { 'content-type': 'text/event-stream' }).end(STREAM);
    await ask(SEND);
    assert.equal(received?.url, '/v1/messages');
    assert.equal(received?.key, 'test-key');
    assert.ok(received?.version);
    assert.equal(received?.body['stream'], true);
    assert.equal(received?.body['model'], 'claude-opus-5-5');
    assert.equal(received?.body['system'], 'Uputstvo.');
    assert.deepEqual(received?.body['messages'], [{ role: 'user', content: 'Tekst.' }]);
  });

  it('gives the page the whole reply at once, with what it used', async () => {
    respond = (response) => response.writeHead(200, { 'content-type': 'text/event-stream' }).end(STREAM);
    const { status, reply } = await ask(SEND);
    assert.equal(status, 200);
    assert.equal(reply['text'], 'Utisak.');
    assert.equal(reply['stopReason'], 'end_turn');
    assert.deepEqual(reply['usage'], { inputTokens: 50, outputTokens: 9 });
  });

  it('passes a refusal through with its status and words', async () => {
    const refusal = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } });
    respond = (response) => response.writeHead(400, { 'content-type': 'application/json' }).end(refusal);
    const { status, reply } = await ask(SEND);
    assert.equal(status, 400);
    assert.deepEqual(reply['error'], { type: 'invalid_request_error', message: 'Your credit balance is too low' });
  });

  it('turns an error partway through the reply into overload rather than half a text', async () => {
    const failing = `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Pola' } })}\n\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })}\n\n`;
    respond = (response) => response.writeHead(200, { 'content-type': 'text/event-stream' }).end(failing);
    const { status, reply } = await ask(SEND);
    assert.equal(status, 529);
    assert.equal(reply['text'], undefined);
  });

  it('sends nothing at all without a key, least of all his text', async () => {
    const { status } = await ask({ ...SEND, key: '' });
    assert.equal(status, 401);
    assert.equal(received, null);
  });

  it('checks a key against the models list', async () => {
    respond = (response) => response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    const { status } = await ask({ provider: 'claude', action: 'check', key: 'test-key', model: '', system: '', input: '' });
    assert.equal(status, 200);
    assert.equal(received?.url, '/v1/models?limit=1');
  });
});
