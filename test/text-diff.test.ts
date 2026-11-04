import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type TextPiece, diffTexts, mergeCloseChanges, paragraphsOf } from '../src/notes/text-diff.ts';

const changesIn = (pieces: readonly TextPiece[]): [string, string][] =>
  pieces.flatMap((piece) => (piece.kind === 'change' ? [[piece.removed, piece.added] as [string, string]] : []));

const side = (pieces: readonly TextPiece[], which: 'removed' | 'added'): string =>
  pieces.map((piece) => (piece.kind === 'same' ? piece.text : piece[which])).join('');

const OPENING = 'Bilo je hladno te zime i sjedili smo oko peci.';

describe('comparing two texts', () => {
  it('finds one word changed in a single unbroken block', () => {
    assert.deepEqual(changesIn(diffTexts(`${OPENING} Pao je snijeg.`, `${OPENING} Pala je kiša.`)), [
      ['Pao', 'Pala'],
      ['snijeg', 'kiša'],
    ]);
  });

  it('finds the word changed in every paragraph, when no paragraph came through untouched', () => {
    assert.deepEqual(changesIn(diffTexts('Prvi stari pasus.\n\nDrugi stari pasus.', 'Prvi novi pasus.\n\nDrugi novi pasus.')), [
      ['stari', 'novi'],
      ['stari', 'novi'],
    ]);
  });

  it('finds a word changed in a short paragraph', () => {
    assert.deepEqual(changesIn(diffTexts('Niko nije došao.', 'Niko nije stigao.')), [['došao', 'stigao']]);
  });

  it('marks a comma and not the word beside it', () => {
    assert.deepEqual(changesIn(diffTexts('Ispod kreveta i dalje.', 'Ispod kreveta, i dalje.')), [['', ',']]);
  });

  it('keeps a letter with diacritics inside its word', () => {
    assert.deepEqual(changesIn(diffTexts('Čuvao je čovjek.', 'Čuvao je čovječe.')), [['čovjek', 'čovječe']]);
  });

  it('keeps a combining mark inside its word', () => {
    // Only the end of the word differs, so a word split at the mark would come
    // back with its first letter left out of the change.
    const [was, now] = ['čuvao', 'čuvala'];

    assert.deepEqual(changesIn(diffTexts(`Tada ${was} kuću.`, `Tada ${now} kuću.`)), [[was, now]]);
  });

  it('reports a change of spaces, which is a change', () => {
    assert.deepEqual(changesIn(diffTexts('Pao  je snijeg.', 'Pao je snijeg.')), [['  ', ' ']]);
  });

  it('reports a paragraph split in two as nothing but the break', () => {
    assert.deepEqual(changesIn(diffTexts('Prvi dio. Drugi dio.', 'Prvi dio.\n\nDrugi dio.')), [[' ', '\n\n']]);
  });

  it('holds what was removed and what was added at one place as one change', () => {
    assert.deepEqual(changesIn(diffTexts('Stara kuća stoji.', 'Nova zgrada stoji.')), [['Stara', 'Nova'], ['kuća', 'zgrada']]);
    assert.deepEqual(changesIn(diffTexts('a b', 'a,b')), [[' ', ',']]);
  });

  it('says nothing about two texts that are the same', () => {
    assert.deepEqual(diffTexts(OPENING, OPENING), [{ kind: 'same', text: OPENING }]);
  });

  it('gives nothing back for nothing', () => {
    assert.deepEqual(diffTexts('', ''), []);
  });

  it('reports a whole text arriving in an empty one, and going from one', () => {
    assert.deepEqual(diffTexts('', OPENING), [{ kind: 'change', removed: '', added: OPENING }]);
    assert.deepEqual(diffTexts(OPENING, ''), [{ kind: 'change', removed: OPENING, added: '' }]);
  });

  /*
    What accepting one change and not another would rest on. A diff that lost a
    character here would still look right on screen, and take the character out
    of his text the moment a change was applied.
  */
  it('can be joined back into exactly either text, whatever is in them, merged or not', () => {
    let state = 20261104;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
    const parts = ['kuća', 'šđžčć', ' ', '  ', '\t', '\n', '\n\n', '\r\n', ',', '.', '…', '—', '%2A', 'a1', '😀', 'č', '\uD83D', ' ', '[b-notes]'];
    const text = (): string =>
      Array.from({ length: Math.floor(random() * 30) }, () => parts[Math.floor(random() * parts.length)] ?? '').join('');

    for (let round = 0; round < 2000; round += 1) {
      const [before, after] = [text(), text()];
      const pieces = diffTexts(before, after);

      for (const shown of [pieces, mergeCloseChanges(pieces)]) {
        assert.equal(side(shown, 'removed'), before);
        assert.equal(side(shown, 'added'), after);
      }
    }
  });
});

describe('laying the comparison out as paragraphs', () => {
  /** Each paragraph as whether it is marked, and its text with the changes bracketed. */
  const drawn = (before: string, after: string): string[] =>
    paragraphsOf(diffTexts(before, after)).map(
      ({ changed, parts }) =>
        (changed ? '| ' : '  ') +
        parts
          .map(({ kind, text }) => (kind === 'same' ? text : kind === 'removed' ? `[-${text}]` : `[+${text}]`))
          .join(''),
    );
  const opening = (before: string, after: string): number =>
    paragraphsOf(diffTexts(before, after))
      .flatMap((paragraph) => paragraph.parts)
      .filter((part) => part.opensChange).length;

  it('marks only the paragraph a word changed in', () => {
    assert.deepEqual(drawn('Prvi.\n\nDrugi stari.\n\nTreći.', 'Prvi.\n\nDrugi novi.\n\nTreći.'), [
      '  Prvi.',
      '| Drugi [-stari][+novi].',
      '  Treći.',
    ]);
  });

  it('marks nothing when nothing changed', () => {
    assert.deepEqual(drawn('Prvi.\n\nDrugi.', 'Prvi.\n\nDrugi.'), ['  Prvi.', '  Drugi.']);
  });

  it('marks both halves of a paragraph split in two, and keeps the break as a part', () => {
    assert.deepEqual(drawn('Prvi dio. Drugi dio.', 'Prvi dio.\n\nDrugi dio.'), [
      '| Prvi dio.[- ][+\n\n]',
      '| Drugi dio.',
    ]);
  });

  it('keeps two joined paragraphs as one, with the break it lost as a part', () => {
    assert.deepEqual(drawn('Prvi dio.\n\nDrugi dio.', 'Prvi dio. Drugi dio.'), [
      '| Prvi dio.[-\n\n][+ ]Drugi dio.',
    ]);
  });

  it('gives a paragraph that arrived its own mark, and leaves its neighbours alone', () => {
    assert.deepEqual(drawn('Prvi.\n\nTreći.', 'Prvi.\n\nNovi.\n\nTreći.'), ['  Prvi.', '| [+Novi.]', '  Treći.']);
  });

  it('gives a paragraph that went its own mark, and leaves its neighbours alone', () => {
    assert.deepEqual(drawn('Prvi.\n\nStari.\n\nTreći.', 'Prvi.\n\nTreći.'), ['  Prvi.', '| [-Stari.]', '  Treći.']);
  });

  it('keeps a line break inside a paragraph as his, rather than as a new paragraph', () => {
    assert.deepEqual(drawn('Prvi red\nDrugi stari', 'Prvi red\nDrugi novi'), ['| Prvi red\nDrugi [-stari][+novi]']);
  });

  it('treats a blank line with spaces on it as a blank line', () => {
    assert.deepEqual(drawn('Prvi.\n \t\nDrugi.', 'Prvi.\n \t\nDrugi.'), ['  Prvi.', '  Drugi.']);
  });

  it('counts each change once, however many paragraphs it runs across', () => {
    const before = 'Naslov.\n\nStari prvi.\n\nStari drugi.\n\nKraj.';

    assert.equal(opening(before, 'Naslov.\n\nKraj.'), 1);
    assert.equal(opening('A stari b.', 'A novi b.'), 1);
    assert.equal(opening('A stari b. C stari d. E f g h i j k l.', 'A novi b. C novi d. E f g h i j k l.'), 2);
  });

  it('draws nothing for nothing', () => {
    assert.deepEqual(drawn('', ''), []);
  });
});

describe('joining changes that sit close together', () => {
  const same = (text: string): TextPiece => ({ kind: 'same', text });
  const change = (removed: string, added: string): TextPiece => ({ kind: 'change', removed, added });

  it('reads a rewritten clause as the old one and then the new one', () => {
    const pieces = diffTexts('Tada je stara kuća pala u noći.', 'Tada je nova zgrada stajala u noći.');

    assert.deepEqual(changesIn(mergeCloseChanges(pieces)), [['stara kuća pala', 'nova zgrada stajala']]);
  });

  it('leaves one word changed in a sentence as one word', () => {
    const pieces = diffTexts(`${OPENING} Do kraja marta.`, `${OPENING} Do kraja aprila.`);

    assert.deepEqual(changesIn(mergeCloseChanges(pieces)), [['marta', 'aprila']]);
  });

  it('leaves two corrections apart when there is more to read between them than they change', () => {
    const pieces = diffTexts('Cuvala je svako pismo u kutiji ispod lose lampe.', 'Čuvala je svako pismo u kutiji ispod loše lampe.');

    assert.deepEqual(changesIn(mergeCloseChanges(pieces)), [['Cuvala', 'Čuvala'], ['lose', 'loše']]);
  });

  it('never joins across a line break, even a short one', () => {
    const pieces = [change('stara', 'nova'), same('\n'), change('kuća', 'zgrada')];

    assert.deepEqual(mergeCloseChanges(pieces), pieces);
  });

  it('never joins across a line break that has words beside it', () => {
    const pieces = [change('stara kuća', 'nova zgrada'), same('a\nb'), change('stara kuća', 'nova zgrada')];

    assert.deepEqual(mergeCloseChanges(pieces), pieces);
  });

  it('asks that both sides be big enough, not one', () => {
    const pieces = [change('dugačka riječ', 'druga riječ'), same('oko'), change('a', 'b')];

    assert.deepEqual(mergeCloseChanges(pieces), pieces);
    assert.deepEqual(mergeCloseChanges([...pieces].reverse()), [...pieces].reverse());
  });

  it('counts the longer side of a change, so a word removed outright has its full weight', () => {
    const pieces = [change('riječ', ''), same('oko'), change('', 'riječ')];

    assert.deepEqual(mergeCloseChanges(pieces), [change('riječoko', 'okoriječ')]);
  });

  it('goes back to absorb what a bigger change now can', () => {
    // The first stretch is too long for the small change beside it, until that
    // change has joined the large one on its other side.
    const pieces = [change('aaa', 'bbb'), same('xxx'), change('c', 'd'), same('y'), change('eee', 'fff')];

    assert.deepEqual(mergeCloseChanges(pieces), [change('aaaxxxcyeee', 'bbbxxxdyfff')]);
  });

  it('goes on to absorb what comes next with the change it has grown', () => {
    const pieces = [change('aaa', 'bbb'), same('y'), change('c', 'd'), same('xxx'), change('eee', 'fff')];

    assert.deepEqual(mergeCloseChanges(pieces), [change('aaaycxxxeee', 'bbbydxxxfff')]);
  });

  it('leaves a stretch longer than the changes beside it', () => {
    const pieces = [change('aa', 'bb'), same('xxx'), change('cc', 'dd')];

    assert.deepEqual(mergeCloseChanges(pieces), pieces);
  });

  it('joins across a stretch exactly as long as they are', () => {
    const pieces = [change('aa', 'bb'), same('xx'), change('cc', 'dd')];

    assert.deepEqual(mergeCloseChanges(pieces), [change('aaxxcc', 'bbxxdd')]);
  });
});
