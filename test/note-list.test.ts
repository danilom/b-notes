import { copyNumberOf } from '../src/notes/note-naming.ts';
import type { NoteHandle } from '../src/notes/note-handle.ts';
import type { LiveNote } from '../src/notes/writing.ts';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSearchable } from '../src/language/diacritics.ts';
import type { Note } from '../src/notes/note.ts';
import { type ListView, openRowFor, sectionsFor } from '../src/ui/note-list.ts';

let minted = 0;

function note(title: string, text: string, updatedAt: number): LiveNote {
  minted += 1;
  return {
    id: title,
    title,
    text,
    searchable: toSearchable(text),
    updatedAt,
    bytes: text.length,
    handle: minted as NoteHandle,
    // These are titles with no number on them, which is what a text alone in
    // its name looks like.
    copyNumber: null,
  };
}

const NOTES = [
  note('Ponta', 'More i kamen', 3000),
  note('Zima', 'Snijeg pada', 2000),
  note('Amsterdam', 'Kanali i bicikli', 1000),
];

function view(over: Partial<ListView> = {}): ListView {
  return { notes: NOTES, query: '', openId: null, draft: null, language: 'sr', ...over };
}

const titlesIn = (sections: ReturnType<typeof sectionsFor>, heading: string) =>
  sections.find((section) => section.heading === heading)?.rows.map((row) => row.title);

describe('the list of texts', () => {
  it('shows nothing extra while he has not started a new text', () => {
    const sections = sectionsFor(view());
    assert.deepEqual(titlesIn(sections, 'Nedavni'), ['Ponta', 'Zima', 'Amsterdam']);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });

  it('keeps a started text out of the sections altogether', () => {
    const sections = sectionsFor(view({ draft: { startedAt: 9000 } }));
    assert.deepEqual(titlesIn(sections, 'Nedavni'), ['Ponta', 'Zima', 'Amsterdam']);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });

  it('gives a started text no id, so there is nothing to open', () => {
    assert.equal(openRowFor(view({ draft: { startedAt: 9000 } }))?.id, null);
  });

  it('names a started text for what it is until his own first line takes over', () => {
    assert.equal(openRowFor(view({ draft: { startedAt: 9000 } }))?.title, 'Novi tekst — bez naslova');
  });

  it('has no such row before he has started one', () => {
    assert.equal(openRowFor(view()), null);
  });

  it('leaves the text he is editing where it is, rather than lifting it out', () => {
    // He searched for a word, opened what he found, and then deleted the word.
    // It used to be pulled up to the top of the list, which moved a row out
    // from under the click that had just opened it.
    const searching = view({ query: 'kamen', openId: 'Zima' });

    assert.equal(openRowFor(searching), null);
  });

  it('keeps every text in Svi tekstovi, matched, open or neither', () => {
    // The heading says all of them, so it holds all of them. It used to hold
    // only what the search had missed, which is why clicking a dimmed row read
    // as the row disappearing: opening it took it out of the remainder and put
    // it at the top, with nothing to connect the two.
    const searching = view({ query: 'kamen', openId: 'Zima' });

    assert.deepEqual(titlesIn(sectionsFor(searching), 'Svi tekstovi'), [
      'Amsterdam',
      'Ponta',
      'Zima',
    ]);
    assert.deepEqual(titlesIn(sectionsFor(searching), 'Pronađeni'), ['Ponta']);
  });

  it('lifts nothing out for a saved text, matching or not, searching or not', () => {
    assert.equal(openRowFor(view({ query: 'kamen', openId: 'Ponta' })), null);
    assert.equal(openRowFor(view({ openId: 'Zima' })), null);
  });

  it('still shows a started text when the search matches nothing', () => {
    // It has no words in it, so it can never match — and it used to sink into
    // the dimmed remainder just as Nedavni disappeared, leaving the text he had
    // asked for nowhere he would look.
    const searching = view({ query: 'nepostojeće', draft: { startedAt: 9000 } });
    assert.notEqual(openRowFor(searching), null);
    const sections = sectionsFor(searching);
    assert.deepEqual(titlesIn(sections, 'Pronađeni'), []);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });

  it('finds his writing whether or not either side has the accents', () => {
    const accented = [
      note('Mačka', 'Mačka je na krovu', 5000),
      note('Macka', 'Macka je na krovu', 4000),
    ];
    for (const query of ['macka', 'mačka', 'MAČKA']) {
      const sections = sectionsFor({ ...view(), notes: accented, query });
      assert.deepEqual(titlesIn(sections, 'Pronađeni'), ['Mačka', 'Macka'], `for ${query}`);
    }
  });

  it('finds every spelling of a word he writes four different ways', () => {
    const spellings = ['čičak', 'cičak', 'čicak', 'cicak'];
    const notes = spellings.map((word, i) => note(word, `Ovdje je ${word} u tekstu`, 9000 - i));
    for (const query of spellings) {
      const sections = sectionsFor({ ...view(), notes, query });
      assert.equal(titlesIn(sections, 'Pronađeni')?.length, 4, `for ${query}`);
    }
  });

  it('keeps every text somewhere when nothing matches at all', () => {
    const sections = sectionsFor(view({ query: 'nepostojeće' }));
    assert.deepEqual(titlesIn(sections, 'Pronađeni'), []);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });
});

function alike(id: string, title: string, updatedAt: number): LiveNote {
  minted += 1;
  return {
    id,
    title,
    text: title,
    searchable: toSearchable(title),
    updatedAt,
    bytes: title.length,
    handle: minted as NoteHandle,
    // Off the filename, which is the whole point of these: what the list shows
    // and what the folder says cannot be allowed to disagree.
    copyNumber: copyNumberOf(id),
  };
}

const marksIn = (sections: ReturnType<typeof sectionsFor>, heading: string) =>
  sections.find((section) => section.heading === heading)?.rows.map((row) => row.mark);

describe('texts that read the same in the list', () => {
  it('leaves a text alone when no other reads like it', () => {
    const sections = sectionsFor(view());
    assert.deepEqual(marksIn(sections, 'Svi tekstovi'), [null, null, null]);
  });

  it('shows each one the number its own file carries', () => {
    const notes = [
      alike('4 klozeta (1)', '4 klozeta', 3000),
      alike('4 klozeta (2)', '4 klozeta', 2000),
    ];
    assert.deepEqual(marksIn(sectionsFor(view({ notes })), 'Svi tekstovi'), ['(1)', '(2)']);
  });

  it('shows the gap a deleted one left, rather than closing it up', () => {
    // The files are still called (1) and (3). Renumbering the rows would make
    // the list say (2) about a file named (3).
    const notes = [
      alike('Pismo (1)', 'Pismo', 3000),
      alike('Pismo (3)', 'Pismo', 2000),
    ];
    assert.deepEqual(marksIn(sectionsFor(view({ notes })), 'Svi tekstovi'), ['(1)', '(3)']);
  });

  it('shows a number on a lone text too, because the file still carries one', () => {
    // Not a state the store leaves standing — the last of a group is renamed
    // back to a plain name. Until that lands, the list says what the file says.
    const notes = [alike('Pismo (1)', 'Pismo', 3000), alike('Zima', 'Zima', 2000)];
    assert.deepEqual(marksIn(sectionsFor(view({ notes })), 'Svi tekstovi'), ['(1)', null]);
  });

  it('shows his own number and the one on the file, when his line ends in one', () => {
    // `fileNameBase` strips his trailing (1), so the file is `Pismo (1).txt`
    // and the row reads `Pismo (1) (1)`. Ugly, true, and not a regression:
    // his words are his, and the number beside them is the file's.
    const notes = [alike('Pismo (1)', 'Pismo (1)', 3000), alike('Pismo (2)', 'Pismo', 2000)];
    const sections = sectionsFor(view({ notes }));
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Pismo', 'Pismo (1)']);
    assert.deepEqual(marksIn(sections, 'Svi tekstovi'), ['(2)', '(1)']);
  });

  it('invents no number for copies that arrived under unrelated names', () => {
    // Two texts, one title, and neither file says which is which. Counting
    // rows would put a number on screen that is on no file in his folder.
    const notes = [
      alike('4 klozeta', '4 klozeta', 3000),
      alike('klozeti-stari-laptop', '4 klozeta', 2000),
    ];
    assert.deepEqual(marksIn(sectionsFor(view({ notes })), 'Svi tekstovi'), [null, null]);
  });

  it('gives a text the same number in Nedavni as in Svi tekstovi', () => {
    const notes = [
      alike('Pismo (1)', 'Pismo', 1000),
      alike('Pismo (2)', 'Pismo', 3000),
      alike('Zima', 'Zima', 2000),
    ];
    const sections = sectionsFor(view({ notes }));
    assert.deepEqual(marksIn(sections, 'Nedavni'), ['(2)', null, '(1)']);
    assert.deepEqual(marksIn(sections, 'Svi tekstovi'), ['(1)', '(2)', null]);
  });

  it('counts a long group in order, so (10) does not sort above (2)', () => {
    const notes = [2, 10, 1].map((n) => alike(`Bez naslova (${n})`, '', 3000 - n));
    assert.deepEqual(marksIn(sectionsFor(view({ notes })), 'Svi tekstovi'), ['(1)', '(2)', '(10)']);
  });

  it('marks texts he has emptied, which all read as Bez naslova', () => {
    const notes = [alike('Prazan (1)', '', 2000), alike('Prazan (2)', '', 1000)];
    const sections = sectionsFor(view({ notes }));
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Bez naslova', 'Bez naslova']);
    assert.deepEqual(marksIn(sections, 'Svi tekstovi'), ['(1)', '(2)']);
  });

  it('leaves the text he has just started unmarked', () => {
    const notes = [alike('Pismo (1)', 'Pismo', 2000), alike('Pismo (2)', 'Pismo', 1000)];
    assert.equal(openRowFor(view({ notes, draft: { startedAt: 9000 } }))?.mark, null);
  });
});
