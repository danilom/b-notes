import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type WhatIsHappening, canDelete, emptyHintShows, statusFor } from '../src/ui/status-line.ts';

const AT_REST: WhatIsHappening = {
  openId: 'O zimi',
  text: 'O zimi\n\nTekst.',
  savedAt: Date.now(),
  saving: false,
  notice: null,
};

const at = (change: Partial<WhatIsHappening>): WhatIsHappening => ({ ...AT_REST, ...change });

describe('the line along the bottom', () => {
  it('says what just happened before anything else', () => {
    // A thing that has just happened is worth more than how long ago he saved.
    assert.equal(statusFor(at({ notice: 'Tekst je obrisan' }), 'sr'), 'Tekst je obrisan');
  });

  it('says it even while a save is in flight', () => {
    assert.equal(statusFor(at({ notice: 'Tekst je vraćen', saving: true }), 'sr'), 'Tekst je vraćen');
  });

  it('says nothing at all before he has written anything', () => {
    // The line is for reporting, not for telling him to get on with it.
    assert.equal(statusFor(at({ openId: null, text: '', savedAt: null }), 'sr'), '');
  });

  it('says nothing when the new text holds only spaces', () => {
    assert.equal(statusFor(at({ openId: null, text: '   \n\n ', savedAt: null }), 'sr'), '');
  });

  it('reports the save it is in the middle of', () => {
    assert.equal(statusFor(at({ saving: true }), 'sr'), 'Čuvam…');
  });

  it('says so when a text has never reached disk', () => {
    assert.equal(statusFor(at({ savedAt: null }), 'sr'), 'Nije sačuvano');
  });

  it('reports when it last reached disk the rest of the time', () => {
    assert.equal(statusFor(at({ savedAt: Date.now() }), 'sr'), 'Sačuvano upravo sad');
  });

  it('reports a text he has started typing into but not yet saved', () => {
    // openId is null until the first save lands, but there is something to lose
    // by then, so the line has to admit it is not safe yet.
    assert.equal(statusFor(at({ openId: null, text: 'Poceo sam', savedAt: null }), 'sr'), 'Nije sačuvano');
  });
});

describe('the bubble pointing at the delete button', () => {
  it('waits until the empty text has settled', () => {
    // Select everything and type over it and the text is empty for a moment. A
    // bubble blinking in the corner of an ordinary edit is what this avoids.
    assert.equal(emptyHintShows(at({ text: '', saving: true })), false);
  });

  it('comes up once the save has landed on an empty text', () => {
    assert.equal(emptyHintShows(at({ text: '', saving: false })), true);
  });

  it('counts a page of spaces as empty, because that is what he sees', () => {
    assert.equal(emptyHintShows(at({ text: '  \n\n   ' })), true);
  });

  it('stays down while there is writing in it', () => {
    assert.equal(emptyHintShows(at({ text: 'Jedno slovo' })), false);
  });

  it('stays down for a new text he has not saved, which cannot be deleted', () => {
    assert.equal(emptyHintShows(at({ openId: null, text: '' })), false);
  });
});

describe('whether there is anything to put away', () => {
  it('is nothing until the text has reached disk', () => {
    assert.equal(canDelete(at({ openId: null })), false);
  });

  it('is the open text once it has', () => {
    assert.equal(canDelete(at({ openId: 'O zimi' })), true);
  });
});
