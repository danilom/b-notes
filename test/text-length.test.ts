import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_UNDER_BYTES, bandOf, bandsFrom, bytesOf } from '../src/notes/text-length.ts';

/**
 * How long a text is, against the others he has written.
 *
 * The bands come from his own corpus, so what they mean depends on what is in
 * it — which is the point, and also the thing that can go wrong in two
 * directions: a handful of short notes declaring one of them long, and a
 * corpus too small to have quartiles at all.
 */
describe('banding his texts by length', () => {
  const spread = [50, 900, 1800, 2600, 3400, 4200, 5000, 12_000];

  it('puts the shortest and the longest at opposite ends', () => {
    const bands = bandsFrom(spread);

    assert.equal(bandOf(900, bands), 1);
    assert.equal(bandOf(12_000, bands), 4);
  });

  it('gives an emptied text a page with nothing on it', () => {
    // He empties texts rather than deleting them, and a blank page is the
    // clearest thing in the list for saying so.
    const bands = bandsFrom(spread);

    assert.equal(bandOf(0, bands), 0);
    assert.equal(bandOf(EMPTY_UNDER_BYTES - 1, bands), 0);
    assert.equal(bandOf(EMPTY_UNDER_BYTES, bands), 1);
  });

  it('does not call a jotting long because it is the longest jotting', () => {
    /*
      The whole reason for the floors. Four short notes have quartiles like
      anything else, and without a floor the longest of them would get a full
      page — which says something false about it to a man who cannot see the
      other three.
    */
    const bands = bandsFrom([20, 30, 40, 60]);

    assert.equal(bandOf(60, bands), 1);
  });

  it('answers at all for a corpus with nothing to divide', () => {
    // A fresh install has no quartiles. It still has to draw the list.
    const none = bandsFrom([]);

    assert.equal(bandOf(0, none), 0);
    assert.equal(bandOf(50, none), 1);
    assert.equal(bandOf(9000, none), 4);
  });

  it('spreads a real corpus across all four bands', () => {
    // His own shape: a third of it short, a long tail. If everything landed
    // in one band the glyph would be saying nothing at all.
    const his = [
      ...Array.from({ length: 200 }, (_, i) => 200 + i * 10),
      ...Array.from({ length: 300 }, (_, i) => 3000 + i * 40),
      ...Array.from({ length: 94 }, (_, i) => 20_000 + i * 500),
    ];
    const bands = bandsFrom(his);

    const seen = new Set(his.map((bytes) => bandOf(bytes, bands)));

    assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
  });

  it('keeps the boundaries in order however odd the corpus', () => {
    // Floors and quartiles are combined one band at a time, so a corpus that
    // sits between two floors must not come out with a boundary below the one
    // before it — which would put a longer text in a shorter band.
    for (const corpus of [[150], [250, 260], [1], [99, 101], []]) {
      const { at } = bandsFrom(corpus);
      assert.ok(at[0] <= at[1] && at[1] <= at[2], `out of order for ${JSON.stringify(corpus)}`);
    }
  });
});

/**
 * The lists that hold writing without holding its file measure it themselves,
 * and must come out with the number the file would have given.
 */
describe('measuring a text that is not a file', () => {
  it('counts a letter he actually writes with as the two bytes it takes', () => {
    assert.equal(bytesOf('cacka'), 5);
    assert.equal(bytesOf('čačka'), 7);
  });

  it('agrees with the bands that an emptied text is empty', () => {
    assert.ok(bytesOf('') < EMPTY_UNDER_BYTES);
    assert.ok(bytesOf('- [ ]') < EMPTY_UNDER_BYTES);
  });
});
