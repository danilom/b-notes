import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ArchivedNote } from '../src/notes/note.ts';
import { snippetOf } from '../src/ui/archive-dialog.ts';

function archived(title: string, text: string): ArchivedNote {
  return {
    id: title,
    title,
    text,
    searchable: text.toLowerCase(),
    updatedAt: 0,
    bytes: text.length,
    archive: 'Stari laptop 2021',
    versions: 0,
    alsoLive: false,
  };
}

describe('what an archived text shows on its row', () => {
  it('leaves out the title, which is already on the row above it', () => {
    const note = archived('Pismo', 'Pismo\n\nPisao sam ti ovo pismo u jesen.');
    assert.equal(snippetOf(note), 'Pisao sam ti ovo pismo u jesen.');
  });

  it('flattens the paragraphs onto one line', () => {
    const note = archived('Pismo', 'Pismo\n\nPrvi red.\n\nDrugi red.');
    assert.equal(snippetOf(note), 'Prvi red. Drugi red.');
  });

  it('says nothing at all when there is nothing in the text', () => {
    assert.equal(snippetOf(archived('', '')), '');
  });
});
