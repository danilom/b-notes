import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { titleFrom } from '../src/notes/note-title.ts';
import { nameForHeading } from '../src/ui/lektor/lektor-heading-name.ts';

/* His title, quoted in the Lektor's sentences: whatever he typed or pasted (spec §6, §11). */

describe("his title in the Lektor's sentences", () => {
  it('is his title as the list shows it, trimmed', () => {
    assert.equal(nameForHeading(titleFrom('   * Stari most  \n\nTekst.')), '* Stari most');
  });

  it('is nothing for an empty title or one of only spaces, so "bez naslova" is said instead', () => {
    assert.equal(nameForHeading(''), null);
    assert.equal(nameForHeading(' \t  '), null);
  });

  it('takes off his own outer quotes, which the sentence would double', () => {
    assert.equal(nameForHeading('„Jutro na obali”'), 'Jutro na obali');
    assert.equal(nameForHeading('"Pismo"'), 'Pismo');
    assert.equal(nameForHeading('„”'), null);
  });

  it('keeps quotes inside the title', () => {
    assert.equal(nameForHeading('Djed reče „ajde” i ode'), 'Djed reče „ajde” i ode');
  });

  it('cuts a pasted paragraph at a word, with an ellipsis', () => {
    const long = 'Ujutru sam sisao do obale, gdje ribari vec slazu mreze, i mirisalo je na so i na kafu iz obliznje kafane';
    const name = nameForHeading(long) ?? '';
    assert.ok(name.endsWith('…'));
    assert.ok(name.length <= 61);
    assert.ok(long.startsWith(name.slice(0, -1)));
    assert.match(name, /\S…$/);
  });

  it('turns tabs, line breaks and control characters into single spaces', () => {
    assert.equal(nameForHeading('  Jutro\tna   obali\n'), 'Jutro na obali');
    assert.equal(nameForHeading('Jutro\u0007 na\u0000obali'), 'Jutro na obali');
  });
});
