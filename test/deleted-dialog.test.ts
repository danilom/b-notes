import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { snippetOf } from '../src/ui/deleted-dialog.ts';

const noteOf = (text: string, title: string) => ({
  id: title,
  title,
  text,
  searchable: text.toLowerCase(),
  updatedAt: 0,
  bytes: text.length,
});

describe('the line under a deleted text', () => {
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

  it('cuts a long opening rather than laying it across the dialog', () => {
    const note = noteOf(`Naslov\n\n${'rec '.repeat(200)}`, 'Naslov');

    const snippet = snippetOf(note);
    assert.ok(snippet.length < 150, `snippet was ${snippet.length} characters`);
    assert.ok(snippet.endsWith('…'), 'a cut snippet says it was cut');
  });
});
