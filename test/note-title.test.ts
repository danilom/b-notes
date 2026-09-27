import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankOf, titleFrom, titleLineOf, writingStartsAt } from '../src/notes/note-title.ts';

/**
 * Where a caret may be dropped without the app editing the name of the file.
 */
describe('where his writing starts, as against where his text starts', () => {
  it('starts it below the line the text is named after', () => {
    assert.equal(writingStartsAt('Naslov\nPrvi red.'), 7);
  });

  it('keeps a blank line between title and body on the writing side of the cut', () => {
    const text = 'Naslov\n\nPrvi red.';
    assert.equal(writingStartsAt(text), 7);
    assert.equal(text.slice(writingStartsAt(text)), '\nPrvi red.');
  });

  it('answers the very start for one unbroken block, which is all name', () => {
    assert.equal(writingStartsAt('Sve u jednom pasusu, bez ijednog preloma.'), 0);
  });

  it('answers the very start for a text with nothing in it', () => {
    assert.equal(writingStartsAt(''), 0);
  });
});

describe('the title, which is his first line and nothing cleverer', () => {
  it('is the first line with anything on it', () => {
    assert.equal(titleFrom('\n\nPismo za Zoru\nDragi moj,'), 'Pismo za Zoru');
  });

  it('keeps a short first line as it is, since that is what Resoph shows him', () => {
    assert.equal(titleFrom('i\nPrvi red koji bi nekad bio dodat naslovu.'), 'i');
  });

  it('is never cut, however long; the list shortens it on screen', () => {
    const long = 'Generali ( naci, gadjenje i slava, divljenje i odvratnost, nuzda , neizbjeznost)';
    assert.equal(titleFrom(`${long}\nTekst.`), long);
  });

  it('shows his ranking spaces as nothing, and runs of spaces as one', () => {
    assert.equal(titleFrom('                (UP)  II     33     Neven\nTekst.'), '(UP) II 33 Neven');
  });

  it('keeps his spaces exactly where it is sorted by', () => {
    assert.equal(titleLineOf('\n          Pismo  \nTekst.'), '          Pismo  ');
  });
});

describe('how high his leading spaces rank a text', () => {
  it('ranks a title with none as nothing', () => {
    assert.equal(rankOf('Pismo'), 0);
  });

  it('steps up where his widths bunch, at 16 and at 24', () => {
    assert.equal(rankOf(`${' '.repeat(9)}Pismo`), 1);
    assert.equal(rankOf(`${' '.repeat(15)}Pismo`), 1);
    assert.equal(rankOf(`${' '.repeat(16)}Pismo`), 2);
    assert.equal(rankOf(`${' '.repeat(24)}Pismo`), 3);
    assert.equal(rankOf(`${' '.repeat(30)}Pismo`), 3);
  });

  it('counts a tab as the four spaces it looks like', () => {
    assert.equal(rankOf('\t\t\t\tPismo'), 2);
  });
});
