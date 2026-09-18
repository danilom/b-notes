import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

/** The browser build, which is the one carrying the mock store. */
const root = path.resolve('dist-browser');
const port = Number(process.env['PORT'] ?? 5173);

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
]);

const server = createServer((request, response) => {
  const requested = new URL(request.url ?? '/', 'http://localhost');
  const relative = requested.pathname === '/' ? 'index.html' : requested.pathname.slice(1);

  // The generated corpus lives outside dist/, so the browser can be filled with
  // six hundred texts while the UI is being worked on.
  if (relative === 'corpus.json') {
    readFile(path.resolve('testdata/corpus.json')).then(
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
