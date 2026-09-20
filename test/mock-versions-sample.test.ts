import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SAMPLE_ID, SAMPLE_TEXT, versionsSample } from '../src/hosts/mockup/mock-versions-sample.ts';
import { diffParagraphs } from '../src/notes/paragraph-diff.ts';
import { describeVersion, versionsWorthShowing } from '../src/ui/version-row.ts';

/*
  A fixture that has quietly stopped showing what it was built to show is worse
  than no fixture: it is looked at instead of the thing it stands for. These
  assert that each copy still shows the diff it is in the sample for.
*/

const NOW = Date.parse('2026-09-20T12:00:00');

/** The sample's copies, in the order the index lists them: newest first. */
function copies() {
  const versions = versionsSample(NOW, 'Tekstovi')
    .filter((file) => file.path.includes('/Verzije/'))
    .map((file) => ({ id: file.path, takenAt: file.updatedAt, text: file.text }))
    .sort((first, second) => second.takenAt - first.takenAt);

  return versionsWorthShowing(versions, SAMPLE_TEXT);
}

/** What the preview draws for one of them, as kinds and their first words. */
function marked(at: number) {
  const version = copies()[at];
  const diff = diffParagraphs(version?.text ?? '', SAMPLE_TEXT);
  return {
    unrelated: diff.unrelated,
    added: diff.pieces.filter((piece) => piece.kind === 'added').map((piece) => piece.text),
    missing: diff.pieces.filter((piece) => piece.kind === 'missing').map((piece) => piece.text),
    row: describeVersion(
      {
        version: version ?? { id: '', takenAt: 0, text: '' },
        current: SAMPLE_TEXT,
        currentTitle: SAMPLE_ID,
        at: { row: at + 1, of: copies().length },
      },
      'en',
    ),
  };
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
    assert.equal(copies().length, 6);
  });

  it('shows one that is longer and has a paragraph to give back', () => {
    const { added, missing, row } = marked(0);

    assert.equal(row.note, '15 words more than now');
    assert.ok(added[0]?.startsWith('X.'), added[0] ?? 'nothing added');
    assert.deepEqual(missing, []);
  });

  it('shows one that is shorter with nothing to give back', () => {
    const { added, missing, row } = marked(1);

    assert.ok(row.note?.endsWith('fewer than now'), row.note ?? 'no note');
    assert.deepEqual(added, []);
    assert.ok(missing[0]?.startsWith('C.'), missing[0] ?? 'nothing missing');
  });

  it('shows one that differs in both directions at once', () => {
    const { added, missing } = marked(2);

    assert.ok(added[0]?.startsWith('X.'), added[0] ?? 'nothing added');
    assert.ok(missing[0]?.startsWith('B.'), missing[0] ?? 'nothing missing');
  });

  it('shows one that opened under a different title', () => {
    const { added, row } = marked(3);

    assert.equal(row.note, 'Was called: “Staro ime”', 'the old name takes the second line');
    assert.ok(added.some((text) => text.startsWith('Y.')), added.join(' | '));
  });

  it('shows one of the same length that is not the same writing', () => {
    const { added, missing, row } = marked(4);

    assert.equal(row.note, null, 'no comparison to draw, so the line is left off');
    assert.ok(added[0]?.startsWith('C. Ali'), added[0] ?? 'nothing added');
    assert.ok(missing[0]?.startsWith('C. I'), missing[0] ?? 'nothing missing');
  });

  it('shows one he rewrote outright, which marks no paragraphs either way', () => {
    const { added, missing, unrelated } = marked(5);

    assert.equal(unrelated, true);
    assert.deepEqual([added, missing], [[], []]);
  });
});
