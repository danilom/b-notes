import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * What the window is handed, as opposed to what it says.
 *
 * The channel names either side of the bridge are checked in
 * `boundaries.test.ts`, beside the other rules about which half may know what.
 * What is left here is the capabilities themselves: each is exposed on
 * `window` by name and looked for by name at startup, so one added to `Host`
 * and forgotten in the preload is `undefined` at that check — a clear failure,
 * but only on the machine where the app is installed.
 *
 * Not hypothetical. `listFolders` was added to the filesystem for Arhiva; the
 * disk and the mock grew it, this bridge did not, and the installed app
 * greeted him with "Ne mogu da naći tvoje tekstove" for a fault that had
 * nothing to do with his texts. The preload's object is annotated `FileSystem`
 * now, so a missing *method* is the compiler's to catch.
 */

const PRELOAD = 'src/hosts/electron/preload-bridge.ts';
const MAIN = 'src/hosts/electron/electron-main.ts';

const found = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((match) => match[1] ?? '');

describe('the bridge between the window and the main process', () => {
  it('hands the window every capability the interface asks the host for', async () => {
    /*
      The preload exposes each of these on `window` and the host entry checks
      for them one at a time, at startup, by name. A capability added to `Host`
      and forgotten here is `undefined` at that check — which is a clear enough
      failure, but only on the machine where the app is installed.
    */
    const preload = await readFile(PRELOAD, 'utf8');
    const entry = await readFile('src/hosts/electron/browser-entry.ts', 'utf8');

    const exposed = new Set(found(preload, /exposeInMainWorld\('([^']+)'/g));
    const wanted = found(entry, /^\s{4}(\w+)\?:/gm);

    const missing = wanted.filter((name) => !exposed.has(name));

    assert.deepEqual(missing, []);
  });
});
