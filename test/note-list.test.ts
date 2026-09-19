import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Note } from '../src/notes/note.ts';
import { type ListView, draftRowFor, sectionsFor } from '../src/ui/note-list.ts';

function note(title: string, text: string, updatedAt: number): Note {
  return { id: title, title, text, updatedAt, bytes: text.length };
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
    assert.equal(draftRowFor(view({ draft: { startedAt: 9000 } }))?.id, null);
  });

  it('names a started text for what it is until his own first line takes over', () => {
    assert.equal(draftRowFor(view({ draft: { startedAt: 9000 } }))?.title, 'Novi tekst — bez naslova');
  });

  it('has no such row before he has started one', () => {
    assert.equal(draftRowFor(view()), null);
  });

  it('still shows a started text when the search matches nothing', () => {
    // It has no words in it, so it can never match — and it used to sink into
    // the dimmed remainder just as Nedavni disappeared, leaving the text he had
    // asked for nowhere he would look.
    const searching = view({ query: 'nepostojeće', draft: { startedAt: 9000 } });
    assert.notEqual(draftRowFor(searching), null);
    const sections = sectionsFor(searching);
    assert.deepEqual(titlesIn(sections, 'Pronađeni'), []);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });

  it('keeps every text somewhere when nothing matches at all', () => {
    const sections = sectionsFor(view({ query: 'nepostojeće' }));
    assert.deepEqual(titlesIn(sections, 'Pronađeni'), []);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });
});
