import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WORTH_KEEPING,
  changeBetween,
  paragraphsNotIn,
  worthKeeping,
} from '../src/notes/text-change.ts';

const long = (howMany: number, of = 'a') => of.repeat(howMany);

describe('what a save did to his text', () => {
  it('sees nothing in a text that did not change', () => {
    assert.deepEqual(changeBetween('O zimi', 'O zimi'), { removed: 0, added: 0 });
  });

  it('sees only what arrived when he typed at the end', () => {
    assert.deepEqual(changeBetween('O zimi', 'O zimi i snijegu'), { removed: 0, added: 10 });
  });

  it('sees only what arrived when he typed at the start', () => {
    assert.deepEqual(changeBetween('zimi', 'O zimi'), { removed: 0, added: 2 });
  });

  it('sees only what arrived when he typed in the middle', () => {
    assert.deepEqual(changeBetween('O zimi', 'O hladnoj zimi'), { removed: 0, added: 8 });
  });

  it('sees what went when he cut from the middle', () => {
    assert.deepEqual(changeBetween('O hladnoj zimi', 'O zimi'), { removed: 8, added: 0 });
  });

  it('sees both when he typed over something', () => {
    // Both end in "oj zimi", so only "hladn" went and only "blag" arrived.
    assert.deepEqual(changeBetween('O hladnoj zimi', 'O blagoj zimi'), { removed: 5, added: 4 });
  });

  it('sees everything go when the text is replaced outright', () => {
    assert.deepEqual(changeBetween('xxxxx', 'y'), { removed: 5, added: 1 });
  });

  it('sees everything go when the text is emptied', () => {
    assert.deepEqual(changeBetween('xxxxx', ''), { removed: 5, added: 0 });
  });

  it('sees a first text as all arrival', () => {
    assert.deepEqual(changeBetween('', 'O zimi'), { removed: 0, added: 6 });
  });

  it('does not count the shared ends twice when a text repeats itself', () => {
    // "aaa" -> "aa" shares a start and an end that overlap, and counting both
    // would report less going than went.
    assert.deepEqual(changeBetween('aaa', 'aa'), { removed: 1, added: 0 });
    assert.deepEqual(changeBetween('aa', 'aaa'), { removed: 0, added: 1 });
  });
});

describe('whether a copy is kept before the write', () => {
  it('keeps nothing when he is only writing', () => {
    assert.equal(worthKeeping('O zimi', `O zimi${long(5000)}`, null), false);
  });

  it('keeps nothing when he trims a phrase', () => {
    const before = `Pocetak ${long(50)} kraj`;

    assert.equal(worthKeeping(before, 'Pocetak  kraj', null), false);
  });

  it('keeps a copy when a paragraph goes in one go', () => {
    const before = `Pocetak ${long(WORTH_KEEPING)} kraj`;

    assert.equal(worthKeeping(before, 'Pocetak  kraj', null), true);
  });

  it('keeps a copy when the whole essay is replaced by a keystroke', () => {
    assert.equal(worthKeeping(long(20000), 'y', null), true);
  });

  it('stops just under the line and starts just over it', () => {
    const under = `A${long(WORTH_KEEPING - 1)}B`;
    const over = `A${long(WORTH_KEEPING)}B`;

    assert.equal(worthKeeping(under, 'AB', null), false);
    assert.equal(worthKeeping(over, 'AB', null), true);
  });
});

describe('not keeping six copies of one cutting session', () => {
  const ESSAY = `Pocetak ${long(3000)} kraj`;

  it('keeps the first cut', () => {
    assert.equal(worthKeeping(ESSAY, `Pocetak ${long(2000)} kraj`, null), true);
  });

  it('keeps nothing more while he goes on cutting', () => {
    // The copy taken when he started already holds everything he is removing.
    const partWay = `Pocetak ${long(2000)} kraj`;

    assert.equal(worthKeeping(partWay, `Pocetak ${long(1000)} kraj`, ESSAY), false);
  });

  it('keeps one again the moment he has written something new to lose', () => {
    /*
      The hole a clock left. Five minutes of writing followed by a deletion fell
      inside the window and was kept nowhere; here the copy we hold is plainly
      missing the new writing, so the next cut keeps one.
    */
    const afterWriting = `Pocetak ${long(3000)} ${long(WORTH_KEEPING, 'b')} kraj`;

    assert.equal(worthKeeping(afterWriting, 'Pocetak  kraj', ESSAY), true);
  });

  it('still keeps nothing when what he wrote since is only a few words', () => {
    // Under the line is under the line, whichever end it is measured from.
    const afterALittle = `Pocetak ${long(3000)} ${long(20, 'b')} kraj`;

    assert.equal(worthKeeping(afterALittle, 'Pocetak  kraj', ESSAY), false);
  });
});


describe('what an old copy has that his text no longer does', () => {
  const rebuilt = (pieces: { text: string }[]) => pieces.map((piece) => piece.text).join('');
  const marked = (pieces: { text: string; missing: boolean }[]) =>
    pieces.filter((piece) => piece.missing).map((piece) => piece.text);

  it('marks the paragraph he has since cut', () => {
    const old = 'Naslov\n\nPrvi pasus.\n\nDrugi pasus.';
    const now = 'Naslov\n\nPrvi pasus.';

    assert.deepEqual(marked(paragraphsNotIn(old, now)), ['Drugi pasus.']);
  });

  it('marks nothing when his text still holds all of it', () => {
    const old = 'Naslov\n\nPrvi pasus.';
    const now = 'Naslov\n\nPrvi pasus.\n\nI jos jedan.';

    assert.deepEqual(marked(paragraphsNotIn(old, now)), []);
  });

  it('counts a paragraph he has reworded as gone, because as it stands it is', () => {
    const old = 'Naslov\n\nBilo je hladno.';
    const now = 'Naslov\n\nBilo je vrlo hladno.';

    assert.deepEqual(marked(paragraphsNotIn(old, now)), ['Bilo je hladno.']);
  });

  it('marks nothing at all when every paragraph is gone', () => {
    // A text he rewrote outright. Marking the whole page says nothing the page
    // did not already say.
    const old = 'Naslov\n\nPrvi.\n\nDrugi.';

    assert.deepEqual(marked(paragraphsNotIn(old, 'Sasvim drugi tekst.')), []);
  });

  it('marks nothing for the one text in nine that is a single block', () => {
    const old = 'Jedan dugacak pasus bez ijednog praznog reda u njemu.';

    assert.deepEqual(marked(paragraphsNotIn(old, 'Nesto sasvim drugo.')), []);
  });

  it('rebuilds the copy exactly, whatever it marked', () => {
    // The pieces are what gets drawn, so losing a blank line between them would
    // show him a text he never wrote.
    const old = 'Naslov\n\nPrvi pasus.\n\n\n\nDrugi pasus.\n';

    assert.equal(rebuilt(paragraphsNotIn(old, 'Naslov')), old);
    assert.equal(rebuilt(paragraphsNotIn(old, old)), old);
  });

  it('leaves blank runs alone rather than calling them missing', () => {
    const old = 'Naslov\n\nPrvi.';

    assert.deepEqual(marked(paragraphsNotIn(old, '')).filter((t) => t.trim().length === 0), []);
  });
});
