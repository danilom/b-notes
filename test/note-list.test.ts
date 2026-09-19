import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSearchable } from '../src/language/diacritics.ts';
import type { Note } from '../src/notes/note.ts';
import { type ListView, openRowFor, sectionsFor } from '../src/ui/note-list.ts';

function note(title: string, text: string, updatedAt: number): Note {
  return { id: title, title, text, searchable: toSearchable(text), updatedAt, bytes: text.length };
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

  it('pins the text he is editing when the search would dim it', () => {
    // He searched for a word, opened what he found, and then deleted the word.
    const searching = view({ query: 'kamen', openId: 'Zima' });
    assert.equal(openRowFor(searching)?.title, 'Zima');
    // And it is not also left sitting in the dimmed remainder below.
    assert.deepEqual(titlesIn(sectionsFor(searching), 'Svi tekstovi'), ['Amsterdam']);
  });

  it('leaves the text he is editing alone when it matches the search', () => {
    assert.equal(openRowFor(view({ query: 'kamen', openId: 'Ponta' })), null);
  });

  it('pins nothing while there is no search to hide anything', () => {
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
