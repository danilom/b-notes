import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

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

const server = createServer((request, response) => {
  const requested = new URL(request.url ?? '/', 'http://localhost');
  const relative = requested.pathname === '/' ? 'index.html' : requested.pathname.slice(1);

  // Empties this origin's storage and starts again, so an empty browser fills
  // afresh from the corpus — after regenerating it, or to undo a session.
  if (relative === 'reset') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<script>localStorage.clear(); sessionStorage.clear(); location.replace("/");</script>');
    return;
  }

  // The app framed at the size of his screens, for tuning how it looks. A
  // tool, not part of the app, so it lives outside dist/ and is served from
  // the same address, which puts whichever corpus this server has in its frame.
  if (relative === 'his-screens') {
    readFile(path.resolve('tools/his-screens.html')).then(
      (body) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(body);
      },
      (error) => {
        console.error('Failed to serve the his-screens page', error);
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
