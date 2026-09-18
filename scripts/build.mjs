import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile } from 'node:fs/promises';

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

function git(args) {
  // A build without git available is still a usable build; it just can't say
  // which commit it came from.
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function buildStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const when =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown';

  return `${when} ${commit}`;
}

const { version } = JSON.parse(await readFile('package.json', 'utf8'));

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
    __APP_VERSION__: JSON.stringify(version),
  },
};

const targets = [
  {
    ...shared,
    entryPoints: ['src/main/main.ts'],
    outfile: 'dist/main.js',
    platform: 'node',
    format: 'esm',
    // electron-updater resolves parts of itself at runtime, so it ships as a
    // real dependency rather than being bundled in.
    external: ['electron', 'electron-updater'],
  },
  {
    // Preload stays CommonJS: an ESM preload would need the sandbox turned off.
    ...shared,
    entryPoints: ['src/main/preload.ts'],
    outfile: 'dist/preload.cjs',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  },
  {
    ...shared,
    entryPoints: ['src/renderer/renderer.ts'],
    outfile: 'dist/renderer.js',
    platform: 'browser',
    format: 'iife',
  },
];

await mkdir('dist', { recursive: true });
await cp('src/renderer/index.html', 'dist/index.html');

if (watch) {
  const contexts = await Promise.all(targets.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('watching for changes');
} else {
  await Promise.all(targets.map((options) => esbuild.build(options)));
}
