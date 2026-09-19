import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deletedIdFor, planSave } from '../src/notes/note-saving.ts';

/** Records whether the plan needed to read the old text, which is the costly part. */
function context(taken: string[] = [], previous = '', kept: string | null = null) {
  const asked = { ids: 0, text: 0 };
  return {
    asked,
    takenIds: async () => {
      asked.ids += 1;
      return new Set(taken);
    },
    previousText: async () => {
      asked.text += 1;
      return previous;
    },
    lastKept: async () => kept,
  };
}

describe('planSave', () => {
  it('creates nothing for a new note he left blank', async () => {
    assert.deepEqual(await planSave(null, '   \n\n', context()), { kind: 'none' });
  });

  it('names a new note after his opening lines, with no extension', async () => {
    assert.deepEqual(await planSave(null, 'O zimi\n\nTekst.', context()), {
      kind: 'write',
      id: 'O zimi',
    });
  });

  it('gives a new note a free id when that one is taken', async () => {
    assert.deepEqual(await planSave(null, 'O zimi\n\nDrugi.', context(['O zimi'])), {
      kind: 'write',
      id: 'O zimi (1)',
    });
  });

  it('treats an existing .md as holding the id, since both are one name', async () => {
    // A file called `Esej o zimi.md` reaches here as the id `Esej o zimi`, so a
    // new note opening the same way has to take the next one.
    assert.deepEqual(await planSave(null, 'Esej o zimi\n\nDrugi.', context(['Esej o zimi'])), {
      kind: 'write',
      id: 'Esej o zimi (1)',
    });
  });

  it('writes in place while his opening lines are unchanged', async () => {
    assert.deepEqual(await planSave('O zimi', 'O zimi\n\nDrugi tekst.', context()), {
      kind: 'write',
      id: 'O zimi',
    });
  });

  it('reads the old text once, however many questions want it', async () => {
    // It used to skip the read on an ordinary save. It cannot now — how much of
    // the old text is about to go is the question — so what matters instead is
    // that a save never goes to disk for it twice.
    const world = context([], 'O zimi\n\nPrvi tekst.');

    await planSave('O zimi', 'O zimi\n\nDrugi tekst.', world);

    assert.equal(world.asked.text, 1);
  });

  it('renames when he rewrites his opening lines', async () => {
    const world = context([], 'O zimi\n\nPuno teksta ovdje, dovoljno dugo.');

    assert.deepEqual(await planSave('O zimi', 'O ljetu\n\nPuno teksta ovdje, dovoljno.', world), {
      kind: 'writeAndRename',
      id: 'O zimi',
      to: 'O ljetu',
    });
  });

  it('still renames when he merely trims a sentence away', async () => {
    const world = context([], 'foo bar a lot whatever');

    const action = await planSave('foo bar a lot whatever', 'whatever', world);

    assert.equal(action.kind, 'writeAndRename');
  });

  it('keeps the id when an essay is replaced by a keystroke, and keeps the essay', async () => {
    // The failure the whole thing exists for: select all, then type.
    const essay = 'x'.repeat(20000);
    const world = context([], essay);

    assert.deepEqual(await planSave('Dugačak esej', 'y', world), {
      kind: 'write',
      id: 'Dugačak esej',
      snapshot: essay,
    });
  });

  it('keeps the id when he empties a note, which is how he deletes', async () => {
    const world = context([], 'O zimi\n\nTekst koji je nekad bio ovdje.');

    assert.deepEqual(await planSave('O zimi', '', world), {
      kind: 'write',
      id: 'O zimi',
      snapshot: 'O zimi\n\nTekst koji je nekad bio ovdje.',
    });
  });

  it('keeps what was there before an emptying lands', async () => {
    const world = context([], 'O zimi\n\nSve što je napisao.');

    const action = await planSave('O zimi', '', world);

    assert.equal(action.kind === 'write' && action.snapshot, 'O zimi\n\nSve što je napisao.');
  });

  it('keeps nothing when there was nothing there to begin with', async () => {
    const world = context([], '');

    assert.deepEqual(await planSave('Bez naslova', '', world), {
      kind: 'write',
      id: 'Bez naslova',
    });
  });

  it('treats whitespace as emptying, because that is what it looks like to him', async () => {
    const world = context([], 'O zimi\n\nTekst.');

    const action = await planSave('O zimi', '   \n\n  ', world);

    assert.equal(action.kind === 'write' && action.snapshot, 'O zimi\n\nTekst.');
  });

  it('keeps the text of a note he never titled, which the name would not notice', async () => {
    // An untitled note is already called "Bez naslova", and emptying it leaves
    // the name unchanged — so the shortcut that skips reading the old text must
    // not get there first.
    const world = context([], 'Bez naslova\n\nNešto je ipak napisao.');

    const action = await planSave('Bez naslova', '', world);

    assert.equal(action.kind === 'write' && action.snapshot, 'Bez naslova\n\nNešto je ipak napisao.');
  });

  it('does not let the disambiguating suffix accumulate', async () => {
    const world = context(['O zimi', 'O zimi (1)']);

    assert.deepEqual(await planSave('O zimi (1)', 'O zimi\n\nIzmijenjeno.', world), {
      kind: 'write',
      id: 'O zimi (1)',
    });
  });
});

describe('deletedIdFor', () => {
  it('keeps the name the note had', () => {
    assert.equal(deletedIdFor('O zimi', new Set()), 'O zimi');
  });

  it('never overwrites a note already put away under that name', () => {
    assert.equal(deletedIdFor('O zimi', new Set(['O zimi'])), 'O zimi (1)');
  });
});
