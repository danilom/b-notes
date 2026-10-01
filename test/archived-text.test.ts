import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { archivedTextOf } from '../src/notes/archived-text.ts';

describe('an archived file in the shape b-notes reads', () => {
  it('gets its title from its name when only the name has it, as Resoph keeps them', () => {
    assert.deepEqual(archivedTextOf('      %2AGRAD Kilim', 'Prvi red.\r\nDrugi.'), {
      text: '      *GRAD Kilim\n\nPrvi red.\nDrugi.',
      titled: true,
      empty: false,
    });
  });

  it('is left as it is when it opens with its title already, as Simplenote kept them', () => {
    assert.equal(archivedTextOf('Pismo iz Boke', 'Pismo iz Boke\n\nTekst.').titled, false);
    assert.equal(archivedTextOf('Pismo iz Boke', 'Pismo iz Boke\n\nTekst.').text, 'Pismo iz Boke\n\nTekst.');
  });

  it('knows its title under other case, marks, punctuation or a copy number', () => {
    assert.equal(archivedTextOf('Sta je to', 'Šta je to?\n\nTekst.').titled, false);
    assert.equal(archivedTextOf('Pismo (1)', 'Pismo\n\nTekst.').titled, false);
    assert.equal(archivedTextOf('Pismo 2', 'PISMO\n\nTekst.').titled, false);
  });

  it('knows a long name cut off in the middle of a word', () => {
    assert.equal(archivedTextOf('Kakav coek gospodin bi b', 'Kakav čoek gospodin bi bio da mu nema te mane').titled, false);
  });

  it('does not take a short title for the start of a longer word', () => {
    assert.equal(archivedTextOf('Up', 'Upravo sam stigao.').titled, true);
  });

  it('compares a title with no letters in it as it is written', () => {
    assert.equal(archivedTextOf('- [ ]', '- [ ] kupiti hleb').titled, false);
    assert.equal(archivedTextOf('- [ ]', 'kupiti hleb').titled, true);
  });

  it('keeps an empty one as its title with nothing under it, which is how he jots an idea', () => {
    assert.deepEqual(archivedTextOf('Osa i staklo', '  \r\n'), { text: 'Osa i staklo\n\n', titled: false, empty: true });
  });

  it("leaves a file b-notes named as it is, whatever its first line, since it opens with its title already", () => {
    // He retitled them after they were named; the name never changes.
    assert.equal(archivedTextOf('Pismo ~K3F9A2', 'Pismo bratu\n\nTekst.').text, 'Pismo bratu\n\nTekst.');
    assert.equal(archivedTextOf('Pismo ~K3F9A2 2', 'Drugo\n\nTekst.').titled, false);
    assert.equal(archivedTextOf('Pismo ~2026-09-27 14-32-10 Dell', 'Novo ime\n\nTekst.').titled, false);
  });
});
