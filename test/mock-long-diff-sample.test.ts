import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LONG_SAMPLE_ID,
  LONG_SAMPLE_TEXT,
  longDiffSample,
} from '../src/hosts/mockup/mock-long-diff-sample.ts';

const NOW = Date.parse('2026-09-20T12:00:00');

const paragraphsOf = (text: string): string[] => text.split(/\n\n/);
const copies = () =>
  longDiffSample(NOW, 'Tekstovi')
    .filter((file) => file.path.includes('/Verzije/'))
    .sort((first, second) => second.updatedAt - first.updatedAt);

/** How far one copy is from his text, counted both ways. */
function apart(copy: string) {
  const [kept, now] = [paragraphsOf(copy), paragraphsOf(LONG_SAMPLE_TEXT)];
  return {
    onlyInCopy: kept.filter((paragraph) => !now.includes(paragraph)).length,
    onlyInText: now.filter((paragraph) => !kept.includes(paragraph)).length,
  };
}

describe('the long diff sample', () => {
  it('is long enough for a diff that has to scroll', () => {
    assert.ok(paragraphsOf(LONG_SAMPLE_TEXT).length > 40, 'paragraphs');
    assert.ok(LONG_SAMPLE_TEXT.split(/\s+/).length > 1500, 'words');
  });

  it('is the same text on every start, so a diff does not shift under you', () => {
    assert.equal(longDiffSample(NOW, 'Tekstovi')[0]?.text, LONG_SAMPLE_TEXT);
    assert.equal(longDiffSample(NOW + 5000, 'Tekstovi')[0]?.text, LONG_SAMPLE_TEXT);
  });

  it('opens under its own name, so it is findable in the list', () => {
    assert.ok(LONG_SAMPLE_TEXT.startsWith(`${LONG_SAMPLE_ID}\n\n`));
  });

  it('holds the run of paragraphs one save took out, which is what copies are for', () => {
    // Seven deleted in one go, plus the paragraph as it read before one
    // sentence of it was changed.
    assert.equal(apart(copies()[0]?.text ?? '').onlyInCopy, 8);
  });

  it('has a paragraph his text changed by one sentence and no more', () => {
    const newest = paragraphsOf(copies()[0]?.text ?? '');
    const edited = paragraphsOf(LONG_SAMPLE_TEXT).find((one) => !newest.includes(one));
    assert.ok(edited !== undefined, 'his text has a paragraph the copy does not');

    // Its counterpart in the copy, found by the opening the edit left alone.
    const before = newest.find((one) => one.startsWith(edited.slice(0, 60)));

    assert.ok(before !== undefined, 'the copy holds it as it read before');
    // Same opening, different ending: the case paragraph-level comparison can
    // only report as a whole paragraph swapped.
    assert.notEqual(edited, before);
  });

  it('gets further from his text the older it is', () => {
    const distances = copies().map((copy) => apart(copy.text).onlyInCopy);

    assert.deepEqual([...distances].sort((a, b) => a - b), distances);
  });
});
