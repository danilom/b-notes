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
    assert.deepEqual(foundGroups([text('Andric')], '  ', NOW), { inTitle: [], inText: [] });
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

  it('puts a title where it starts a word before one where it is inside a word', () => {
    const { inTitle } = foundGroups([text('Dandrica'), text('Andric')], 'andric', NOW);
    assert.deepEqual(names(inTitle), ['Andric', 'Dandrica']);
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
