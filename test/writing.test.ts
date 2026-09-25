import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import type { FileSystem } from '../src/platform/file-system.ts';
import { type Timers, createWriting } from '../src/notes/writing.ts';
import { silentLog } from './silent-log.ts';

/**
 * When his writing reaches disk, and what happens when it cannot.
 *
 * All of this lived in the interface and could only be reached by driving a
 * browser, which is why three of its tests passed for the wrong reason before
 * anyone noticed. Here time is held still and every ordering is a line.
 */

/** Time that only moves when a test says so. */
function fakeTimers(): Timers & { tick: (ms: number) => Promise<void> } {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; run: () => void }>();

  return {
    set(run, ms) {
      const id = next++;
      due.set(id, { at: now + ms, run });
      return id;
    },
    clear(timer) {
      if (typeof timer === 'number') due.delete(timer);
    },
    async tick(ms) {
      now += ms;
      for (const [id, timer] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue;
        due.delete(id);
        timer.run();
        // Let whatever the timer started run to completion before the next.
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
}

/** A filesystem that refuses the next writes, the way a held file does. */
function refusable(
  real: FileSystem,
): FileSystem & { refuse: (count: number) => void; duringWrite: (run: () => void) => void } {
  let refusals = 0;
  let during: (() => void) | null = null;
  return {
    ...real,
    refuse(count: number) {
      refusals = count;
    },
    /** Run once, inside the next write — the only way to reach what happens mid-flight. */
    duringWrite(run: () => void) {
      during = run;
    },
    async write(at: string, text: string): Promise<void> {
      if (during !== null) {
        const now = during;
        during = null;
        now();
      }
      if (refusals > 0) {
        refusals -= 1;
        throw Object.assign(new Error(`EPERM: operation not permitted, rename '${at}'`), {
          code: 'EPERM',
        });
      }
      await real.write(at, text);
    },
  };
}

async function writingIn() {
  const folder = (await mkdtemp(path.join(tmpdir(), 'b-notes-writing-'))).replaceAll(
    String.fromCharCode(92),
    '/',
  );
  const files = refusable(createFileSystem(path.join(tmpdir(), 'b-notes-writing-staging')));
  const timers = fakeTimers();
  let changes = 0;
  const writing = createWriting(files, folder, silentLog(), () => (changes += 1), timers);
  return { writing, files, timers, folder, changes: () => changes };
}

describe('when his writing reaches disk', () => {
  it('waits for him to stop before writing anything', async () => {
    const { writing, timers } = await writingIn();
    const handle = writing.begin();

    writing.save(handle, 'Pismo\n\nPrva recenica.');
    await timers.tick(700);
    await writing.idle();

    assert.equal((await writing.list()).length, 0);
  });

  it('writes once he has stopped', async () => {
    const { writing, timers } = await writingIn();
    const handle = writing.begin();

    writing.save(handle, 'Pismo\n\nPrva recenica.');
    await timers.tick(900);
    await writing.idle();

    const notes = await writing.list();
    assert.equal(notes.length, 1);
    assert.match(notes[0]?.text ?? '', /Prva recenica\./);
  });

  it('keeps only his newest words when he goes on typing', async () => {
    // A save writes the whole text, so an older one is not work left undone.
    const { writing, timers } = await writingIn();
    const handle = writing.begin();

    writing.save(handle, 'Pismo\n\nPrva.');
    await timers.tick(400);
    await writing.idle();
    writing.save(handle, 'Pismo\n\nPrva. Druga.');
    await timers.tick(900);
    await writing.idle();

    const notes = await writing.list();
    assert.equal(notes.length, 1);
    assert.match(notes[0]?.text ?? '', /Prva\. Druga\./);
  });

  it('writes it now when asked, without waiting out the pause', async () => {
    const { writing } = await writingIn();
    const handle = writing.begin();

    writing.save(handle, 'Pismo\n\nPrva recenica.');
    await writing.flush();

    assert.equal((await writing.list()).length, 1);
  });
});

describe('a text that keeps the same name for itself', () => {
  it('is the same text after his first line changes', async () => {
    /*
      The whole reason a handle exists. The file is renamed under it, and the
      handle does not move — where before, everything holding the old name was
      quietly pointing at a file that had gone.
    */
    const { writing } = await writingIn();
    const handle = writing.begin();

    writing.save(handle, 'Pismo\n\nDragi brate');
    await writing.flush();
    const first = writing.tokenOf(handle);

    writing.save(handle, 'Esej\n\nDragi brate');
    await writing.flush();
    const second = writing.tokenOf(handle);

    assert.notEqual(first, second);
    assert.equal((await writing.list()).length, 1);
    assert.equal(writing.handleFor(second ?? ''), handle);
  });

  it('is the same text after another text takes its name', async () => {
    // The rename nobody was told about: a second `Pismo` makes the first one
    // `Pismo (1)`, and the first text never asked for anything.
    const { writing } = await writingIn();
    const first = writing.begin();
    writing.save(first, 'Pismo\n\nPrvi');
    await writing.flush();
    const wasCalled = writing.tokenOf(first);

    const second = writing.begin();
    writing.save(second, 'Pismo\n\nDrugi');
    await writing.flush();

    assert.notEqual(writing.tokenOf(first), wasCalled);
    assert.equal(writing.handleFor(writing.tokenOf(first) ?? ''), first);
    assert.equal((await writing.list()).length, 2);
  });
});

describe('a save that will not go through', () => {
  it('says nothing about the first failure, which is the ordinary one', async () => {
    const { writing, files, timers } = await writingIn();
    const handle = writing.begin();
    files.refuse(1);

    writing.save(handle, 'Pismo\n\nPrva.');
    await timers.tick(900);
    await writing.idle();

    assert.equal(writing.stateOf(handle).failures, 1);
    assert.equal(writing.stateOf(handle).waiting, true);
  });

  it('gets it written by a later attempt, with nothing lost', async () => {
    const { writing, files, timers } = await writingIn();
    const handle = writing.begin();
    files.refuse(2);

    writing.save(handle, 'Pismo\n\nPrva.');
    await timers.tick(900);
    await writing.idle();
    await timers.tick(1100);
    await writing.idle();
    await timers.tick(3100);
    await writing.idle();

    assert.equal(writing.stateOf(handle).waiting, false);
    assert.match((await writing.list())[0]?.text ?? '', /Prva\./);
  });

  it('never puts back words he has already replaced', async () => {
    /*
      The way this loses writing. A save fails and its text waits; he goes on
      typing and the next save succeeds with what he has now; the attempt still
      waiting must not wake and write what he had then.
    */
    const { writing, files, timers } = await writingIn();
    const handle = writing.begin();
    files.refuse(1);

    writing.save(handle, 'Pismo\n\nPrva.');
    await timers.tick(900);
    await writing.idle();

    writing.save(handle, 'Pismo\n\nPrva. Druga.');
    await timers.tick(900);
    await writing.idle();
    await timers.tick(60_000);
    await writing.idle();

    assert.match((await writing.list())[0]?.text ?? '', /Prva\. Druga\./);
    assert.equal((await writing.list()).length, 1);
  });

  it('never puts back words that arrived while the write was running', async () => {
    /*
      The narrow way round the guard above. A write is in flight with what he
      had; he types again while it runs, so the newer words are waiting; then
      the write fails. Returning the older text to the queue at that moment
      overwrites the newer, and nothing later corrects it.
    */
    const { writing, files, timers } = await writingIn();
    const handle = writing.begin();
    files.refuse(1);
    files.duringWrite(() => writing.save(handle, 'Pismo\n\nPrva. Druga.'));

    writing.save(handle, 'Pismo\n\nPrva.');
    await timers.tick(900);
    await writing.idle();

    await timers.tick(900);
    await writing.idle();
    await timers.tick(60_000);
    await writing.idle();

    assert.match((await writing.list())[0]?.text ?? '', /Prva\. Druga\./);
  });

  it('does not drop one text because another one was written', async () => {
    const { writing, files, timers } = await writingIn();
    const left = writing.begin();
    files.refuse(1);
    writing.save(left, 'Ostavljena\n\nPrva.');
    await timers.tick(900);
    await writing.idle();

    const other = writing.begin();
    writing.save(other, 'Druga\n\nSvoja.');
    await timers.tick(900);
    await writing.idle();

    assert.equal(writing.stateOf(left).waiting, true);

    await timers.tick(60_000);
    await writing.idle();
    const texts = (await writing.list()).map((note) => note.text);
    assert.equal(texts.some((text) => text.includes('Ostavljena')), true);
    assert.equal(texts.some((text) => text.includes('Druga')), true);
  });

  it('writes everything still waiting when asked to flush', async () => {
    // Closing is the last moment any of it can be written: an attempt due in
    // thirty seconds is one that will never run.
    const { writing, files, timers } = await writingIn();
    const handle = writing.begin();
    files.refuse(1);

    writing.save(handle, 'Pismo\n\nPrva.');
    await timers.tick(900);
    await writing.idle();
    assert.equal(writing.stateOf(handle).waiting, true);

    await writing.flush();

    assert.equal(writing.stateOf(handle).waiting, false);
    assert.equal((await writing.list()).length, 1);
  });

  it('never rejects a flush, so closing cannot hang on a disk that has stopped', async () => {
    const { writing, files, timers } = await writingIn();
    const handle = writing.begin();
    files.refuse(50);

    writing.save(handle, 'Pismo\n\nPrva.');
    await timers.tick(900);
    await writing.idle();

    await assert.doesNotReject(() => writing.flush());
    assert.equal(writing.stateOf(handle).waiting, true);
  });
});

describe('the promise closing waits on', () => {
  it('does not fail because something went wrong reacting to a save', async () => {
    /*
      `changed` is the caller's own code, and it runs where closing is waiting.
      A window that would not shut because the strip could not be redrawn is
      the worst trade in the app: his words are already on disk by then.
    */
    const folder = (await mkdtemp(path.join(tmpdir(), 'b-notes-writing-'))).replaceAll(
      String.fromCharCode(92),
      '/',
    );
    const files = refusable(createFileSystem(path.join(tmpdir(), 'b-notes-writing-staging')));
    const writing = createWriting(files, folder, silentLog(), () => {
      throw new Error('the interface fell over');
    });
    const handle = writing.begin();

    writing.save(handle, 'Pismo\n\nPrva.');

    await assert.doesNotReject(() => writing.flush());
    assert.equal((await writing.list()).length, 1);
  });
});
