import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countWords } from '../src/notes/word-count.ts';
import { onOneLine } from '../src/ui/text-snippet.ts';
import { describeVersion } from '../src/ui/version-row.ts';

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

  it('gives the length and what it is beside his text now', () => {
    const row = describeVersion(versionOf('O zimi\n\nPrvi pasus.\n\nDrugi pasus.'), current, 'O zimi', 'sr');

    assert.equal(row.size, '6 reči (2 više nego sada)');
  });

  it('says so when a copy is shorter than what he has now', () => {
    const row = describeVersion(versionOf('O zimi'), current, 'O zimi', 'sr');

    assert.equal(row.size, '2 reči (2 manje nego sada)');
  });

  it('says so when nothing would come back', () => {
    const row = describeVersion(versionOf(current), current, 'O zimi', 'sr');

    assert.equal(row.size, '4 reči (isto kao sada)');
  });

  it('shows the paragraph he lost', () => {
    const row = describeVersion(versionOf('O zimi\n\nPrvi pasus.\n\nDrugi pasus.'), current, 'O zimi', 'sr');

    assert.equal(row.missing, 'Nedostaje: „Prvi pasus.“');
  });

  it('shows no missing line when his text still holds all of it', () => {
    const row = describeVersion(versionOf('O zimi'), current, 'O zimi', 'sr');

    assert.equal(row.missing, null);
  });

  it('stays quiet about the title while it is the one on every other row', () => {
    const row = describeVersion(versionOf('O zimi\n\nPrvi pasus.'), current, 'O zimi', 'sr');

    assert.equal(row.wasCalled, null);
  });

  it('shows the old title when this copy opened differently', () => {
    const row = describeVersion(versionOf('Pismo bratu\n\nPrvi pasus.'), current, 'O zimi', 'sr');

    assert.equal(row.wasCalled, 'Zvao se: „Pismo bratu“');
  });

  it('shows nothing missing when he rewrote the whole thing, as the preview marks nothing', () => {
    // The guard the row borrows from the preview: marking every paragraph says
    // no more than marking none, so both have to agree that nothing is marked.
    const row = describeVersion(versionOf('Prvi.\n\nDrugi.'), 'Sasvim drugi tekst.', 'Sasvim', 'sr');

    assert.equal(row.missing, null);
  });

  it('does not repeat the old title as the missing paragraph', () => {
    // A changed title is its own paragraph, and so the first one gone from his
    // text — but the line above the row has already said it.
    const row = describeVersion(
      versionOf('Pismo bratu\n\nPrvi pasus.\n\nDrugi pasus.'),
      current,
      'O zimi',
      'sr',
    );

    assert.equal(row.wasCalled, 'Zvao se: „Pismo bratu“');
    assert.equal(row.missing, 'Nedostaje: „Prvi pasus.“');
  });

  it('counts words in English too, with the English comparison', () => {
    const row = describeVersion(versionOf('On winter\n\nFirst one.'), 'On winter', 'On winter', 'en');

    assert.equal(row.size, '4 words (2 more than now)');
  });
});
