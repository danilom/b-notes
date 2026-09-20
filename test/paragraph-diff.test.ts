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

  const OPENING = 'Bilo je hladno te zime i sjedili smo oko peci cijelo vece,';

  it('calls a paragraph he reworded one paragraph changed, not two swapped', () => {
    const was = joined('Naslov', `${OPENING} dok je napolju padao snijeg.`);
    const now = joined('Naslov', `${OPENING} a niko nije govorio nista.`);

    assert.deepEqual(shown(was, now), [
      'same Naslov',
      `changed ${OPENING} dok je napolju padao snijeg.`,
    ]);
  });

  it('marks which words changed inside it, and leaves the rest alone', () => {
    const diff = diffParagraphs(
      joined('N', `${OPENING} dok je padao snijeg.`),
      joined('N', `${OPENING} dok je padala kisa.`),
    );
    const one = diff.pieces[1];

    assert.equal(one?.kind, 'changed');
    assert.deepEqual(
      one?.kind === 'changed' ? one.words.filter((word) => word.kind !== 'same') : [],
      [
        { kind: 'added', text: 'padao' },
        { kind: 'added', text: 'snijeg.' },
        { kind: 'missing', text: 'padala' },
        { kind: 'missing', text: 'kisa.' },
      ],
    );
  });

  it('leaves short paragraphs alone, where half the words is one word', () => {
    // Two words each: one match is fifty per cent, and "reworded" would be a
    // worse account of them than "replaced".
    const kinds = shown(joined('N', 'Stari pasus.'), joined('N', 'Novi pasus.')).map(
      (piece) => piece.split(' ')[0],
    );

    assert.deepEqual(kinds, ['same', 'added', 'missing']);
  });

  it('leaves two unrelated paragraphs as two, rather than making confetti of them', () => {
    // Below the bar the word comparison stops informing: the little words match
    // across sentences that have nothing to do with each other.
    const was = joined('Naslov', 'Pada sneg nad gradom i nad rekom.');
    const now = joined('Naslov', 'Otputovao je u Beograd na tri dana.');

    assert.deepEqual(shown(was, now).map((piece) => piece.split(' ')[0]), ['same', 'added', 'missing']);
  });

  it('leaves two rewordings side by side alone, since which goes with which is a guess', () => {
    const was = joined('N', 'Prvi pasus o zimi.', 'Drugi pasus o letu.');
    const now = joined('N', 'Prvi pasus o jeseni.', 'Drugi pasus o prolecu.');

    const kinds = shown(was, now).map((piece) => piece.split(' ')[0]);

    assert.equal(kinds.filter((kind) => kind === 'changed').length, 0);
    assert.equal(kinds.filter((kind) => kind === 'added').length, 2);
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

    assert.deepEqual(
      runs.map((run) => [run.kind, run.pieces.map((piece) => piece.text)]),
      [
        ['same', ['A']],
        ['added', ['B', 'C']],
        ['missing', ['D']],
      ],
    );
  });

  it('gives nothing back for nothing', () => {
    assert.deepEqual(runsOf([]), []);
  });
});
