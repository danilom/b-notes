import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { readClaudeStream } from './claude-stream.mjs';

/** The browser build, which is the one carrying the mock store. */
const root = path.resolve('dist-browser');
/** `--port <n>`, and `--resoph <json>` to serve his folder in place of the invented corpus. */
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);

const port = Number(args.get('port') ?? process.env['PORT'] ?? 5173);
const corpora =
  args.get('resoph') === undefined
    ? new Map([['corpus.json', path.resolve('testdata/corpus.json')]])
    : new Map([['resoph-corpus.json', path.resolve(args.get('resoph'))]]);

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  // Without it the favicon is served as bytes and Chromium declines to use it.
  ['.svg', 'image/svg+xml'],
  ['.map', 'application/json; charset=utf-8'],
]);

/*
  Pages that are tools rather than part of the app, so they live outside dist/.
  Served from the same address as it: his-screens frames the app, which puts
  whichever corpus this server has in the frame.
*/
const TOOL_PAGES = new Map([
  ['his-screens', 'tools/his-screens.html'],
  ['diff-prototype', 'design/diff-prototype.html'],
  ['lektor-prototype', 'design/lektor-prototype.html'],
]);

/*
  His real writing, for the diff prototype, as `<name>.current.txt` beside
  `<name>.proposed.txt`. Read from testdata/, which git ignores: this repo is
  public and these are his essays, so they must never be part of a build or a
  commit. A checkout without them simply has none to offer.
*/
const DIFF_SAMPLES_FOLDER = path.resolve('testdata/diff-samples');
const CURRENT_SUFFIX = '.current.txt';

async function readDiffSamples() {
  let names;
  try {
    names = await readdir(DIFF_SAMPLES_FOLDER);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const currents = names.filter((name) => name.endsWith(CURRENT_SUFFIX));
  return Promise.all(
    currents.map(async (file) => {
      const name = file.slice(0, -CURRENT_SUFFIX.length);
      return {
        name,
        current: await readFile(path.join(DIFF_SAMPLES_FOLDER, file), 'utf8'),
        proposed: await readFile(path.join(DIFF_SAMPLES_FOLDER, `${name}.proposed.txt`), 'utf8'),
      };
    }),
  );
}

/*
  For trying the Lektor prototype on real AI. Here because the keys must not be
  in the page, as in the app they will live in the main process. A key comes from the
  page if he pasted one, or else from testdata/, which git ignores. Logs no text.
*/
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_KEY_FILE = path.resolve('testdata/gemini-key.txt');
const GEMINI_API_REVISION = '2026-05-20';
// Replaceable so that the test of this route talks to a stand-in and spends nothing.
const CLAUDE = process.env['LEKTOR_CLAUDE_URL'] ?? 'https://api.anthropic.com/v1';
const CLAUDE_KEY_FILE = path.resolve('testdata/claude-key.txt');
const CLAUDE_API_VERSION = '2026-10-21';
const CLAUDE_LONGEST_REPLY_TOKENS = 64_000;
const LARGEST_REQUEST_BYTES = 4 * 1024 * 1024;

async function keyFor(given, file) {
  if (typeof given === 'string' && given !== '') return given;
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function bodyOf(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > LARGEST_REQUEST_BYTES) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function askGemini(asked) {
  const key = await keyFor(asked.key, GEMINI_KEY_FILE);
  if (asked.action === 'has-key') return Response.json({ hasKey: key !== '' });
  const headers = { 'x-goog-api-key': key, 'Api-Revision': GEMINI_API_REVISION };
  if (asked.action === 'ping') {
    // Any answer at all means the internet is there, whatever Google thinks of the request.
    await fetch(`${GEMINI}/models?pageSize=1`, { signal: AbortSignal.timeout(8_000) });
    return new Response('{}', { status: 200 });
  }
  if (asked.action === 'check') {
    return fetch(`${GEMINI}/models?pageSize=1`, { headers, signal: AbortSignal.timeout(15_000) });
  }
  return fetch(`${GEMINI}/interactions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    // store: false, so Google keeps no conversation of its own.
    body: JSON.stringify({ model: asked.model, system_instruction: asked.system, input: asked.input, store: false }),
    signal: AbortSignal.timeout(180_000),
  });
}

async function askClaude(asked) {
  const key = await keyFor(asked.key, CLAUDE_KEY_FILE);
  if (asked.action === 'has-key') return Response.json({ hasKey: key !== '' });
  // Nothing is sent, least of all his text, on a request that can only be refused. No words: it isn't Anthropic talking.
  if (key === '') return Response.json({ error: { message: '' } }, { status: 401 });
  const headers = { 'x-api-key': key, 'anthropic-version': CLAUDE_API_VERSION };
  if (asked.action === 'check') {
    return fetch(`${CLAUDE}/models?limit=1`, { headers, signal: AbortSignal.timeout(15_000) });
  }
  const response = await fetch(`${CLAUDE}/messages`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: asked.model,
      max_tokens: CLAUDE_LONGEST_REPLY_TOKENS,
      output_config: { effort: 'medium' },
      stream: true,
      system: asked.system,
      messages: [{ role: 'user', content: asked.input }],
    }),
    // A long essay took over four minutes when tried, so more than Gemini's three.
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) return response;
  const { text, stopReason, explanation, usage, error } = await readClaudeStream(response.body);
  if (error !== null) return Response.json({ error }, { status: error.type === 'rate_limit_error' ? 429 : 529 });
  return Response.json({ text, stopReason, explanation, usage });
}

async function serveLektorAi(request, response) {
  // Never to anyone else on the network: this spends the key.
  const from = request.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(from)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const answer = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(body);
  };
  try {
    const asked = await bodyOf(request);
    const started = Date.now();
    const reply = await (asked.provider === 'claude' ? askClaude(asked) : askGemini(asked));
    console.log('Lektor AI', asked.action, asked.model ?? '', reply.status, `${Date.now() - started} ms`);
    answer(reply.status, await reply.text());
  } catch (error) {
    console.error('Lektor AI could not reach the service:', error.name);
    // Reached but out of time is the service's trouble; only no answer at all reads as being offline.
    answer(error.name === 'TimeoutError' ? 504 : 502, JSON.stringify({ error: { message: error.name } }));
  }
}

const server = createServer((request, response) => {
  const requested = new URL(request.url ?? '/', 'http://localhost');
  const relative = requested.pathname === '/' ? 'index.html' : requested.pathname.slice(1);

  if (relative === 'lektor-ai' && request.method === 'POST') {
    void serveLektorAi(request, response);
    return;
  }

  // Empties this origin's storage and starts again, so an empty browser fills
  // afresh from the corpus — after regenerating it, or to undo a session.
  if (relative === 'reset') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<script>localStorage.clear(); sessionStorage.clear(); location.replace("/");</script>');
    return;
  }

  if (relative === 'diff-samples.json') {
    readDiffSamples().then(
      (samples) => {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(samples));
      },
      (error) => {
        console.error('Failed to read the diff samples', error);
        response.writeHead(500).end('Server error');
      },
    );
    return;
  }

  const toolPage = TOOL_PAGES.get(relative);
  if (toolPage !== undefined) {
    readFile(path.resolve(toolPage)).then(
      (body) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(body);
      },
      (error) => {
        console.error('Failed to serve', toolPage, error);
        response.writeHead(500).end('Server error');
      },
    );
    return;
  }

  // The corpora live outside dist/, so the browser can be filled with hundreds
  // of texts while the UI is being worked on. Only one is served at a time, so
  // his texts and the invented ones can never be mixed in one browser.
  const corpus = corpora.get(relative);
  if (corpus !== undefined) {
    readFile(corpus).then(
      (body) => {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(body);
      },
      () => response.writeHead(404).end('Not found'),
    );
    return;
  }

  const target = path.resolve(root, relative);

  // Never serve outside dist/, whatever the request path claims.
  if (target !== root && !target.startsWith(root + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  readFile(target).then(
    (body) => {
      response.writeHead(200, {
        'content-type': CONTENT_TYPES.get(path.extname(target)) ?? 'application/octet-stream',
      });
      response.end(body);
    },
    (error) => {
      if (error.code === 'ENOENT') {
        response.writeHead(404).end('Not found');
        return;
      }
      console.error('Failed to serve', target, error);
      response.writeHead(500).end('Server error');
    },
  );
});

server.listen(port, () => {
  console.log(`serving ${path.basename(root)}/ on http://localhost:${port}`);
});
