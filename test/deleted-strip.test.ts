import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DeletedNote } from '../src/notes/note.ts';
import { toSearchable } from '../src/language/diacritics.ts';
import { deletedStripFor } from '../src/ui/elsewhere/deleted-strip.ts';

const noteOf = (title: string, text: string): DeletedNote => ({
  id: title,
  title,
  text,
  searchable: toSearchable(text),
  updatedAt: 0,
  bytes: text.length,
  versions: 0,
});

const THREE = [
  noteOf('O zimi', 'O zimi\n\nPada snijeg nad gradom.'),
  noteOf('O jeseni', 'O jeseni\n\nLišće i kiša.'),
  noteOf('Pismo', 'Pismo\n\nDragi moj, pišem ti o zimi.'),
];

describe('the strip under his list', () => {
  it('names and counts them, the way the headings above it do', () => {
    assert.equal(deletedStripFor(THREE, '', 'sr').label, 'Obrisani tekstovi · 3 teksta');
  });

  it('counts in his own plurals', () => {
    assert.equal(deletedStripFor(THREE.slice(0, 1), '', 'sr').label, 'Obrisani tekstovi · 1 tekst');
  });

  it('says so rather than going when he has thrown nothing away', () => {
    const strip = deletedStripFor([], '', 'sr');

    assert.equal(strip.label, 'Obrisani tekstovi · nema obrisanih');
    assert.equal(strip.canOpen, false, 'nothing in there to open');
  });

  it('says how many match while he is searching', () => {
    // A search that comes back with nothing is the moment he needs telling that
    // the text might be in here.
    assert.equal(deletedStripFor(THREE, 'zimi', 'sr').label, '2 obrisana teksta sadrže „zimi“');
  });

  it('finds them without the marks he did not type', () => {
    assert.equal(deletedStripFor(THREE, 'lisce', 'sr').label, '1 obrisan tekst sadrži „lisce“');
  });

  it('counts the nothing that matched, and still offers what is in there', () => {
    // Where the strip used to go, which is the one moment it has something to
    // tell him: the text he cannot find may be among these three.
    const strip = deletedStripFor(THREE, 'traktor', 'sr');

    assert.equal(strip.label, '0 obrisanih tekstova sadrži „traktor“');
    assert.equal(strip.canOpen, true);
  });

  it('ignores space he typed either side of the word', () => {
    assert.equal(deletedStripFor(THREE, '  zimi  ', 'sr').label, '2 obrisana teksta sadrže „zimi“');
  });

  it('counts all of them again when he clears the box', () => {
    assert.equal(deletedStripFor(THREE, '   ', 'sr').label, 'Obrisani tekstovi · 3 teksta');
  });
});
