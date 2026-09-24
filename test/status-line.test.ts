import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type WhatIsHappening,
  canDelete,
  emptyHintShows,
  keptOf,
  statusFor,
} from '../src/ui/status-line.ts';

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

  it('says nothing while a save is still waiting to run', () => {
    assert.equal(statusFor(at({ saving: true, savedAt: Date.now() }), 'sr'), '');
  });

  it('does not report the last save over keystrokes that have not reached disk', () => {
    const typedSince = at({ saving: true, savedAt: Date.now() - 120_000 });
    assert.notEqual(statusFor(typedSince, 'sr'), 'Sačuvano pre 2 minuta');
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

describe('how many copies the open text has', () => {
  it('counts the ones taken for the text he is in', () => {
    assert.equal(keptOf('O zimi', { note: 'O zimi', count: 4 }), 4);
  });

  it('counts none with nothing open, whatever was counted before', () => {
    // Both ways he gets here: deleting the text the count belonged to, and
    // starting a new one. The editor is empty either way and the number is
    // still sitting there from the text he left, which used to be offered to
    // him against an empty screen.
    assert.equal(keptOf(null, { note: 'O zimi', count: 4 }), 0);
  });

  it('counts none while the number still belongs to the text he left', () => {
    // The disk has not answered for the new one yet, and the old answer is not
    // an answer about it.
    assert.equal(keptOf('O jeseni', { note: 'O zimi', count: 4 }), 0);
  });

  it('counts none before anything has been counted at all', () => {
    assert.equal(keptOf('O zimi', { note: null, count: 0 }), 0);
  });
});
