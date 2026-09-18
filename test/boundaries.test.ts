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

/** The folders that run everywhere, and so can depend on nothing host-specific. */
const PORTABLE = ['notes', 'platform', 'language', 'ui'];

describe('where code is allowed to reach', () => {
  for (const folder of PORTABLE) {
    it(`keeps hosts out of ${folder}, which has to run in both`, async () => {
      assert.deepEqual(await offenders(folder, /hosts\/|electron|node:/), []);
    });
  }

  it('keeps Electron and Node out of the mock host, which only runs in a browser', async () => {
    assert.deepEqual(await offenders('hosts/mockup', /electron|node:/), []);
  });

  it('keeps one host out of the other', async () => {
    assert.deepEqual(await offenders('hosts/electron', /mockup/), []);
    assert.deepEqual(await offenders('hosts/mockup', /hosts\/electron|\.\.\/electron/), []);
  });

  it('keeps the interface out of everything that is not the interface', async () => {
    for (const folder of ['notes', 'platform', 'language']) {
      assert.deepEqual(await offenders(folder, /\/ui\//), [], folder);
    }
  });

  /**
   * A host provides somewhere to keep files and starts the interface. What a
   * note is — how one is named, saved or put away — is the app's business, and
   * a host that knew would be a second place for those rules to live.
   */
  for (const host of ['hosts/electron', 'hosts/mockup']) {
    it(`keeps what a note is out of ${host}`, async () => {
      assert.deepEqual(await offenders(host, /notes\//), []);
    });
  }

  it('lets a host start the interface, which is what a host is for', async () => {
    for (const host of ['hosts/electron', 'hosts/mockup']) {
      const entry = await importsIn(path.join(SOURCE, host, 'browser-entry.ts'));
      assert.ok(
        entry.some((specifier) => specifier.includes('ui/ui-app')),
        host,
      );
    }
  });
});

