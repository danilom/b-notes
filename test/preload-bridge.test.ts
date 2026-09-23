import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * The seam between the two Electron processes, read as text.
 *
 * Nothing else can check it. The renderer calls `ipcRenderer.invoke` with a
 * channel name, the main process answers channel names, and a name on one side
 * with nobody on the other is a string that matches nothing — no type says so,
 * and neither half fails to compile. What fails is the app, at the moment he
 * opens it, with a message about his writing.
 *
 * That is not hypothetical. `listFolders` was added to the filesystem for
 * Arhiva; the disk and the mock grew it, this bridge did not, and the installed
 * app greeted him with "Ne mogu da naći tvoje tekstove" for a fault that had
 * nothing to do with his texts.
 *
 * The preload's object is annotated `FileSystem` now, so a missing *method* is
 * caught by the compiler. What is left, and what this covers, is the channel
 * names either side of it.
 */

const PRELOAD = 'src/hosts/electron/preload-bridge.ts';
const MAIN = 'src/hosts/electron/electron-main.ts';

const found = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((match) => match[1] ?? '');

describe('the bridge between the window and the main process', () => {
  it('has someone at the other end of every channel it calls', async () => {
    const preload = await readFile(PRELOAD, 'utf8');
    const main = await readFile(MAIN, 'utf8');

    const asked = new Set(found(preload, /ipcRenderer\.(?:invoke|send)\('([^']+)'/g));
    const answered = new Set(found(main, /handle\('([^']+)'|ipcMain\.on\('([^']+)'/g));
    // `log:write` is answered by a plain listener rather than a handler, since
    // nothing waits for a log line to be written.
    const listened = new Set(found(main, /ipcMain\.on\('([^']+)'/g));

    const unanswered = [...asked].filter((name) => !answered.has(name) && !listened.has(name));

    assert.deepEqual(unanswered, []);
  });

  it('is asked for everything it answers', async () => {
    // The other way round, which costs nothing to check and catches a channel
    // left behind after whatever used it was taken out.
    const preload = await readFile(PRELOAD, 'utf8');
    const main = await readFile(MAIN, 'utf8');

    const asked = new Set(found(preload, /ipcRenderer\.(?:invoke|send)\('([^']+)'/g));
    const answered = found(main, /handle\('([^']+)'/g);

    const unasked = answered.filter((name) => !asked.has(name));

    assert.deepEqual(unasked, []);
  });

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
