import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type TextPiece,
  diffTexts,
  mergeCloseChanges,
  paragraphsOf,
  separateTidying,
  tidiedLettersOf,
} from '../src/notes/text-diff.ts';

const changesIn = (pieces: readonly TextPiece[]): [string, string][] =>
  pieces.flatMap((piece) => (piece.kind === 'change' ? [[piece.removed, piece.added] as [string, string]] : []));

const side = (pieces: readonly TextPiece[], which: 'removed' | 'added'): string =>
  pieces.map((piece) => (piece.kind === 'same' ? piece.text : piece[which])).join('');

/** Two ways of storing a text that show the same on screen, made one. */
const storedAlike = (text: string): string => text.replace(/\r\n?/g, '\n').normalize('NFC');

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
        assert.equal(storedAlike(side(shown, 'added')), storedAlike(after));
      }
    }
  });

  it('sees no change in how a text ends its lines', () => {
    const windows = 'Prvi red\r\nDrugi red\r\n\r\nNovi pasus.';

    assert.deepEqual(diffTexts(windows, windows.replaceAll('\r\n', '\n')), [{ kind: 'same', text: windows }]);
    assert.deepEqual(changesIn(diffTexts(windows.replaceAll('\r\n', '\n'), windows)), []);
  });

  it('keeps the line endings he has, around a change that is real', () => {
    const pieces = diffTexts('Prvi stari\r\nDrugi red', 'Prvi novi\nDrugi red');

    assert.deepEqual(changesIn(pieces), [['stari', 'novi']]);
    assert.equal(side(pieces, 'added'), 'Prvi novi\r\nDrugi red');
  });

  it('sees no change in how a letter is spelled underneath', () => {
    const [together, apart] = ['Čuvala je čovjek.', 'Čuvala je čovjek.'.normalize('NFD')];

    assert.notEqual(together, apart);
    assert.deepEqual(diffTexts(apart, together), [{ kind: 'same', text: apart }]);
  });

  it('finds thousands of small changes through a long text, and does not call it replaced', () => {
    const words = Array.from({ length: 60_001 }, (_, at) => `rijec${at}`);
    const edited = words.map((word, at) => (at % 4 === 0 ? `novo${at}` : word));
    const [before, after] = [words.join(' '), edited.join(' ')];

    const pieces = diffTexts(before, after);

    assert.equal(changesIn(pieces).length, 15_001);
    // Ending on a change, so that nothing can be lost off the end unnoticed.
    assert.equal(side(pieces, 'removed'), before);
    assert.equal(side(pieces, 'added'), after);
  });

  it('calls only the stretch replaced where nothing in it can be matched, past the limit', () => {
    const keptStart = Array.from({ length: 300 }, (_, at) => `pocetak${at}`).join(' ');
    const keptEnd = Array.from({ length: 300 }, (_, at) => `kraj${at}`).join(' ');
    const [was, now] = ['a', 'b'].map((letter) =>
      Array.from({ length: 6000 }, (_, at) => `${letter}${at}`).join(' '),
    );

    const changes = changesIn(diffTexts(`${keptStart} ${was} ${keptEnd}`, `${keptStart} ${now} ${keptEnd}`));

    assert.ok(changes.length > 0 && changes.length < 7000, `${changes.length} changes`);
    assert.ok(changes.every(([removed]) => !removed.includes('pocetak') && !removed.includes('kraj')));
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

  it('finds the paragraphs in a text with Windows line endings', () => {
    assert.deepEqual(drawn('Prvi.\r\n\r\nDrugi stari.', 'Prvi.\n\nDrugi novi.'), ['  Prvi.', '| Drugi [-stari][+novi].']);
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

describe('setting apart the changes nobody needs to read', () => {
  /** What is left for him to read, once the tidying is set aside. */
  const left = (before: string, after: string): [string, string][] =>
    changesIn(separateTidying(diffTexts(before, after), { lineBreaks: false }));
  const isHidden = (before: string, after: string): boolean => left(before, after).length === 0;

  it('sets apart a plain letter gaining its diacritic', () => {
    assert.ok(isHidden('Cuvala je kucu i zenu, sumu i dedu.', 'Čuvala je kuću i ženu, šumu i dedu.'));
    assert.ok(isHidden('Dorde je tu.', 'Đorđe je tu.'));
  });

  it('keeps a letter losing its diacritic in front of him', () => {
    assert.deepEqual(left('Čuvala je kuću.', 'Cuvala je kuću.'), [['Čuvala', 'Cuvala']]);
  });

  it('keeps one diacritic becoming another in front of him', () => {
    assert.deepEqual(left('Kuča je tu.', 'Kuća je tu.'), [['Kuča', 'Kuća']]);
  });

  it('keeps a different letter in front of him, even in a word that gains a diacritic', () => {
    assert.deepEqual(left('Zena je tu.', 'Žane je tu.'), [['Zena', 'Žane']]);
  });

  it('sets apart one run of spacing becoming another', () => {
    assert.ok(isHidden('Pao  je   snijeg.', 'Pao je snijeg.'));
    assert.ok(isHidden('Prvi.  \n\n\nDrugi.', 'Prvi.\n\nDrugi.'));
  });

  it('keeps a paragraph split or joined in front of him', () => {
    assert.deepEqual(left('Prvi. Drugi.', 'Prvi.\n\nDrugi.'), [[' ', '\n\n']]);
    assert.deepEqual(left('Prvi.\n\nDrugi.', 'Prvi. Drugi.'), [['\n\n', ' ']]);
  });

  it('keeps a space between words appearing or going in front of him', () => {
    assert.deepEqual(left('Rekao,da je.', 'Rekao, da je.'), [['', ' ']]);
    assert.ok(!isHidden('Na primer tu.', 'Naprimer tu.'));
  });

  it('keeps the leading spaces that rank his titles in front of him', () => {
    assert.deepEqual(left('   Pismo Marku', 'Pismo Marku'), [['   ', '']]);
    assert.deepEqual(left('Pismo Marku', '   Pismo Marku'), [['', '   ']]);
  });

  it('keeps punctuation in front of him', () => {
    assert.deepEqual(left('Ispod kreveta i dalje.', 'Ispod kreveta, i dalje.'), [['', ',']]);
  });

  it('keeps the wording in front of him, among any amount of tidying', () => {
    assert.deepEqual(left('Cuvala  je  staru kucu.', 'Čuvala je novu kuću.'), [['staru', 'novu']]);
  });

  it('still joins back into exactly either text', () => {
    const [before, after] = ['Cuvala  je  staru\nkucu.', 'Čuvala je novu kuću.'];
    const pieces = mergeCloseChanges(separateTidying(diffTexts(before, after), { lineBreaks: true }));

    assert.equal(side(pieces, 'removed'), before);
    assert.equal(side(pieces, 'added'), after);
  });

  it('keeps a line break inside a paragraph in front of him, unless told it is tidying', () => {
    const pieces = diffTexts('Prvi red\nDrugi red', 'Prvi red Drugi red');

    assert.equal(changesIn(separateTidying(pieces, { lineBreaks: false })).length, 1);
    assert.equal(changesIn(separateTidying(pieces, { lineBreaks: true })).length, 0);
  });

  it('keeps a line break that arrives in front of him too', () => {
    const pieces = diffTexts('Prvi red Drugi red', 'Prvi red\nDrugi red');

    assert.equal(changesIn(separateTidying(pieces, { lineBreaks: false })).length, 1);
    assert.equal(changesIn(separateTidying(pieces, { lineBreaks: true })).length, 0);
  });

  it('never calls a paragraph break tidying, whatever it is told about line breaks', () => {
    const pieces = diffTexts('Prvi red Drugi red', 'Prvi red\n\nDrugi red');

    assert.equal(changesIn(separateTidying(pieces, { lineBreaks: true })).length, 1);
  });

  it('keeps a diacritic in front of him on a word the text spells both ways', () => {
    assert.deepEqual(left('Sto si dosao? Bilo je sto ljudi.', 'Što si došao? Bilo je sto ljudi.'), [['Sto', 'Što']]);
  });

  it('keeps both in front of him when a word is restored two different ways', () => {
    assert.deepEqual(left('Cak je tu. Cak je tamo.', 'Čak je tu. Ćak je tamo.'), [
      ['Cak', 'Čak'],
      ['Cak', 'Ćak'],
    ]);
  });

  it('does not take a word at the start of a sentence for another spelling', () => {
    assert.ok(isHidden('Cuvala je. Pa cuvala opet.', 'Čuvala je. Pa čuvala opet.'));
  });

  it('cannot tell when a word comes out only one way, even wrongly', () => {
    // Recorded rather than wanted: this is the limit of having no dictionary.
    assert.ok(isHidden('Nas pas je tu.', 'Naš paš je tu.'));
  });

  it('draws what is set apart as it would be, with no mark and no bar', () => {
    const paragraphs = paragraphsOf(separateTidying(diffTexts('Cuvala  je.\n\nSumu.', 'Čuvala je.\n\nŠumu.'), { lineBreaks: false }));

    assert.deepEqual(
      paragraphs.map(({ changed, parts }) => [changed, parts.map((part) => part.text).join('')]),
      [
        [false, 'Čuvala je.'],
        [false, 'Šumu.'],
      ],
    );
  });
});

describe('telling which letters of a tidied word changed', () => {
  it('singles out only the letters that changed', () => {
    assert.deepEqual(tidiedLettersOf({ removed: 'cuvala', added: 'čuvala' }), [
      { text: 'č', changed: true },
      { text: 'uvala', changed: false },
    ]);
    assert.deepEqual(tidiedLettersOf({ removed: 'kuca', added: 'kuća' }), [
      { text: 'ku', changed: false },
      { text: 'ć', changed: true },
      { text: 'a', changed: false },
    ]);
  });

  it('holds neighbouring changed letters together', () => {
    assert.deepEqual(tidiedLettersOf({ removed: 'sc', added: 'šć' }), [{ text: 'šć', changed: true }]);
  });

  it('is not misled by a letter spelled as two underneath', () => {
    assert.deepEqual(tidiedLettersOf({ removed: 'kuca', added: 'kuc\u0301a' }), [
      { text: 'ku', changed: false },
      { text: 'ć', changed: true },
      { text: 'a', changed: false },
    ]);
  });

  it('singles out nothing where the two do not line up', () => {
    assert.deepEqual(tidiedLettersOf({ removed: 'abc', added: 'ab' }), [{ text: 'ab', changed: false }]);
    assert.deepEqual(tidiedLettersOf({ removed: 'ab', added: 'abc' }), [{ text: 'abc', changed: false }]);
  });
});

describe('laying out what was tidied, when it is to be seen', () => {
  const tidied = (before: string, after: string) =>
    paragraphsOf(separateTidying(diffTexts(before, after), { lineBreaks: false }), { showTidied: true });

  it('gives a tidied word a part of its own, knowing what it was', () => {
    const [paragraph] = tidied('Tu je sumu vidio.', 'Tu je šumu vidio.');

    assert.deepEqual(paragraph?.parts.find((part) => part.kind === 'tidied'), {
      kind: 'tidied',
      text: 'šumu',
      was: 'sumu',
      opensChange: false,
    });
  });

  it('does not count it as the paragraph having changed', () => {
    assert.deepEqual(tidied('Tu je sumu vidio.', 'Tu je šumu vidio.').map((paragraph) => paragraph.changed), [false]);
  });

  it('shows spacing as nothing but spacing', () => {
    const [paragraph] = tidied('Pao  je.', 'Pao je.');

    assert.deepEqual(paragraph?.parts.map((part) => part.kind), ['same', 'same', 'same']);
    assert.equal(paragraph?.parts.map((part) => part.text).join(''), 'Pao je.');
  });
});

describe('joining changes that sit close together', () => {
  const same = (text: string): TextPiece => ({ kind: 'same', text });
  const change = (removed: string, added: string): TextPiece => ({ kind: 'change', removed, added });
  const tidy = (removed: string, added: string): TextPiece => ({ kind: 'tidy', removed, added });

  it('joins across tidying that lies between, as part of the stretch', () => {
    const pieces = [change('stara kuća', 'nova zgrada'), same(' '), tidy('i', 'ž'), same(' '), change('pala tu', 'stoji tu')];

    assert.deepEqual(mergeCloseChanges(pieces), [change('stara kuća i pala tu', 'nova zgrada ž stoji tu')]);
  });

  it('measures the whole stretch, tidying and all, against the changes beside it', () => {
    const pieces = [change('aa', 'bb'), same('x'), tidy('s', 'š'), same('x'), change('cc', 'dd')];

    assert.deepEqual(mergeCloseChanges(pieces), pieces);
  });

  it('never joins across tidying that holds a line break', () => {
    const pieces = [change('stara', 'nova'), tidy('\n', ' '), change('kuća', 'zgrada')];

    assert.deepEqual(mergeCloseChanges(pieces), pieces);
  });

  it('leaves tidying alone where no change stands on either side of it', () => {
    const pieces = [tidy('s', 'š'), same(' '), tidy('c', 'č')];

    assert.deepEqual(mergeCloseChanges(pieces), pieces);
  });

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

  it('never joins a change that itself holds a line break to the one beside it', () => {
    const before = [change('  \n\n\n', '\n\n'), same('16. '), change('Kuca', 'Kuća')];
    const after = [change('Kuca', 'Kuća'), same('a'), change('\n', '\n\n')];

    assert.deepEqual(mergeCloseChanges(before), before);
    assert.deepEqual(mergeCloseChanges(after), after);
  });

  it('counts a line break on either side of a change', () => {
    const goneOnly = [change('stara\n', 'nova'), same('x'), change('kuća', 'zgrada')];
    const arrivedOnly = [change('stara', 'nova\n'), same('x'), change('kuća', 'zgrada')];

    assert.deepEqual(mergeCloseChanges(goneOnly), goneOnly);
    assert.deepEqual(mergeCloseChanges(arrivedOnly), arrivedOnly);
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
