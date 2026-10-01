import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groupsFor, openingFilter, snippetOf } from '../src/ui/deleted-and-archived/text-shelf.ts';
import { mustWriteItOut } from '../src/ui/deleted-and-archived/note-confirmations.ts';
import { toSearchable } from '../src/language/diacritics.ts';

const noteOf = (text: string, title: string, versions = 0) => ({
  id: title,
  title,
  sortTitle: title,
  rank: 0 as const,
  text,
  searchable: text.toLowerCase(),
  code: null,
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


type Shelved = ReturnType<typeof shelved>;

const shelved = (title: string, text: string, updatedAt: number, code: string | null = null) => ({
  id: title,
  title: title.trim(),
  sortTitle: title,
  text,
  searchable: toSearchable(text),
  code,
  updatedAt,
});

const SOME = [
  shelved('Zima', 'Zima' + '\n\n' + 'Pada sneg nad gradom.', 1000),
  shelved('More', 'More' + '\n\n' + 'Kamen i so.', 3000),
  shelved('Sneg', 'Sneg' + '\n\n' + 'Opet sneg.', 2000),
];

/** What a search found and missed, as titles; fails where it was no search. */
function searched(texts: readonly Shelved[], filter: string) {
  const groups = groupsFor(texts, filter);
  if (!groups.searched) throw new Error('not searched');
  const titles = (found: readonly Shelved[]) => found.map((note) => note.title);
  const { inTitle, inText, asPart } = groups.found;
  return { inTitle: titles(inTitle), inText: titles(inText), asPart: titles(asPart), rest: titles(groups.rest) };
}

describe('what a search does to a shelf', () => {
  it('lists everything newest first while he has typed nothing', () => {
    const groups = groupsFor(SOME, ' ');
    assert.equal(groups.searched, false);
    assert.deepEqual(!groups.searched && groups.all.map((note) => note.title), ['More', 'Sneg', 'Zima']);
  });

  it('puts what it found in the groups his list uses, and leaves the rest under them', () => {
    assert.deepEqual(searched(SOME, 'sneg'), { inTitle: ['Sneg'], inText: ['Zima'], asPart: [], rest: ['More'] });
  });

  it('ranks within a group as his list does: a text full of the word before one that names it once', () => {
    const texts = [
      shelved('Jednom', 'Jednom' + '\n\n' + 'Bio je Ivo.', 3000),
      shelved('Cesto', 'Cesto' + '\n\n' + 'Ivo. Ivo. Ivo. Ivo. Ivo.', 1000),
    ];
    assert.deepEqual(searched(texts, 'ivo').inText, ['Cesto', 'Jednom']);
  });

  it('puts none first for being recent, since nothing on a shelf is what he is working on', () => {
    const texts = [
      shelved('Jednom', 'Jednom' + '\n\n' + 'Bio je Ivo.', Date.now()),
      shelved('Cesto', 'Cesto' + '\n\n' + 'Ivo. Ivo. Ivo. Ivo. Ivo.', 1000),
    ];
    assert.deepEqual(searched(texts, 'ivo').inText, ['Cesto', 'Jednom']);
  });

  it('breaks a tie by his order, where leading spaces rank a title, not by date', () => {
    const texts = [shelved('Sneg u gradu', 'Sneg u gradu', 3000), shelved('  Sneg u selu', '  Sneg u selu', 1000)];
    assert.deepEqual(searched(texts, 'sneg').inTitle, ['Sneg u selu', 'Sneg u gradu']);
  });

  it('leaves what it missed newest first, as the shelf is listed', () => {
    // Avala comes first in his order and last by date.
    const texts = [...SOME, shelved('Avala', 'Avala' + '\n\n' + 'Planina.', 500)];
    assert.deepEqual(searched(texts, 'sneg').rest, ['More', 'Avala']);
  });

  it('keeps every text in exactly one place, found or not', () => {
    // Nothing is taken away: a row that goes when he types reads as a text
    // that has gone, which in a shelf reads as the shelf being incomplete.
    const texts = [...SOME, shelved('Snegovi', 'Snegovi', 500), shelved('Pesak', 'Pesak' + '\n\n' + 'Usnegovan.', 400)];
    const { inTitle, inText, asPart, rest } = searched(texts, 'sneg');
    const everywhere = [...inTitle, ...inText, ...asPart, ...rest];
    assert.deepEqual([...everywhere].sort(), texts.map((note) => note.title).sort());
  });

  it('pushes everything down when nothing matches at all', () => {
    assert.deepEqual(searched(SOME, 'nepostojeće'), { inTitle: [], inText: [], asPart: [], rest: ['More', 'Sneg', 'Zima'] });
  });

  it('finds a text by the code in its name, as his list does', () => {
    const texts = [shelved('Pismo', 'Pismo' + '\n\n' + 'Draga.', 1, 'K3F9A2')];
    assert.deepEqual(searched(texts, 'k3f9').inTitle, ['Pismo']);
  });

  it('finds his writing whether or not either side has the accents', () => {
    const accented = [shelved('Mačka', 'Mačka je na krovu', 1)];
    assert.deepEqual(searched(accented, 'macka').inTitle, ['Mačka']);
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
