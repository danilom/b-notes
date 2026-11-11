import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { askLektorService, lektorLogDetail, lektorRequestFrom } from '../src/platform/lektor-remote.ts';

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
  ['lektor-choice-prototype', 'design/lektor-choice-prototype.html'],
  ['lektor-menu-pictures', 'design/lektor-menu-pictures.html'],
  ['lektor-tier-marks', 'design/lektor-tier-marks.html'],
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
  A real service's corrections of a sample text, for the test Lektor to hand back instead of its
  own made-up ones, so the review can be tried on what a real one sends. Kept beside the text as
  `<name>.lektor-<preset>.txt`, in testdata/ like the rest, and found by the text's title, as
  the app finds its own: a text changed to try something else still gets them. Null when there
  are none.
*/
const PRESETS = new Set(['letters', 'grammar', 'wording', 'rewrite']);
const titleOf = (text) => text.trimStart().split(/\r?\n/, 1)[0]?.trim() ?? '';

async function readRealReply(text, preset) {
  if (!PRESETS.has(preset)) return null;
  for (const sample of await readDiffSamples()) {
    if (titleOf(sample.current) !== titleOf(text)) continue;
    try {
      return await readFile(path.join(DIFF_SAMPLES_FOLDER, `${sample.name}.lektor-${preset}.txt`), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  return null;
}

async function serveRealReply(request, response) {
  try {
    const { text, preset } = await bodyOf(request);
    const proposed = typeof text === 'string' && typeof preset === 'string' ? await readRealReply(text, preset) : null;
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ proposed }));
  } catch (error) {
    console.error('Failed to look up a real Lektor reply', error);
    response.writeHead(500).end('Server error');
  }
}

/*
  The browser build's way to an AI service, for what the main process does in the app:
  the page may not reach those addresses itself. The same code as the app's. Logs no text.

  Answered in lines of JSON (NDJSON), one per line: `{ progress }` as the request moves on, so
  the wait can tell queued from working, then `{ status, reply }` last, which is the answer.
*/
const LARGEST_REQUEST_BYTES = 4 * 1024 * 1024;
// Replaceable so that the test of this route talks to stand-ins and spends nothing.
const LEKTOR_ADDRESSES = { gemini: process.env['LEKTOR_GOOGLE_URL'], openrouter: process.env['LEKTOR_OPENROUTER_URL'] };

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

async function serveLektorAi(request, response) {
  // Never to anyone else on the network: this spends the key.
  const from = request.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(from)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
  const line = (body) => response.write(`${JSON.stringify(body)}\n`);
  try {
    const asked = lektorRequestFrom(await bodyOf(request));
    const started = performance.now();
    const stop = new AbortController();
    // He gave up, which the page shows the server by going away.
    response.on('close', () => {
      if (!response.writableEnded) stop.abort();
    });
    const answered = await askLektorService(asked, {
      stop: stop.signal,
      addresses: LEKTOR_ADDRESSES,
      onProgress: (progress) => line({ progress }),
    });
    console.log('Lektor AI', lektorLogDetail(asked, answered, Math.round(performance.now() - started)));
    response.end(`${JSON.stringify({ status: answered.status, reply: answered.reply })}\n`);
  } catch (error) {
    console.error('Lektor AI could not be asked:', error.name);
    response.end(`${JSON.stringify({ status: 400, reply: { error: { message: error.name } } })}\n`);
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

  if (relative === 'lektor-real-reply' && request.method === 'POST') {
    void serveRealReply(request, response);
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
