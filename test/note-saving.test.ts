import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planSave } from '../src/notes/note-saving.ts';

/** Records whether the plan needed to read the old text, which is the costly part. */
function context(previous = '', kept: string | null = null) {
  const asked = { names: 0, text: 0 };
  return {
    asked,
    newName: async (text: string) => {
      asked.names += 1;
      return `named from ${text.split('\n')[0] ?? ''}`;
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
    const world = context();
    assert.deepEqual(await planSave(null, '   \n\n', world), { kind: 'none' });
    assert.equal(world.asked.names, 0);
  });

  it('asks for a name only for a new note', async () => {
    const world = context();
    assert.deepEqual(await planSave(null, 'O zimi\n\nTekst.', world), {
      kind: 'write',
      id: 'named from O zimi',
    });
    assert.equal(world.asked.names, 1);
  });

  it('writes in place while his opening lines are unchanged', async () => {
    assert.deepEqual(await planSave('O zimi', 'O zimi\n\nDrugi tekst.', context()), {
      kind: 'write',
      id: 'O zimi',
    });
  });

  it('writes in place when he rewrites his opening lines, since nothing is renamed', async () => {
    const world = context('O zimi\n\nPuno teksta ovdje, dovoljno dugo.');

    assert.deepEqual(await planSave('O zimi', 'O ljetu\n\nPuno teksta ovdje, dovoljno.', world), {
      kind: 'write',
      id: 'O zimi',
    });
    assert.equal(world.asked.names, 0);
  });

  it('reads the old text once, however many questions want it', async () => {
    const world = context('O zimi\n\nPrvi tekst.');

    await planSave('O zimi', 'O zimi\n\nDrugi tekst.', world);

    assert.equal(world.asked.text, 1);
  });

  it('keeps the essay when it is replaced by a keystroke', async () => {
    // The failure the whole thing exists for: select all, then type.
    const essay = 'x'.repeat(20000);
    const world = context(essay);

    assert.deepEqual(await planSave('Dugačak esej', 'y', world), {
      kind: 'write',
      id: 'Dugačak esej',
      snapshot: essay,
    });
  });

  it('keeps what was there before he empties a note, which is how he deletes', async () => {
    const world = context('O zimi\n\nTekst koji je nekad bio ovdje.');

    assert.deepEqual(await planSave('O zimi', '', world), {
      kind: 'write',
      id: 'O zimi',
      snapshot: 'O zimi\n\nTekst koji je nekad bio ovdje.',
    });
  });

  it('keeps nothing when there was nothing there to begin with', async () => {
    assert.deepEqual(await planSave('Bez naslova', '', context('')), {
      kind: 'write',
      id: 'Bez naslova',
    });
  });

  it('treats whitespace as emptying, because that is what it looks like to him', async () => {
    const action = await planSave('O zimi', '   \n\n  ', context('O zimi\n\nTekst.'));

    assert.equal(action.kind === 'write' && action.snapshot, 'O zimi\n\nTekst.');
  });
});
