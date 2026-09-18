import { cp, mkdir } from 'node:fs/promises';

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
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
