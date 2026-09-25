import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groupsFor, openingFilter, snippetOf } from '../src/ui/elsewhere/text-shelf.ts';
import { mustWriteItOut } from '../src/ui/elsewhere/note-confirmations.ts';
import { toSearchable } from '../src/language/diacritics.ts';

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


const shelved = (title: string, text: string, updatedAt: number) => ({
  id: title,
  title,
  text,
  searchable: toSearchable(text),
  updatedAt,
});

const SOME = [
  shelved('Zima', 'Zima' + '\n\n' + 'Pada sneg nad gradom.', 1000),
  shelved('More', 'More' + '\n\n' + 'Kamen i so.', 3000),
  shelved('Sneg', 'Sneg' + '\n\n' + 'Opet sneg.', 2000),
];

describe('what a search does to a shelf', () => {
  it('puts everything in one group while he has typed nothing', () => {
    const { found, rest } = groupsFor(SOME, '');
    assert.deepEqual(found.map((n) => n.title), ['More', 'Sneg', 'Zima']);
    assert.deepEqual(rest, []);
  });

  it('orders both groups newest first, whatever order it was handed', () => {
    const { found, rest } = groupsFor(SOME, 'sneg');
    assert.deepEqual(found.map((n) => n.title), ['Sneg', 'Zima']);
    assert.deepEqual(rest.map((n) => n.title), ['More']);
  });

  it('keeps every text in one group or the other, never in neither', () => {
    // Nothing is taken away: a row that goes when he types reads as a text
    // that has gone, which in a shelf reads as the shelf being incomplete.
    const { found, rest } = groupsFor(SOME, 'sneg');
    assert.equal(found.length + rest.length, SOME.length);
  });

  it('never shows a text in both groups', () => {
    const { found, rest } = groupsFor(SOME, 'sneg');
    const twice = found.filter((note) => rest.includes(note));
    assert.deepEqual(twice, []);
  });

  it('pushes everything down when nothing matches at all', () => {
    const { found, rest } = groupsFor(SOME, 'nepostojeće');
    assert.deepEqual(found, []);
    assert.equal(rest.length, SOME.length);
  });

  it('finds his writing whether or not either side has the accents', () => {
    const accented = [shelved('Mačka', 'Mačka je na krovu', 1)];
    assert.equal(groupsFor(accented, 'macka').found.length, 1);
  });
});

describe('what a shelf is filtered by when it opens', () => {
  it('keeps what the strip outside already searched for', () => {
    // Obrisani tekstovi is in memory, so the strip said how many match before
    // he clicked. Arriving unfiltered would make him type it again.
    assert.equal(openingFilter(false, 'zima'), 'zima');
  });

  it('shows all of a shelf that has its own box, whatever he typed outside', () => {
    // Nothing outside could search the archive, so two rows of ten with no
    // explanation would read as eight of them missing.
    assert.equal(openingFilter(true, 'zima'), '');
  });
});
