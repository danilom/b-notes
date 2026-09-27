import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compareTitles, rankOf, titleFrom, titleLineOf, titlePartsOf, writingStartsAt } from '../src/notes/note-title.ts';

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

/*
  The shapes below are his, from his Resoph folder; the words are invented.
*/
describe('reading his marks off the front of a title', () => {
  it('takes (UP) as a mark and the padded number after it as a place in the series', () => {
    assert.deepEqual(titlePartsOf('(UP)           3  Sorabi**'), {
      mark: '(UP)',
      position: { series: null, number: '3' },
      name: 'Sorabi**',
    });
    assert.deepEqual(titlePartsOf('(UP)  II     12     Most (w)  Luka'), {
      mark: '(UP)',
      position: { series: 'II', number: '12' },
      name: 'Most (w) Luka',
    });
  });

  it('takes (UP) with no number as a mark alone', () => {
    assert.deepEqual(titlePartsOf('(UP)        Lovcen 1 i 2'), { mark: '(UP)', position: null, name: 'Lovcen 1 i 2' });
  });

  it('reads the kinds with the letters in front of them, however they are spaced', () => {
    assert.deepEqual(titlePartsOf('A (E)     Bangkok III'), { mark: 'A (E)', position: null, name: 'Bangkok III' });
    assert.deepEqual(titlePartsOf('A(P)  Stara bajka'), { mark: 'A(P)', position: null, name: 'Stara bajka' });
    assert.deepEqual(titlePartsOf('AA(E)Kafana'), { mark: 'AA(E)', position: null, name: 'Kafana' });
    assert.deepEqual(titlePartsOf('yA (E)   Ulica'), { mark: 'yA (E)', position: null, name: 'Ulica' });
  });

  it('reads the letters that only float or sink a text, apart or run into the name', () => {
    assert.deepEqual(titlePartsOf('AAA Pismo'), { mark: 'AAA', position: null, name: 'Pismo' });
    assert.deepEqual(titlePartsOf('AAKafana'), { mark: 'AA', position: null, name: 'Kafana' });
    assert.deepEqual(titlePartsOf('zz staro'), { mark: 'zz', position: null, name: 'staro' });
  });

  it('keeps the leading spaces out of it: those are the rank', () => {
    assert.deepEqual(titlePartsOf('                       A(P) Stara bajka'), {
      mark: 'A(P)',
      position: null,
      name: 'Stara bajka',
    });
  });

  it('leaves a title alone when what is in front is a word, not a mark', () => {
    // "A" is a word in his language, and an all-capitals word starting AA is a word.
    for (const title of ['A sad sta', 'AABB grupa', '*GRADSKE PRICE, prva', 'ZA Ivu', 'Kafana (E) i dalje']) {
      assert.deepEqual(titlePartsOf(title), { mark: null, position: null, name: title });
    }
  });

  it('leaves a mark with nothing after it as the title it is', () => {
    assert.deepEqual(titlePartsOf('(UP)  12  '), { mark: null, position: null, name: '(UP) 12' });
  });
});

describe('putting titles in the order Resoph lists them in', () => {
  const sorted = (titles: string[]): string[] => [...titles].sort(compareTitles);

  it('puts spaces first, then (UP), *(UP), a dash, digits, and letters last', () => {
    // As he sees Resoph list them.
    const order = [
      '                        Najvise',
      '                Vise',
      '(UP)  Neki',
      '*(UP)  Drugi',
      '-crtica',
      '12 ruza',
      'A (E)  Esej',
      'A(P)  Prica',
      'AA  Kafana',
      'Bangkok',
    ];
    assert.deepEqual(sorted([...order].reverse()), order);
  });

  it('puts his padded numbers in numeric order', () => {
    const order = ['(UP)           3  Treci', '(UP)          12  Dvanaesti', '(UP)         104  Sto cetvrti'];
    assert.deepEqual(sorted([...order].reverse()), order);
  });

  it('ignores case', () => {
    assert.deepEqual(sorted(['Zima', 'avion', 'Brod']), ['avion', 'Brod', 'Zima']);
  });

  it('ignores case in letters that are otherwise the same, so his marks after them decide', () => {
    assert.deepEqual(sorted(['kafana-2', 'Kafana(1)']), ['Kafana(1)', 'kafana-2']);
  });

  it('puts č and ć after c and before d, as his alphabet does', () => {
    assert.deepEqual(sorted(['Dan', 'Ćup', 'Čaj', 'Cvet']), ['Cvet', 'Čaj', 'Ćup', 'Dan']);
  });
});
