import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { codesFor, legendOf, pathsOf, shownPath } from '../src/test-mode/test-mode-codes.ts';
import { testModeFrom } from '../src/test-mode/test-mode-setting.ts';
import type { Whereabouts } from '../src/test-mode/test-mode-whereabouts.ts';

const PLAIN: Whereabouts = {
  origin: 'own',
  path: 'C:/Dropbox/b-notes/Pismo.txt',
  resophStem: null,
  resophPath: null,
  unlinked: false,
  resophGone: false,
  otherVersion: false,
  changedElsewhere: false,
  conflictedCopy: false,
};

const COPY: Whereabouts = {
  ...PLAIN,
  origin: 'copy',
  path: 'C:/Dropbox/b-notes/GRAD Kilim ~K3F9A2.txt',
  resophStem: '   *GRAD Kilim',
  resophPath: 'C:/Dropbox/ResophNotes/   *GRAD Kilim.txt',
};

const shown = (where: Whereabouts): string => codesFor(where).map(({ code }) => code).join(' ');

describe("a row's badge", () => {
  it('says where the text lives', () => {
    assert.equal(shown(PLAIN), 'b');
    assert.equal(shown(COPY), 'R→b');
    assert.equal(shown({ ...PLAIN, origin: 'resoph' }), 'R');
  });

  it('adds only the flags that apply, in one order', () => {
    assert.equal(
      shown({ ...COPY, otherVersion: true, resophGone: true, changedElsewhere: true, conflictedCopy: true }),
      'R→b ⇄ R✕ ext cc',
    );
    assert.equal(shown({ ...COPY, changedElsewhere: true }), 'R→b ext');
  });

  it('spells out each of its codes when hovered', () => {
    const legend = legendOf(codesFor({ ...COPY, otherVersion: true }));
    assert.equal(legend.split('\n')[0], '[test-mode]');
    assert.match(legend, /^R→b {2}b-notes' copy of a Resoph text$/m);
    assert.match(legend, /^⇄ {2}the other version of a text both sides changed/m);
  });
});

describe("a row's paths", () => {
  it('shows every space in the file name as a dot, and the folders as Windows writes them', () => {
    assert.equal(shownPath('C:/Dropbox/ResophNotes/   *GRAD Kilim.txt'), 'C:\\Dropbox\\ResophNotes\\···*GRAD·Kilim.txt');
  });

  it('says where a copy came from', () => {
    assert.deepEqual(pathsOf(COPY).split('\n'), [
      "[test-mode] b-notes' copy of a Resoph text",
      'C:\\Dropbox\\b-notes\\GRAD·Kilim·~K3F9A2.txt',
      'from C:\\Dropbox\\ResophNotes\\···*GRAD·Kilim.txt',
    ]);
  });

  it('says so when the Resoph file it came from is gone, and when its link is missing', () => {
    const lines = pathsOf({ ...COPY, resophPath: null, resophGone: true, unlinked: true }).split('\n');
    assert.equal(lines[0], "[test-mode] b-notes' copy of a Resoph text (known by its name; its link is missing)");
    assert.equal(lines[2], 'from ···*GRAD·Kilim.txt, no longer in the Resoph folder');
  });

  it('shows one path for a text that is not a copy', () => {
    assert.deepEqual(pathsOf(PLAIN).split('\n'), ['[test-mode] begun in b-notes', 'C:\\Dropbox\\b-notes\\Pismo.txt']);
  });
});

describe('the test mode switch', () => {
  it('is on only where the file says so in so many words', () => {
    assert.equal(testModeFrom({ on: true }), true);
    for (const said of [{ on: false }, { on: 'true' }, { on: 1 }, {}, null, 'on', []]) {
      assert.equal(testModeFrom(said), false, JSON.stringify(said));
    }
  });
});
