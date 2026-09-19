import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffParagraphs, runsOf } from '../src/notes/paragraph-diff.ts';

const joined = (...paragraphs: string[]) => paragraphs.join('\n\n');
const shown = (copy: string, active: string) =>
  diffParagraphs(copy, active).pieces.map((piece) => `${piece.kind} ${piece.text}`);

describe('comparing a copy with the active text', () => {
  it('says nothing about a text that has not changed', () => {
    const text = joined('Naslov', 'Prvi.', 'Drugi.');

    assert.deepEqual(shown(text, text), ['same Naslov', 'same Prvi.', 'same Drugi.']);
  });

  it('marks a paragraph he has since cut as one the copy would give back', () => {
    const was = joined('Naslov', 'Prvi.', 'Drugi.');
    const now = joined('Naslov', 'Drugi.');

    assert.deepEqual(shown(was, now), ['same Naslov', 'added Prvi.', 'same Drugi.']);
  });

  it('marks a paragraph he has written since as one bringing the copy back would cost', () => {
    const was = joined('Naslov', 'Prvi.');
    const now = joined('Naslov', 'Prvi.', 'Novi.');

    assert.deepEqual(shown(was, now), ['same Naslov', 'same Prvi.', 'missing Novi.']);
  });

  it('puts what went and what arrived where they belong, not in two heaps', () => {
    // The whole reason for a diff rather than two lists: he has to be able to
    // see that this paragraph replaced that one.
    const was = joined('Naslov', 'Stari.', 'Kraj.');
    const now = joined('Naslov', 'Novi.', 'Kraj.');

    assert.deepEqual(shown(was, now), ['same Naslov', 'added Stari.', 'missing Novi.', 'same Kraj.']);
  });

  it('reports a paragraph he reworded as replaced, which at this grain it is', () => {
    const was = joined('Naslov', 'Bilo je hladno te zime.');
    const now = joined('Naslov', 'Bilo je hladno te godine.');

    assert.deepEqual(shown(was, now), [
      'same Naslov',
      'added Bilo je hladno te zime.',
      'missing Bilo je hladno te godine.',
    ]);
  });

  it('follows a paragraph he moved, rather than calling everything between it changed', () => {
    const was = joined('Naslov', 'A.', 'B.', 'C.', 'D.');
    const now = joined('Naslov', 'B.', 'C.', 'D.', 'A.');

    const pieces = shown(was, now);

    assert.deepEqual(pieces.filter((piece) => piece.startsWith('same')), [
      'same Naslov',
      'same B.',
      'same C.',
      'same D.',
    ]);
    assert.deepEqual(pieces.filter((piece) => !piece.startsWith('same')), ['added A.', 'missing A.']);
  });

  it('marks nothing when the two share no paragraph, and says so', () => {
    const diff = diffParagraphs(joined('Prvi.', 'Drugi.'), 'Sasvim drugi tekst.');

    assert.equal(diff.unrelated, true);
    assert.deepEqual(diff.pieces.map((piece) => piece.kind), ['same', 'same']);
  });

  it('marks nothing for the one text in nine that is a single unbroken block', () => {
    const diff = diffParagraphs('Jedan dugačak pasus, bez praznih redova.', 'Drugačiji dugačak pasus.');

    assert.equal(diff.unrelated, true);
  });

  it('leaves the blank runs between his paragraphs out of it', () => {
    const diff = diffParagraphs(joined('Naslov', '', '   ', 'Prvi.'), joined('Naslov', 'Prvi.'));

    assert.deepEqual(diff.pieces.map((piece) => piece.text), ['Naslov', 'Prvi.']);
  });
});

describe('grouping the paragraphs a label covers', () => {
  it('labels a run of six once rather than six times', () => {
    const runs = runsOf([
      { kind: 'same', text: 'A' },
      { kind: 'added', text: 'B' },
      { kind: 'added', text: 'C' },
      { kind: 'missing', text: 'D' },
    ]);

    assert.deepEqual(runs, [
      { kind: 'same', paragraphs: ['A'] },
      { kind: 'added', paragraphs: ['B', 'C'] },
      { kind: 'missing', paragraphs: ['D'] },
    ]);
  });

  it('gives nothing back for nothing', () => {
    assert.deepEqual(runsOf([]), []);
  });
});
