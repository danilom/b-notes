import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DeletedNote, Note } from '../src/notes/note.ts';
import {
  confirmationForDeleting,
  confirmationForDestroying,
  mustWriteItOut,
} from '../src/ui/note-confirmations.ts';

const noteOf = (title: string, text: string): Note => ({
  id: title,
  title,
  text,
  searchable: text.toLowerCase(),
  updatedAt: 0,
  bytes: text.length,
});

const putAway = (title: string, text: string, versions = 0): DeletedNote => ({
  ...noteOf(title, text),
  versions,
});

const LONG = 'rec '.repeat(200);

describe('what he is told before a text is put away', () => {
  it('names the action and the text, since the header is where the question is', () => {
    const asked = confirmationForDeleting(noteOf('O zimi', 'O zimi\n\nTekst.'), 'sr');

    assert.deepEqual(asked.title, { label: 'Obriši tekst', name: 'O zimi' });
    assert.equal(asked.confirm, 'Obriši');
  });

  it('promises he can bring it back', () => {
    const asked = confirmationForDeleting(noteOf('O zimi', 'O zimi\n\nTekst.'), 'sr');

    assert.match(asked.body, /vratiti/);
  });

  it('promises nothing about a text with nothing in it', () => {
    // The one text the promise might not hold for, since nothing is kept of it.
    const asked = confirmationForDeleting(noteOf('', '   '), 'sr');

    assert.equal(asked.body, 'U ovom tekstu nema ništa.');
  });

  it('calls a text with no title what the list calls it', () => {
    const asked = confirmationForDeleting(noteOf('', ''), 'sr');

    assert.deepEqual(asked.title, { label: 'Obriši tekst', name: 'Bez naslova' });
  });

  it('never asks him to write anything out, because it can be undone', () => {
    const asked = confirmationForDeleting(noteOf('O zimi', LONG), 'sr');

    assert.equal(asked.phrase, undefined);
    assert.notEqual(asked.danger, true);
  });
});

describe('what he is told before a text is destroyed', () => {
  it('is marked as the dangerous one, whatever is in it', () => {
    const asked = confirmationForDestroying(putAway('O zimi', 'kratko'), 'sr');

    assert.equal(asked.danger, true);
    assert.equal(asked.confirm, 'Uništi zauvek');
  });

  it('asks a plain yes or no for a jotting', () => {
    // A pile of empty ones has to be clearable, or he lives with the pile.
    const asked = confirmationForDestroying(putAway('Kupiti hleb', 'Kupiti hleb.'), 'sr');

    assert.equal(asked.phrase, undefined);
  });

  it('asks for the word when there is something to lose', () => {
    const asked = confirmationForDestroying(putAway('Naslov', LONG), 'sr');

    assert.notEqual(asked.phrase, undefined);
  });

  it('says the copies go too, when there are copies', () => {
    const asked = confirmationForDestroying(putAway('O zimi', 'kratko', 2), 'sr');

    assert.match(asked.body, /ranijim verzijama/);
  });

  it('says only the text goes, when there are none', () => {
    const asked = confirmationForDestroying(putAway('O zimi', 'kratko'), 'sr');

    assert.equal(asked.body, 'Ovaj tekst se uništava zauvek. Ne može se vratiti.');
  });

  it('offers both spellings of the word', () => {
    const asked = confirmationForDestroying(putAway('Naslov', LONG), 'sr');

    assert.deepEqual(asked.phrase?.words, ['uništi', 'unisti']);
  });

  /*
    The wiring, which is the part nothing watched before. mustWriteItOut was
    covered on its own, and the question it is meant to decide was assembled
    somewhere else — so the two could have come apart and every test would have
    stayed green while the gate quietly stopped asking.
  */
  for (const [what, note] of [
    ['a jotting', putAway('Kratko', 'kratko')],
    ['something he sat down to write', putAway('Naslov', LONG)],
    ['a short one with a copy kept', putAway('Kratko', 'kratko', 1)],
    ['an empty one with a copy kept', putAway('', '', 1)],
    ['an empty one with nothing kept', putAway('', '')],
  ] as const) {
    it(`asks for the word for ${what} exactly when the rule says to`, () => {
      const asked = confirmationForDestroying(note, 'sr');

      assert.equal(asked.phrase !== undefined, mustWriteItOut(note), what);
    });
  }
});
