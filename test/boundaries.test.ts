import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The folders are a promise about where code can run, and nothing enforces it
 * at build time. A stray import would fail silently in the worst way: the mock
 * store shipped inside the app he installs, or a rule that exists on only one
 * side of the storage seam.
 */
const SOURCE = 'src';

async function sourceFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(path.join(SOURCE, folder), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) found.push(path.join(SOURCE, folder, entry.name));
  }
  return found;
}

async function importsIn(file: string): Promise<string[]> {
  const text = await readFile(file, 'utf8');
  return [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '');
}

async function offenders(folder: string, forbidden: RegExp): Promise<string[]> {
  const bad: string[] = [];
  for (const file of await sourceFiles(folder)) {
    for (const specifier of await importsIn(file)) {
      if (forbidden.test(specifier)) bad.push(`${file} imports ${specifier}`);
    }
  }
  return bad;
}

describe('where code is allowed to reach', () => {
  it('keeps the mock out of the interface, so it cannot ship', async () => {
    assert.deepEqual(await offenders('renderer', /mockup/), []);
  });

  it('keeps the mock out of shared code', async () => {
    assert.deepEqual(await offenders('shared', /mockup/), []);
  });

  it('keeps the mock out of the Electron process', async () => {
    assert.deepEqual(await offenders('electron', /mockup/), []);
  });

  it('keeps Electron-only code out of the interface, which also runs in a browser', async () => {
    assert.deepEqual(await offenders('renderer', /electron|node:/), []);
  });

  it('keeps Electron-only code out of shared', async () => {
    assert.deepEqual(await offenders('shared', /electron|node:/), []);
  });

  it('keeps Electron-only code out of the mock, which only runs in a browser', async () => {
    assert.deepEqual(await offenders('mockup', /\.\.\/electron|node:/), []);
  });

  it('lets the mock use the interface, since that is the point of it', async () => {
    const entry = await importsIn(path.join(SOURCE, 'mockup', 'entry.ts'));

    assert.ok(entry.some((specifier) => specifier.includes('renderer/app')));
  });
});
