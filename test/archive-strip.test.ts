import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Archive } from '../src/notes/note.ts';
import { archiveStripFor } from '../src/ui/deleted-and-archived/archive-strip.ts';

const strip = (archives: Archive[]) => archiveStripFor(archives, 'sr');

describe('the strip that leads to the archive', () => {
  it('is not there at all when nothing was ever imported', () => {
    // He cannot make an archive, so an empty one is not a place he has not
    // been to yet. Unlike the deleted strip, which is always there.
    assert.equal(strip([]).present, false);
  });

  it('is there as soon as one archive holds anything', () => {
    assert.equal(strip([{ name: 'Stari laptop 2021', texts: 1 }]).present, true);
  });

  it('counts every archive together, since he is looking for a text not a folder', () => {
    const label = strip([
      { name: 'Stari laptop 2021', texts: 4 },
      { name: 'Telefon', texts: 6 },
    ]).label;
    assert.equal(label, 'Arhiva · 10 tekstova');
  });

  it('gets the Serbian plural right, which he would notice', () => {
    assert.equal(strip([{ name: 'A', texts: 1 }]).label, 'Arhiva · 1 tekst');
    assert.equal(strip([{ name: 'A', texts: 3 }]).label, 'Arhiva · 3 teksta');
    assert.equal(strip([{ name: 'A', texts: 11 }]).label, 'Arhiva · 11 tekstova');
  });
});
