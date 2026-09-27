import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type TitleParts, titlePartsOf } from '../src/notes/title-marks.ts';

/** What a title with no marks reads as: itself, spaces collapsed. */
const unmarked = (name: string): TitleParts => ({ mark: null, position: null, star: null, name });

/*
  The shapes below are his, from his Resoph folder; the words are invented.
*/
describe('reading his marks off the front of a title', () => {
  it('takes (UP) as a mark and the padded number after it as a place in the series', () => {
    assert.deepEqual(titlePartsOf('(UP)           3  Sorabi**'), {
      mark: '(UP)',
      position: { series: null, number: '3' },
      star: null,
      name: 'Sorabi**',
    });
    assert.deepEqual(titlePartsOf('(UP)  II     12     Most (w)  Luka'), {
      mark: '(UP)',
      position: { series: 'II', number: '12' },
      star: null,
      name: 'Most (w) Luka',
    });
  });

  it('reads a number as a place in a series only after (UP)', () => {
    assert.deepEqual(titlePartsOf('AA  20 godina'), { mark: 'AA', position: null, star: null, name: '20 godina' });
  });

  it('takes (UP) with no number as a mark alone', () => {
    assert.deepEqual(titlePartsOf('(UP)        Lovcen 1 i 2'), {
      mark: '(UP)',
      position: null,
      star: null,
      name: 'Lovcen 1 i 2',
    });
  });

  it('reads the kinds with the letters in front of them, however they are spaced', () => {
    assert.equal(titlePartsOf('A (E)     Bangkok III').mark, 'A (E)');
    assert.equal(titlePartsOf('A(P)  Stara bajka').mark, 'A(P)');
    assert.equal(titlePartsOf('yA (E)   Ulica').mark, 'yA (E)');
    assert.deepEqual(titlePartsOf('AA(E)Kafana'), { mark: 'AA(E)', position: null, star: null, name: 'Kafana' });
  });

  it('reads the letters that only float or sink a text, apart or run into a word', () => {
    assert.deepEqual(titlePartsOf('AAA Pismo'), { mark: 'AAA', position: null, star: null, name: 'Pismo' });
    assert.deepEqual(titlePartsOf('AAKafana'), { mark: 'AA', position: null, star: null, name: 'Kafana' });
    assert.deepEqual(titlePartsOf('zz staro'), { mark: 'zz', position: null, star: null, name: 'staro' });
  });

  it('reads (UP) run straight into a name', () => {
    assert.deepEqual(titlePartsOf('(UP)Vepar**'), { mark: '(UP)', position: null, star: null, name: 'Vepar**' });
  });

  it('keeps the leading spaces out of it: those are the rank', () => {
    assert.equal(titlePartsOf('                       A(P) Stara bajka').mark, 'A(P)');
  });

  it('leaves a title alone when what is in front is a word, not a mark', () => {
    // "A" is a word in his language, and an all-capitals word starting AA is a word.
    for (const title of ['A sad sta', 'AABB grupa', 'zz1 Nikola', 'Sorabi**', 'ZA Ivu', 'Kafana (E) i dalje']) {
      assert.deepEqual(titlePartsOf(title), unmarked(title));
    }
  });

  it('leaves marks with nothing after them as the title they are', () => {
    assert.deepEqual(titlePartsOf('(UP)  12  '), unmarked('(UP) 12'));
    assert.deepEqual(titlePartsOf('   *'), unmarked('*'));
    assert.deepEqual(titlePartsOf('AA'), unmarked('AA'));
  });
});

describe('his star', () => {
  it('is drawn as a star in front of the name, glued to it or not', () => {
    assert.deepEqual(titlePartsOf('                        *GRAD KRLJE'), {
      mark: null,
      position: null,
      star: '★',
      name: 'GRAD KRLJE',
    });
    assert.deepEqual(titlePartsOf('* Ivo A ( ?konacna v.)').star, '★');
  });

  it('comes after a mark, with the floating A in front of it', () => {
    assert.deepEqual(titlePartsOf('A (E)     A* Avdo Medj.(konacna)'), {
      mark: 'A (E)',
      position: null,
      star: 'A★',
      name: 'Avdo Medj.(konacna)',
    });
  });

  it('is drawn as a star when it is part of the mark', () => {
    assert.equal(titlePartsOf('*(UP)  Nobelova**( radi)').mark, '★(UP)');
  });

  it('stays as he typed it inside or after the name', () => {
    assert.deepEqual(titlePartsOf('(UP)           5  Sor Gitara*(rez) I'), {
      mark: '(UP)',
      position: { series: null, number: '5' },
      star: null,
      name: 'Sor Gitara*(rez) I',
    });
  });
});
