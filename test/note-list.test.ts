import type { NoteHandle } from '../src/notes/note-handle.ts';
import type { LiveNote } from '../src/notes/writing.ts';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_APPEARANCE } from '../src/ui/settings/appearance.ts';
import { toSearchable } from '../src/language/diacritics.ts';
import { codeOf } from '../src/notes/note-naming.ts';
import type { Note } from '../src/notes/note.ts';
import { type ListView, foundByCode, openRowFor, sectionsFor } from '../src/ui/note-list.ts';
import { rankOf, titleFrom, titleLineOf } from '../src/notes/note-title.ts';

let minted = 0;

function note(title: string, text: string, updatedAt: number): LiveNote {
  minted += 1;
  return {
    id: title,
    title,
    sortTitle: title,
    rank: 0,
    text,
    searchable: toSearchable(text),
    code: codeOf(title),
    updatedAt,
    bytes: text.length,
    handle: minted as NoteHandle,
  };
}

const NOTES = [
  note('Ponta', 'More i kamen', 3000),
  note('Zima', 'Snijeg pada', 2000),
  note('Amsterdam', 'Kanali i bicikli', 1000),
];

function view(over: Partial<ListView> = {}): ListView {
  return {
    notes: NOTES,
    query: '',
    recentCount: DEFAULT_APPEARANCE.recentCount,
    openId: null,
    draft: null,
    language: 'sr',
    ...over,
  };
}

const titlesIn = (sections: ReturnType<typeof sectionsFor>, heading: string) =>
  sections.find((section) => section.heading === heading)?.rows.map((row) => row.title);

describe('the list of texts', () => {
  it('shows nothing extra while he has not started a new text', () => {
    const sections = sectionsFor(view());
    assert.deepEqual(titlesIn(sections, 'Nedavni'), ['Ponta', 'Zima', 'Amsterdam']);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });

  it('offers as many recent texts as he has asked for, and no more', () => {
    // Shortening Nedavni hides nothing: it is a shortcut into Svi tekstovi, so
    // what falls off the end of it is still in the list below, in its place.
    const sections = sectionsFor(view({ recentCount: 2 }));
    assert.deepEqual(titlesIn(sections, 'Nedavni'), ['Ponta', 'Zima']);
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

describe('finding a text by the code the stub in Resoph gives him', () => {
  // Retitled since it was taken over: its file keeps the old title and the code.
  const kafana = { ...note('Kafana na uglu ~K3F9A2', 'Sasvim drugi naslov\n\nI reci.', 500), title: 'Sasvim drugi naslov' };
  const withCode = view({ notes: [...NOTES, kafana] });

  it('finds it by the whole code, tilde and all, in any case', () => {
    for (const query of ['~K3F9A2', '~k3f9a2', 'K3F9A2']) {
      assert.deepEqual(titlesIn(sectionsFor({ ...withCode, query }), 'Pronađeni'), ['Sasvim drugi naslov'], query);
    }
  });

  it('finds it by part of the code, as it would by part of a word', () => {
    assert.deepEqual(titlesIn(sectionsFor({ ...withCode, query: 'f9a2' }), 'Pronađeni'), ['Sasvim drugi naslov']);
  });

  it('says which code it was found by, where his words did not match', () => {
    assert.equal(foundByCode(kafana, '~K3F9A2'), '~K3F9A2');
    assert.equal(foundByCode(kafana, 'f9a'), '~K3F9A2');
  });

  it('says nothing about the code where his words matched, since those say why', () => {
    assert.equal(foundByCode(kafana, 'reci'), null);
    // In his words and in the code both: the words are reason enough.
    assert.equal(foundByCode(kafana, 'a'), null);
    assert.equal(foundByCode(kafana, ''), null);
  });

  it('finds nothing by a code in a text that has none', () => {
    assert.deepEqual(titlesIn(sectionsFor(view({ query: '~K3F9A2' })), 'Pronađeni'), []);
  });
});

/** A text as his Resoph titles come: ranked by the spaces in front. */
function ranked(line: string, updatedAt: number): LiveNote {
  const text = `${line}\nTekst.`;
  return {
    ...note(titleFrom(text), text, updatedAt),
    sortTitle: titleLineOf(text),
    rank: rankOf(titleLineOf(text)),
  };
}

describe('his order, which is his titles as he typed them', () => {
  const notes = [
    ranked('Ana', 3000),
    ranked('                        Muskulus', 1000),
    ranked('zz Zbunjen', 4000),
    ranked('         Pismo', 2000),
  ];

  it('puts the texts he ranked with more spaces higher', () => {
    assert.deepEqual(titlesIn(sectionsFor(view({ notes })), 'Svi tekstovi'), [
      'Muskulus',
      'Pismo',
      'Ana',
      'zz Zbunjen',
    ]);
  });

  it('shows how high each is ranked, rather than the spaces', () => {
    const rows = sectionsFor(view({ notes })).find((section) => section.heading === 'Svi tekstovi')?.rows;
    assert.deepEqual(rows?.map((row) => [row.title, row.rank]), [
      ['Muskulus', 3],
      ['Pismo', 1],
      ['Ana', 0],
      ['zz Zbunjen', 0],
    ]);
  });
});
