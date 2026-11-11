import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strings } from '../src/language/wording.ts';
import { type FailureFacts, failureView } from '../src/ui/lektor/lektor-failures.ts';

/* Every row of the failure table (spec §10): its words, and its shortcut or retry, or neither. */

const words = strings('sr').lektor;
const bothKeys = { free: true, paid: true };
const facts = (failure: FailureFacts['failure'], side: FailureFacts['side'], hasKey = bothKeys): FailureFacts => ({ failure, side, hasKey, resetTime: '09:00' });

describe('what each failure says and offers', () => {
  for (const [failure, side, sentence, shortcut, isRetried] of [
    ['busy', 'free', 'Gugl je sada zauzet.', 'paid', false],
    ['busy', 'paid', 'Plaćeni lektor je sada zauzet.', 'free', false],
    ['daily-limit', 'free', 'Besplatni lektor je za danas potrošen.', 'paid', false],
    ['no-credit', 'paid', 'Plaćeni iznos je potrošen.', 'free', false],
    ['broke-after-hand-over', 'paid', 'Besplatni lektor sada ne može da primi tekst, a za plaćenog nema više novca.', null, false],
    ['offline', 'free', 'Internet ne radi, a AI Lektoru je potreban.', null, true],
    ['cut-off', 'paid', 'AI Lektor nije završio.', null, true],
    ['declined', 'free', 'AI Lektor neće da radi sa ovim tekstom.', 'paid', false],
    ['too-long', 'free', 'Tekst je predugačak za AI Lektora.', null, false],
  ] as const) {
    it(`says "${sentence}" for ${failure} on ${side}, offering ${shortcut ?? (isRetried ? 'to try again' : 'nothing')}`, () => {
      const view = failureView(facts(failure, side), words);
      assert.equal(view.sentence, sentence);
      assert.equal(view.shortcut, shortcut);
      assert.equal(view.isRetried, isRetried);
    });
  }

  it('offers no shortcut to a Lektor he has no key for, and says no way on through it', () => {
    const view = failureView(facts('busy', 'free', { free: true, paid: false }), words);
    assert.equal(view.shortcut, null);
    assert.equal(view.wayOn, 'Probaj malo kasnije.');
    assert.equal(failureView(facts('no-credit', 'paid', { free: false, paid: true }), words).wayOn, 'Neka se uplati još.');
  });

  it('says when the free Lektor works again, as a clock time with no day word', () => {
    const { wayOn } = failureView(facts('daily-limit', 'free'), words);
    assert.equal(wayOn, 'Ponovo radi posle 09:00, ili pošalji plaćenom lektoru.');
    assert.doesNotMatch(wayOn, /danas|sutra/);
    assert.equal(failureView(facts('daily-limit', 'free', { free: true, paid: false }), words).wayOn, 'Ponovo radi posle 09:00.');
  });

  it('never offers trying again where it would only be refused again', () => {
    for (const failure of ['busy', 'daily-limit', 'no-credit', 'broke-after-hand-over', 'declined', 'too-long'] as const) {
      assert.equal(failureView(facts(failure, 'free'), words).isRetried, false, failure);
    }
  });
});
