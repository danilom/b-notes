import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSearchable } from '../src/language/diacritics.ts';
import { type Findable, foundGroups } from '../src/ui/search-results.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

interface Text extends Findable {
  name: string;
}

/** A text as the list holds it; long ago unless said otherwise. */
function text(title: string, body = '', updatedAt = NOW - 400 * DAY, code: string | null = null): Text {
  const whole = body.length > 0 ? `${title}\n\n${body}` : title;
  return { name: title, sortTitle: title, searchable: toSearchable(whole), code, updatedAt };
}

const names = (found: readonly Text[]) => found.map((one) => one.name);

describe('what a search found, in two groups', () => {
  it('puts texts with it in their title apart from those with it only further down', () => {
    const { inTitle, inText } = foundGroups(
      [text('Andric i Njegos'), text('Pismo', 'Citao sam Andrica.'), text('Zima', 'Sneg.')],
      'andric',
      NOW,
    );
    assert.deepEqual(names(inTitle), ['Andric i Njegos']);
    assert.deepEqual(names(inText), ['Pismo']);
  });

  it('counts the code in its file name as part of its title', () => {
    const { inTitle } = foundGroups([text('Sasvim drugi naslov', 'I reci.', NOW - 400 * DAY, '~K3F9A2')], '~k3f9a2', NOW);
    assert.deepEqual(names(inTitle), ['Sasvim drugi naslov']);
  });

  it('finds nothing for nothing', () => {
    assert.deepEqual(foundGroups([text('Andric')], '  ', NOW), { inTitle: [], inText: [], asPart: [] });
  });

  it('puts texts where it is only inside other words in a group of their own, last', () => {
    // "ivo" in "život" is a match, but seldom the one he meant.
    const { inTitle, inText, asPart } = foundGroups(
      [text('Zivot', 'Dug zivot.'), text('Pismo', 'Pozdrav od Ive i Ivo.'), text('Ivo Andric')],
      'ivo',
      NOW,
    );
    assert.deepEqual(names(inTitle), ['Ivo Andric']);
    assert.deepEqual(names(inText), ['Pismo']);
    assert.deepEqual(names(asPart), ['Zivot']);
  });

  it('counts a title that has it only inside a word as found in the text, where the text has the word', () => {
    const { inText, asPart } = foundGroups([text('Zivot', 'Rekao je Ivo.')], 'ivo', NOW);
    assert.deepEqual(names(inText), ['Zivot']);
    assert.deepEqual(names(asPart), []);
  });

  it('reads his mark and the name glued to it as two words, as the list draws them', () => {
    const { inTitle } = foundGroups([text('AAKafana u gradu'), text('A(E)IVO P')], 'kafana', NOW);
    assert.deepEqual(names(inTitle), ['AAKafana u gradu']);
    assert.deepEqual(names(foundGroups([text('A(E)IVO P')], 'ivo', NOW).inTitle), ['A(E)IVO P']);
  });

  it('takes a number glued to a word as the end of one word and the start of another', () => {
    assert.deepEqual(names(foundGroups([text('5Nosac aviona')], 'nosac', NOW).inTitle), ['5Nosac aviona']);
    assert.deepEqual(names(foundGroups([text('Pismo', 'Poglavlje 12Nosac.')], 'nosac', NOW).inText), ['Pismo']);
  });
});

describe('the order within a group', () => {
  it('keeps his own order among texts that are otherwise alike', () => {
    // His order is how he ranks: spaces, stars and ZZ all move a title in it.
    const inHisOrder = [text('   Andric, prvo'), text('Andric, drugo'), text('ZZ Andric, zadnje')];
    assert.deepEqual(names(foundGroups(inHisOrder, 'andric', NOW).inTitle), [
      '   Andric, prvo',
      'Andric, drugo',
      'ZZ Andric, zadnje',
    ]);
  });

  it('puts a title with the whole word before one where it only starts a word', () => {
    // A little better, not a lot: "Andrica" is Andrić all the same.
    const { inTitle } = foundGroups([text('Andrica pisma'), text('Andric')], 'andric', NOW);
    assert.deepEqual(names(inTitle), ['Andric', 'Andrica pisma']);
  });

  it('puts a text with the whole word before one where it only starts words, as often mentioned', () => {
    const { inText } = foundGroups([text('A', 'O Andrica, kod Andricu'), text('B', 'Andric i Andric')], 'andric', NOW);
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('puts a text that mentions it more often before one with the whole word less often', () => {
    const many = Array.from({ length: 5 }, () => 'Andrica').join(' ');
    const { inText } = foundGroups([text('A', 'Andric.'), text('B', many)], 'andric', NOW);
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('counts only where it is a word, not where it is inside one', () => {
    const inside = Array.from({ length: 15 }, () => 'zivot').join(' ');
    const { inText } = foundGroups([text('A', `${inside} Ivo`), text('B', 'Ivo i Ivo')], 'ivo', NOW);
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('puts a text that is about it before one that mentions it in passing', () => {
    const often = Array.from({ length: 15 }, () => 'Andric').join(' ');
    const few = 'Andric Andric';
    const { inText } = foundGroups(
      [text('A jednom', 'Andric.'), text('B nekoliko', few), text('C cesto', often)],
      'andric',
      NOW,
    );
    assert.deepEqual(names(inText), ['C cesto', 'B nekoliko', 'A jednom']);
  });

  it('leaves texts in his order where they mention it about as often', () => {
    // Twenty mentions and forty are the same step: nothing to choose between.
    const twenty = Array.from({ length: 20 }, () => 'Andric').join(' ');
    const forty = Array.from({ length: 40 }, () => 'Andric').join(' ');
    const { inText } = foundGroups([text('A', twenty), text('B', forty)], 'andric', NOW);
    assert.deepEqual(names(inText), ['A', 'B']);
  });

  it('puts the few he is working on now first, newest first', () => {
    const { inTitle } = foundGroups(
      [text('Andric A'), text('Andric B', '', NOW - 2 * DAY), text('Andric C', '', NOW - 1 * DAY)],
      'andric',
      NOW,
    );
    assert.deepEqual(names(inTitle), ['Andric C', 'Andric B', 'Andric A']);
  });

  it('lets only a few of them jump the queue, however many are recent', () => {
    const recent = [4, 3, 2, 1].map((days) => text(`Andric ${days}`, '', NOW - days * DAY));
    const { inTitle } = foundGroups(recent, 'andric', NOW);
    // The three newest first; the fourth back in his order with the rest.
    assert.deepEqual(names(inTitle), ['Andric 1', 'Andric 2', 'Andric 3', 'Andric 4']);
    const { inTitle: withOlder } = foundGroups([text('Andric 0 star'), ...recent], 'andric', NOW);
    assert.deepEqual(names(withOlder), ['Andric 1', 'Andric 2', 'Andric 3', 'Andric 0 star', 'Andric 4']);
  });

  it('counts nothing as recent that he has not written in for weeks', () => {
    const { inTitle } = foundGroups([text('Andric A'), text('Andric B', '', NOW - 30 * DAY)], 'andric', NOW);
    assert.deepEqual(names(inTitle), ['Andric A', 'Andric B']);
  });
});

describe('a search of several words', () => {
  it('finds only the texts that have every word', () => {
    const { inTitle, inText, asPart } = foundGroups(
      [text('Ivo', 'Samo ime.'), text('Pismo', 'Andric, bez imena.'), text('Oba', 'Ivo je Andric.')],
      'ivo andric',
      NOW,
    );
    assert.deepEqual([...names(inTitle), ...names(inText), ...names(asPart)], ['Oba']);
  });

  it('puts the words together before the same words apart', () => {
    const { inText } = foundGroups(
      [text('A', 'Ivo je pisao, a Andric nije.'), text('B', 'Pisao je Ivo Andric.')],
      'ivo andric',
      NOW,
    );
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('puts the words together before words apart mentioned more often', () => {
    const apart = Array.from({ length: 15 }, () => 'Ivo i Andric').join(', ');
    const { inText } = foundGroups([text('A', apart), text('B', 'Ivo Andric.')], 'ivo andric', NOW);
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('puts a title with the words together before one with them apart', () => {
    const { inTitle } = foundGroups([text('Andric i Ivo'), text('Ivo Andric')], 'ivo andric', NOW);
    assert.deepEqual(names(inTitle), ['Ivo Andric', 'Andric i Ivo']);
  });

  it('counts a text with some words in its title and the rest further down as found in the text', () => {
    const { inTitle, inText } = foundGroups([text('Andric', 'Pisao je Njegos.')], 'andric njegos', NOW);
    assert.deepEqual(names(inTitle), []);
    assert.deepEqual(names(inText), ['Andric']);
  });

  it('counts a word glued to his mark in the title with the rest further down', () => {
    const { inText } = foundGroups([text('AAKafana', 'Pisao je Njegos.')], 'kafana njegos', NOW);
    assert.deepEqual(names(inText), ['AAKafana']);
  });

  it('counts words apart by the rarest of them', () => {
    // Ivo forty times and Andric once is not about Ivo Andric.
    const ivo = Array.from({ length: 40 }, () => 'Ivo').join(' ');
    const both = Array.from({ length: 5 }, () => 'Ivo, pa Andric').join(' ');
    const { inText } = foundGroups([text('A', `${ivo}, pa Andric`), text('B', both)], 'ivo andric', NOW);
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('puts the words apart before a word found only inside another', () => {
    const { inText, asPart } = foundGroups(
      [text('A', 'Zivot i Andric.'), text('B', 'Ivo je pisao, a Andric nije.')],
      'ivo andric',
      NOW,
    );
    assert.deepEqual(names(inText), ['B']);
    assert.deepEqual(names(asPart), ['A']);
  });
});

describe('ranking a text that has the word many times', () => {
  // Counting stops once a word is there often enough for the top step; these
  // are the texts where what decides comes after that point.
  const often = (word: string, times: number) => Array.from({ length: times }, () => word).join(' ');

  it('still sees a whole word that comes only after many that begin longer ones', () => {
    const { inText } = foundGroups(
      [text('A', often('Ivom', 20)), text('B', `${often('Ivom', 20)} Ivo`)],
      'ivo',
      NOW,
    );
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('still sees words together that come only after many apart', () => {
    const { inText } = foundGroups(
      [text('A', often('Ivo i Andric', 20)), text('B', `${often('Ivo i Andric', 20)} Ivo Andric`)],
      'ivo andric',
      NOW,
    );
    assert.deepEqual(names(inText), ['B', 'A']);
  });

  it('still sees words together as whole words after many that only begin longer ones', () => {
    const { inText } = foundGroups(
      [text('A', often('Ivom Andricem', 20)), text('B', `${often('Ivom Andricem', 20)} Ivo Andric`)],
      'ivo andric',
      NOW,
    );
    assert.deepEqual(names(inText), ['B', 'A']);
  });
});
