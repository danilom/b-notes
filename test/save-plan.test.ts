import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deletedNameFor, planSave } from '../src/shared/save-plan.ts';

/** Records whether the plan actually needed to look anything up. */
function context(taken: string[] = [], previous = '') {
  const asked = { names: 0, text: 0 };
  return {
    asked,
    takenNames: async () => {
      asked.names += 1;
      return new Set(taken);
    },
    previousText: async () => {
      asked.text += 1;
      return previous;
    },
  };
}

describe('planSave', () => {
  it('creates nothing for a new note he left blank', async () => {
    assert.deepEqual(await planSave(null, '   \n\n', context()), { kind: 'none' });
  });

  it('names a new note after his opening lines', async () => {
    assert.deepEqual(await planSave(null, 'O zimi\n\nTekst.', context()), {
      kind: 'write',
      id: 'O zimi.txt',
    });
  });

  it('gives a new note a free name when that one is taken', async () => {
    assert.deepEqual(await planSave(null, 'O zimi\n\nDrugi.', context(['O zimi.txt'])), {
      kind: 'write',
      id: 'O zimi (1).txt',
    });
  });

  it('writes in place while his opening lines are unchanged', async () => {
    assert.deepEqual(await planSave('O zimi.txt', 'O zimi\n\nDrugi tekst.', context()), {
      kind: 'write',
      id: 'O zimi.txt',
    });
  });

  it('asks the store for nothing on that ordinary save', async () => {
    const world = context();

    await planSave('O zimi.txt', 'O zimi\n\nDrugi tekst.', world);

    assert.deepEqual(world.asked, { names: 0, text: 0 });
  });

  it('renames when he rewrites his opening lines', async () => {
    const world = context([], 'O zimi\n\nPuno teksta ovdje, dovoljno dugo.');

    assert.deepEqual(await planSave('O zimi.txt', 'O ljetu\n\nPuno teksta ovdje, dovoljno.', world), {
      kind: 'writeAndRename',
      id: 'O zimi.txt',
      to: 'O ljetu.txt',
    });
  });

  it('still renames when he merely trims a sentence away', async () => {
    const world = context([], 'foo bar a lot whatever');

    const action = await planSave('foo bar a lot whatever.txt', 'whatever', world);

    assert.equal(action.kind, 'writeAndRename');
  });

  it('keeps the name when an essay is replaced by a keystroke', async () => {
    const world = context([], 'x'.repeat(20000));

    assert.deepEqual(await planSave('Dugačak esej.txt', 'y', world), {
      kind: 'write',
      id: 'Dugačak esej.txt',
    });
  });

  it('keeps the name when he empties a note, which is how he deletes', async () => {
    const world = context([], 'O zimi\n\nTekst koji je nekad bio ovdje.');

    assert.deepEqual(await planSave('O zimi.txt', '', world), {
      kind: 'write',
      id: 'O zimi.txt',
    });
  });

  it('does not let the disambiguating suffix accumulate', async () => {
    const world = context(['O zimi.txt', 'O zimi (1).txt']);

    assert.deepEqual(await planSave('O zimi (1).txt', 'O zimi\n\nIzmijenjeno.', world), {
      kind: 'write',
      id: 'O zimi (1).txt',
    });
  });
});

describe('deletedNameFor', () => {
  it('keeps the name the note had', () => {
    assert.equal(deletedNameFor('O zimi.txt', new Set()), 'O zimi.txt');
  });

  it('never overwrites a deleted note of the same name', () => {
    assert.equal(deletedNameFor('O zimi.txt', new Set(['O zimi.txt'])), 'O zimi (1).txt');
  });
});
