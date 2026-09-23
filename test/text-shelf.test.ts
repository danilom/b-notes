import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { snippetOf } from '../src/ui/text-shelf.ts';
import { mustWriteItOut } from '../src/ui/note-confirmations.ts';

const noteOf = (text: string, title: string, versions = 0) => ({
  id: title,
  title,
  text,
  searchable: text.toLowerCase(),
  updatedAt: 0,
  bytes: text.length,
  versions,
});

describe('the line under a text on a shelf', () => {
  it('leaves out the title, which is already on the row above it', () => {
    const note = noteOf('O zimi\n\nPada sneg nad gradom.', 'O zimi');

    assert.equal(snippetOf(note), 'Pada sneg nad gradom.');
  });

  it('flattens his paragraphs onto the one line it has', () => {
    const note = noteOf('O zimi\n\nPrvi red.\n\n\nDrugi red.', 'O zimi');

    assert.equal(snippetOf(note), 'Prvi red. Drugi red.');
  });

  it('is empty for a text he emptied, rather than showing the title twice', () => {
    const note = noteOf('', '');

    assert.equal(snippetOf(note), '');
  });

  it('bounds a long opening rather than putting a whole essay in a row', () => {
    // A bound on what reaches the row, not on what shows in it: the row clamps
    // to two lines, and how many characters that is depends on the width of his
    // window and the size he has set his type to.
    const note = noteOf(`Naslov

${'rec '.repeat(200)}`, 'Naslov');

    const snippet = snippetOf(note);
    assert.ok(snippet.length < 340, `snippet was ${snippet.length} characters`);
    assert.ok(snippet.endsWith('…'), 'a cut snippet says it was cut');
  });
});

describe('how hard it should be to destroy one', () => {
  it('asks a plain question for a jotting', () => {
    assert.equal(mustWriteItOut(noteOf('Kupiti hleb.', 'Kupiti hleb.')), false);
  });

  it('asks him to write the word out for something he sat down to write', () => {
    assert.equal(mustWriteItOut(noteOf('rec '.repeat(200), 'Naslov')), true);
  });

  it('asks for the word even when the file is empty, if a copy was kept', () => {
    /*
      The case the rule exists for. A text he emptied before deleting is zero
      bytes with everything he wrote sitting beside it, so its length is the
      one measure that says nothing about what destroying it would cost.
    */
    assert.equal(mustWriteItOut(noteOf('', '', 1)), true);
  });

  it('asks a plain question for an empty one that never had a copy', () => {
    assert.equal(mustWriteItOut(noteOf('', '')), false);
  });
});
