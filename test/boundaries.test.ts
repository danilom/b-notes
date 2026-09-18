import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The folders are a promise about where code can run, and nothing enforces it at
 * build time. A stray import would fail in the worst way — silently: the mock
 * store shipped inside the app he installs, or a rule living on only one side of
 * the storage seam.
 */
const SOURCE = 'src';


async function sourceFiles(folder: string): Promise<string[]> {
  const entries = await readdir(path.join(SOURCE, folder), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(SOURCE, folder, entry.name));
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
  for (const folder of ['notes', 'platform', 'language', 'ui', 'electron']) {
    it(`keeps the mock out of ${folder}, so it cannot ship`, async () => {
      assert.deepEqual(await offenders(folder, /mockup/), []);
    });
  }

  for (const folder of ['notes', 'platform', 'language', 'ui']) {
    it(`keeps Electron and Node out of ${folder}, which also runs in a browser`, async () => {
      assert.deepEqual(await offenders(folder, /electron|node:/), []);
    });
  }

  it('keeps Electron and Node out of the mock, which only runs in a browser', async () => {
    assert.deepEqual(await offenders('mockup', /\.\.\/electron|node:/), []);
  });

  it('keeps the interface out of everything that is not the interface', async () => {
    for (const folder of ['notes', 'platform', 'language']) {
      assert.deepEqual(await offenders(folder, /\.\.\/ui\//), [], folder);
    }
  });

  it('lets the mock use the interface, since standing in for Electron is the point', async () => {
    const entry = await importsIn(path.join(SOURCE, 'mockup', 'browser-entry.ts'));

    assert.ok(entry.some((specifier) => specifier.includes('ui/ui-app')));
  });
});

