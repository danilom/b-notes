import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countWords } from '../src/notes/word-count.ts';
import { beginningAndEnd, onOneLine } from '../src/ui/text-snippet.ts';
import { describeVersion, versionsWorthShowing } from '../src/ui/version-row.ts';

const versionOf = (text: string, takenAt = 0) => ({ id: String(takenAt), takenAt, text });

describe('counting his words', () => {
  it('counts nothing in an empty text', () => {
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   \n\n  '), 0);
  });

  it('does not count the blank lines between his paragraphs', () => {
    assert.equal(countWords('Prvi red.\n\n\nDrugi red.'), 4);
  });

  it('keeps punctuation with the word it is stuck to', () => {
    assert.equal(countWords('Zima, sneg i led.'), 4);
  });

  it('counts a hyphenated name once, the way he would read it', () => {
    assert.equal(countWords('Bitls-i su svirali'), 3);
  });
});

describe('shortening a paragraph to one line', () => {
  it('leaves a short one alone', () => {
    assert.equal(onOneLine('Pada sneg.', 40), 'Pada sneg.');
  });

  it('flattens the line breaks his paragraphs are wrapped at', () => {
    assert.equal(onOneLine('Pada sneg\nnad gradom.', 40), 'Pada sneg nad gradom.');
  });

  it('cuts at a word rather than through one', () => {
    const line = onOneLine('Pada sneg nad gradom i nad rekom', 20);

    assert.equal(line, 'Pada sneg nad gradom…');
  });

  it('cuts mid-word rather than losing most of the line to one long word', () => {
    const line = onOneLine('Do prekjucerasnjeprekosutrasnjega', 20);

    assert.equal(line, 'Do prekjucerasnjepre…');
  });
});

describe('what a row in the versions list says', () => {
  const current = 'O zimi\n\nDrugi pasus.';

  it('gives the length on its own, with the comparison on the line below', () => {
    // The two used to be one string. The index column has no room for that,
    // and the second line is where the one fact worth a second line goes.
    const row = describeVersion(versionOf('O zimi\n\nPrvi pasus.\n\nDrugi pasus.'), current, 'O zimi', 'sr');

    assert.equal(row.size, '6 reči');
    assert.equal(row.note, '2 reči više nego sada');
  });

  it('says so when a copy is shorter than what he has now', () => {
    const row = describeVersion(versionOf('O zimi'), current, 'O zimi', 'sr');

    assert.equal(row.size, '2 reči');
    assert.equal(row.note, '2 reči manje nego sada');
  });

  it('leaves the second line off when there is no difference to report', () => {
    const row = describeVersion(versionOf('O zimi\n\nDrugi tekst.'), current, 'O zimi', 'sr');

    assert.equal(row.size, '4 reči');
    assert.equal(row.note, null);
  });

  it('gives the second line to the old name when this copy opened differently', () => {
    // The rarer fact and the more distinctive one. The length it displaces is
    // what the diff beside the row is about to make plain anyway.
    const row = describeVersion(versionOf('Pismo bratu\n\nPrvi pasus.'), current, 'O zimi', 'sr');

    assert.equal(row.note, 'Zvao se: „Pismo bratu“');
  });

  it('stays quiet about the title while it is the one on every other row', () => {
    const row = describeVersion(
      versionOf('O zimi\n\nPrvi pasus. Jos nesto.'),
      current,
      'O zimi',
      'sr',
    );

    assert.equal(row.note, '2 reči više nego sada', 'the comparison, not the name');
  });

  it('counts words in English too, with the English comparison', () => {
    const row = describeVersion(versionOf('On winter\n\nFirst one.'), 'On winter', 'On winter', 'en');

    assert.equal(row.size, '4 words');
    assert.equal(row.note, '2 words more than now');
  });
});

describe('which copies are worth offering him', () => {
  const current = 'O zimi\n\nDrugi pasus.';

  it('drops one that matches his text, which is what a copy he just restored is', () => {
    const kept = [versionOf(current, 1), versionOf('O zimi\n\nStari pasus.', 2)];

    assert.deepEqual(
      versionsWorthShowing(kept, current).map((version) => version.id),
      ['2'],
    );
  });

  it('keeps one of the same length that says something else', () => {
    const kept = [versionOf('O zimi\n\nDrugi tekst.', 1)];

    assert.equal(versionsWorthShowing(kept, current).length, 1);
  });
});

describe('keeping both ends of a paragraph he can read elsewhere', () => {
  it('gives back the whole thing when nothing had to go', () => {
    assert.deepEqual(beginningAndEnd('Pada sneg nad gradom.', 60), {
      head: 'Pada sneg nad gradom.',
      tail: null,
    });
  });

  it('hands the two ends back apart, for the caller to mark the gap', () => {
    // Not joined by an ellipsis here: his own writing has ellipses in it, so
    // what stands for the missing middle is the caller's to choose.
    const { head, tail } = beginningAndEnd('Prvi deo recenice pa onda jos teksta i najzad kraj.', 24);

    assert.ok(head.startsWith('Prvi deo'), head);
    assert.ok(tail !== null && tail.endsWith('kraj.'), String(tail));
  });

  it('flattens the line breaks his paragraphs are wrapped at', () => {
    assert.equal(beginningAndEnd('Pada sneg\nnad gradom.', 60).head, 'Pada sneg nad gradom.');
  });
});

describe('marking which row of the list a copy is', () => {
  const current = 'O zimi\n\nDrugi pasus.';
  const rowIn = (at: number, of: number) =>
    describeVersion(versionOf('O zimi\n\nStari pasus.'), current, 'O zimi', 'sr', { row: at, of });

  it('numbers from the top, which is the order he reads them in', () => {
    assert.equal(rowIn(1, 6).number, '#1');
    assert.equal(rowIn(4, 6).number, '#4');
  });

  it('says nothing when there is only one copy to point at', () => {
    // "#1" against a single row names nothing it was not already the only
    // answer to.
    assert.equal(rowIn(1, 1).number, null);
  });
});
