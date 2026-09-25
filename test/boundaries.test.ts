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
const HOSTS = ['hosts/electron', 'hosts/mockup'];

/** Every import of something under `ui/`, with the names taken from it. */
async function reachesIntoUi(
  folder: string,
): Promise<{ file: string; from: string; names: string[] }[]> {
  const found: { file: string; from: string; names: string[] }[] = [];
  for (const file of await sourceFiles(folder)) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|\S+)\s+from\s+'([^']*\/ui\/[^']*)'/g)) {
      found.push({
        file,
        from: match[2] ?? '',
        names: (match[1] ?? '')
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name.length > 0),
      });
    }
  }
  return found;
}

const PRELOAD = path.join(SOURCE, 'hosts/electron/preload-bridge.ts');
const MAIN = path.join(SOURCE, 'hosts/electron/electron-main.ts');

/** Every channel name one side of the bridge mentions, in the given call. */
async function channelsIn(file: string, call: RegExp): Promise<string[]> {
  const text = await readFile(file, 'utf8');
  // Unique: logging is three calls against one listener, which is a fact about
  // levels rather than the two sides disagreeing.
  return [...new Set([...text.matchAll(call)].map((match) => match[1] ?? ''))].sort();
}

/**
 * The two processes agree on a list of strings and nothing checks it. A channel
 * renamed on one side only still compiles, still builds, and still passes every
 * test here — they all reach the filesystem directly. It fails in the packaged
 * app, as a text that will not save or will not delete.
 */
describe('what the two processes say to each other', () => {
  it('asks the main process for nothing it does not answer', async () => {
    assert.deepEqual(
      await channelsIn(PRELOAD, /ipcRenderer\.invoke\('([^']+)'/g),
      await channelsIn(MAIN, /(?<!ipcMain\.)handle\('([^']+)'/g),
    );
  });

  // `once` as well as `on`: the reply that lets a held-open window finally
  // close is wanted one time and then never again.
  it('tells it nothing it is not listening for', async () => {
    assert.deepEqual(
      await channelsIn(PRELOAD, /ipcRenderer\.send\('([^']+)'/g),
      await channelsIn(MAIN, /ipcMain\.(?:on|once)\('([^']+)'/g),
    );
  });

  /*
    And the other way, which until the close flush did not exist: every channel
    here ran window to main. A `webContents.send` nobody is listening for is
    silence — and the one that matters holds the window open waiting for a
    reply that would never come.
  */
  it('is heard when it speaks to the window', async () => {
    assert.deepEqual(
      await channelsIn(MAIN, /webContents\.send\('([^']+)'/g),
      await channelsIn(PRELOAD, /ipcRenderer\.(?:on|once)\('([^']+)'/g),
    );
  });
});

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

  /*
    A filename here is built from his opening line, so it moves the moment he
    rewrites his first sentence, and again when another text of the same name
    arrives and takes the bare one. Everything that went wrong with saving came
    from somewhere outside these files holding one of those names as if it were
    a name for the text: a failure remembered under a filename, a count guarded
    by comparing a handle against one, a list read past `writing` so no text
    had a handle at all.

    So the interface is allowed `writing`, the handle, and what a note is. The
    naming, the numbering of same-named texts, the store and the planning of a
    save are not its business, and the compiler cannot say so.
  */
  const NAMING = /note-store|note-naming|note-saving/;

  /*
    One exception, and it is the seam itself. `session.json` is the only place
    a name outlives a run, so reading it back is the one moment the interface
    holds a filename that came from outside — and a value read off disk is
    checked before it is believed. `note-title` is not on the list: a title
    made from his own text is what the interface shows him, not where a file
    lives.
  */
  const ALLOWED = 'app-session.ts';

  it('keeps how a text is named out of the interface', async () => {
    const reaching = (await offenders('ui', NAMING)).filter(
      (offence) => !offence.includes(ALLOWED),
    );

    assert.deepEqual(reaching, []);
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
   *
   * One exception, named rather than smuggled past. The samples are test data,
   * not host behaviour: they fabricate files the app would otherwise have
   * written, so they have to be named the way the app names them — and
   * importing that rule is the opposite of the second home for it that this
   * test exists to prevent. It is one file, and the samples themselves are
   * content that knows no paths, so this cannot spread quietly.
   */
  const FIXTURE = 'mock-sample-files.ts';

  for (const host of ['hosts/electron', 'hosts/mockup']) {
    it(`keeps what a note is out of ${host}`, async () => {
      const reaching = (await offenders(host, /notes\//)).filter(
        (offence) => !offence.includes(FIXTURE),
      );

      assert.deepEqual(reaching, []);
    });
  }

  /**
   * The app is handed a Host and reaches for nothing else. A capability taken
   * off `window` instead would be one the other host never has to answer for,
   * which is how the mock came to lack rules the real store had.
   */
  for (const folder of PORTABLE) {
    it(`makes ${folder} take host capabilities from the Host, not from window`, async () => {
      const reaching: string[] = [];
      for (const file of await sourceFiles(folder)) {
        const text = await readFile(file, 'utf8');
        for (const capability of ['window.files', 'window.log']) {
          if (text.includes(capability)) reaching.push(`${file} uses ${capability}`);
        }
      }
      assert.deepEqual(reaching, []);
    });
  }

  it('lets a host start the interface, which is what a host is for', async () => {
    for (const host of HOSTS) {
      const entry = await importsIn(path.join(SOURCE, host, 'browser-entry.ts'));
      assert.ok(
        entry.some((specifier) => specifier.includes('ui/ui-app')),
        host,
      );
    }
  });

  /**
   * A host is the composition root: it assembles capabilities and opens one
   * door. Reaching further into the interface — at the list, at the editor —
   * would make it a second place the interface is wired together, which is the
   * thing this whole arrangement exists to prevent.
   */
  it('gives hosts one door into the interface and no more', async () => {
    for (const host of HOSTS) {
      for (const used of await reachesIntoUi(host)) {
        assert.equal(used.from.endsWith('/ui/ui-app.ts'), true, `${used.file} imports ${used.from}`);
        assert.deepEqual(used.names, ['startApp'], used.file);
      }
    }
  });
});

