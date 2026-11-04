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

  it('keeps his lines inside a reworded paragraph, rather than running them together', () => {
    const lines = ['change in resoph', '2nd change in resoph', '3rd change in resoph'];
    const diff = diffParagraphs(
      joined('N', [...lines, '!!!!! next day change in resoph'].join('\n')),
      joined('N', lines.join('\n')),
    );
    const one = diff.pieces[1];

    assert.equal(one?.kind, 'changed');
    const words = one?.kind === 'changed' ? one.words : [];
    assert.deepEqual(
      words.filter((word) => word.kind === 'same').map((word) => word.text).join(' '),
      'change in resoph \n 2nd change in resoph \n 3rd change in resoph',
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

describe('finding the alignment', () => {
  /** The length of the longest common subsequence, worked out the slow, obvious way. */
  function mostInCommon(from: readonly string[], to: readonly string[]): number {
    let row = new Array<number>(to.length + 1).fill(0);
    for (const item of from) {
      const next = [0];
      to.forEach((other, at) => {
        next.push(item === other ? (row[at] ?? 0) + 1 : Math.max(row[at + 1] ?? 0, next[at] ?? 0));
      });
      row = next;
    }
    return row.at(-1) ?? 0;
  }

  /** Mulberry32, so a failure here is the same failure on the next run. */
  function randomFrom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('keeps as much in common as any alignment could, and loses nothing from either side', () => {
    const random = randomFrom(20261104);
    const paragraphs = (length: number): string[] =>
      Array.from({ length }, () => 'abcde'[Math.floor(random() * 5)] ?? 'a');
    let compared = 0;

    for (let round = 0; round < 500; round += 1) {
      const [from, to] = [paragraphs(Math.floor(random() * 14)), paragraphs(Math.floor(random() * 14))];
      const { pieces, unrelated } = diffParagraphs(from.join('\n\n'), to.join('\n\n'));
      if (unrelated) continue;
      compared += 1;

      const on = (...kinds: string[]): string[] =>
        pieces.filter((piece) => kinds.includes(piece.kind)).map((piece) => piece.text);
      assert.deepEqual(on('same', 'added'), from);
      assert.deepEqual(on('same', 'missing'), to);
      assert.equal(on('same').length, mostInCommon(from, to));
    }
    assert.ok(compared > 300, `only ${compared} rounds compared anything`);
  });

  /** A paragraph of this many words, none repeating often enough to line up by chance. */
  const wordsOfLength = (count: number): string[] =>
    Array.from({ length: count }, (_, at) => `rijec${at % 97}`);
  const changedWords = (was: string[], now: string[]) => {
    const one = diffParagraphs(joined('N', was.join(' ')), joined('N', now.join(' '))).pieces[1];
    assert.equal(one?.kind, 'changed');
    return one?.kind === 'changed' ? one.words.filter((word) => word.kind !== 'same') : [];
  };

  it('finds one word changed in a paragraph of sixty thousand', () => {
    const was = wordsOfLength(60_000);
    const now = was.with(30_000, 'novo');

    assert.deepEqual(changedWords(was, now), [
      { kind: 'added', text: was[30_000] },
      { kind: 'missing', text: 'novo' },
    ]);
  });

  it('finds a proofreader\'s changes scattered through a paragraph of sixty thousand', () => {
    const was = wordsOfLength(60_000);
    const now = was.map((word, at) => (at % 200 === 100 ? 'novo' : word));

    assert.equal(changedWords(was, now).length, 600);
  });

  it('stops looking after thousands of differences, where nothing can be matched with confidence', () => {
    // Most of it still matches, so without the limit this would be one paragraph
    // changed. Every word repeats, so there is nothing to divide it at. What the
    // limit protects is a machine with less memory than this one.
    const was = wordsOfLength(24_000);
    const now = was.map((word, at) => (at % 8 === 0 ? 'novo' : word));

    const kinds = diffParagraphs(joined('N', was.join(' ')), joined('N', now.join(' '))).pieces.map(
      (piece) => piece.kind,
    );

    assert.deepEqual(kinds, ['same', 'added', 'missing']);
  });

  it('goes on past that limit where words it can be sure of divide the paragraph', () => {
    const was = Array.from({ length: 24_000 }, (_, at) => `w${at}`);
    const now = was.map((word, at) => (at % 8 === 0 ? `n${at}` : word));

    assert.equal(changedWords(was, now).length, 6000);
  });

  it('calls two long paragraphs with nothing to do with each other replaced, rather than running out of memory', () => {
    const was = Array.from({ length: 30_000 }, (_, at) => `a${at}`);
    const now = Array.from({ length: 30_000 }, (_, at) => `b${at}`);

    const kinds = diffParagraphs(joined('N', was.join(' ')), joined('N', now.join(' '))).pieces.map(
      (piece) => piece.kind,
    );

    assert.deepEqual(kinds, ['same', 'added', 'missing']);
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
