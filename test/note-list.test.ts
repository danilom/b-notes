import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Note } from '../src/notes/note.ts';
import { type ListView, sectionsFor } from '../src/ui/note-list.ts';

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

  it('puts a started text at the top of the recent ones before it has a file', () => {
    const sections = sectionsFor(view({ draft: { startedAt: 9000 } }));
    assert.deepEqual(titlesIn(sections, 'Nedavni'), ['Bez naslova', 'Ponta', 'Zima', 'Amsterdam']);
  });

  it('gives a started text no id, so there is nothing to open', () => {
    const sections = sectionsFor(view({ draft: { startedAt: 9000 } }));
    const recent = sections.find((section) => section.heading === 'Nedavni')?.rows ?? [];
    assert.equal(recent[0]?.id, null);
    assert.equal(recent[1]?.id, 'Ponta');
  });

  it('files a started text alphabetically among all the others', () => {
    const sections = sectionsFor(view({ draft: { startedAt: 9000 } }));
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Bez naslova', 'Ponta', 'Zima']);
  });

  it('never counts an empty started text as a search result', () => {
    const sections = sectionsFor(view({ query: 'kamen', draft: { startedAt: 9000 } }));
    assert.deepEqual(titlesIn(sections, 'Pronađeni'), ['Ponta']);
    // Present, but dimmed and below — searching promotes, it never removes.
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Bez naslova', 'Zima']);
  });

  it('keeps every text somewhere when nothing matches at all', () => {
    const sections = sectionsFor(view({ query: 'nepostojeće' }));
    assert.deepEqual(titlesIn(sections, 'Pronađeni'), []);
    assert.deepEqual(titlesIn(sections, 'Svi tekstovi'), ['Amsterdam', 'Ponta', 'Zima']);
  });
});
