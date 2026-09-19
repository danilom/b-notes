import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SAMPLE_ID, SAMPLE_TEXT, versionsSample } from '../src/hosts/mockup/mock-versions-sample.ts';
import { withSamplesPlaced } from '../src/hosts/mockup/mock-sample-files.ts';
import { describeVersion, versionsWorthShowing } from '../src/ui/version-row.ts';

/*
  A fixture that has quietly stopped showing what it was built to show is worse
  than no fixture: it is looked at instead of the thing it stands for. These
  assert that each copy still produces the row it is in the sample for.
*/

const NOW = Date.parse('2026-09-20T12:00:00');

/** The sample's copies, read the way the dialog reads them: newest first. */
function rows() {
  const versions = versionsSample(NOW, 'Tekstovi')
    .filter((file) => file.path.includes('/Verzije/'))
    .map((file) => ({ id: file.path, takenAt: file.updatedAt, text: file.text }))
    .sort((first, second) => second.takenAt - first.takenAt);

  return versionsWorthShowing(versions, SAMPLE_TEXT).map((version) =>
    describeVersion(version, SAMPLE_TEXT, SAMPLE_ID, 'en'),
  );
}

describe('the versions sample', () => {
  it('puts the text and every copy under the writing folder', () => {
    const paths = versionsSample(NOW, 'Tekstovi').map((file) => file.path);

    assert.equal(paths[0], 'Tekstovi/Versions sample.txt');
    assert.ok(
      paths.slice(1).every((path) => path.startsWith('Tekstovi/Verzije/Versions sample/')),
      paths.join('\n'),
    );
  });

  it('hides the copy that matches the text, and shows the rest', () => {
    assert.equal(versionsSample(NOW, 'Tekstovi').length, 8, 'one text and seven copies');
    assert.equal(rows().length, 6);
  });

  it('shows one that is longer and has a paragraph to give back', () => {
    const row = rows()[0];

    assert.ok(row?.size.includes('more than now'), row?.size ?? 'no row');
    assert.ok(row?.added?.startsWith('Extra: “X.'), row?.added ?? 'no added line');
    assert.equal(row?.missing, null);
  });

  it('shows one that is shorter with nothing to give back', () => {
    const row = rows()[1];

    assert.ok(row?.size.includes('fewer than now'), row?.size ?? 'no row');
    assert.equal(row?.added, null);
    assert.ok(row?.missing?.startsWith('Missing: “C.'), row?.missing ?? 'no missing line');
  });

  it('shows one that differs in both directions at once', () => {
    const row = rows()[2];

    assert.ok(row?.added?.startsWith('Extra: “X.'), row?.added ?? 'no added line');
    assert.ok(row?.missing?.startsWith('Missing: “B.'), row?.missing ?? 'no missing line');
  });

  it('shows one that opened under a different title', () => {
    const row = rows()[3];

    assert.equal(row?.wasCalled, 'Was called: “Staro ime”');
    assert.ok(row?.added?.startsWith('Extra: “Y.'), row?.added ?? 'no added line');
  });

  it('shows one of the same length that is not the same writing', () => {
    const row = rows()[4];

    assert.ok(!row?.size.includes('('), `the count alone, with no comparison: ${row?.size}`);
    assert.ok(row?.added?.startsWith('Extra: “C. Ali'), row?.added ?? 'no added line');
    assert.ok(row?.missing?.startsWith('Missing: “C. I'), row?.missing ?? 'no missing line');
  });

  it('shows one he rewrote outright, which marks no paragraphs either way', () => {
    const row = rows()[5];

    assert.equal(row?.added, null);
    assert.equal(row?.missing, null);
  });
});

describe('placing the samples more than once', () => {
  const stored = (file: { text: string; updatedAt: number }) => file;
  const place = (files: ReadonlyMap<string, { text: string; updatedAt: number }>, when: number) =>
    withSamplesPlaced(
      files,
      [{ id: SAMPLE_ID, files: versionsSample(when, 'Tekstovi') }],
      'Tekstovi',
      stored,
    );

  it('does not breed a fresh set of copies on every start', () => {
    // It did. The ages are counted from now, so the filenames differ each time,
    // and the browser ended up showing twenty-four rows of six.
    const once = place(new Map(), NOW);
    const twice = place(once, NOW + 42 * 60_000);

    assert.equal(twice.size, once.size);
  });

  it('leaves everything that is not its own alone', () => {
    const his = new Map([['Tekstovi/Njegov tekst.txt', { text: 'Njegovo.', updatedAt: 1 }]]);

    assert.equal(place(his, NOW).get('Tekstovi/Njegov tekst.txt')?.text, 'Njegovo.');
  });
});
