import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { FileMissing, type FileSystem } from '../src/platform/file-system.ts';
import type { Log } from '../src/platform/logging.ts';
import { keptResultsFrom, readKeptResults, savedCorrections, withCorrections, withEndingOf, writeKeptResults } from '../src/ui/lektor/lektor-kept-results.ts';

const LETTERS = { preset: 'letters', level: 'free', note: '', proposed: 'Tekst!', model: 'gemini-3.6-flash' };
const RESULTS = { feedback: 'Utisak.', readText: 'Tekst.', readAt: 5, readBy: 'free', proposals: [LETTERS], proposalsFor: 'Tekst.' };
const NAME = '   * čudno ime %2A ~1.txt';

let held: Map<string, string>;
let warnings: string[];

const log: Log = {
  info: () => undefined,
  warn: (message) => void warnings.push(message),
  error: (message) => void warnings.push(message),
};

const files = {
  read: async (at: string) => {
    const found = held.get(at);
    if (found === undefined) throw new FileMissing(at);
    return found;
  },
  write: async (at: string, text: string) => void held.set(at, text),
} as unknown as FileSystem;

beforeEach(() => {
  held = new Map();
  warnings = [];
});

describe('kept Lektor results', () => {
  it('come back as they were saved, for that text only', async () => {
    await writeKeptResults(files, 'Podaci', NAME, RESULTS, log);
    assert.deepEqual(await readKeptResults(files, 'Podaci', NAME, log), RESULTS);
    assert.equal(await readKeptResults(files, 'Podaci', 'drugi', log), null);
  });

  it('are kept under a safe file name, however hostile his title', async () => {
    await writeKeptResults(files, 'Podaci', NAME, RESULTS, log);
    assert.match([...held.keys()][0] ?? '', /^Podaci\/lektor-kept\/[0-9a-f]{8}\.json$/);
  });

  it('say nothing when there are none, which is the ordinary case', async () => {
    assert.equal(await readKeptResults(files, 'Podaci', NAME, log), null);
    assert.deepEqual(warnings, []);
  });

  it('are ignored and noted when the file is unreadable', async () => {
    await writeKeptResults(files, 'Podaci', NAME, RESULTS, log);
    const [at] = held.keys();
    held.set(at ?? '', '{polovina');
    assert.equal(await readKeptResults(files, 'Podaci', NAME, log), null);
    assert.equal(warnings.length, 1);
  });

  it('keep the comment from an older version, but not its corrections, and do not guess who wrote it', () => {
    const { proposals: _proposals, proposalsFor: _proposalsFor, readBy: _readBy, ...comment } = RESULTS;
    const older = { name: NAME, ...comment, proposal: 'Tekst!', proposalFor: 'Tekst.' };
    assert.deepEqual(keptResultsFrom(older, NAME), { ...comment, readBy: '', proposals: [], proposalsFor: '' });
  });

  it('leave out only the corrections that cannot be believed', () => {
    const stored = { name: NAME, ...RESULTS, proposals: [LETTERS, { ...LETTERS, model: undefined }, { preset: 'grammar' }, null] };
    assert.deepEqual(keptResultsFrom(stored, NAME)?.proposals, [LETTERS]);
  });

  it('are not believed when a field of the comment is of the wrong kind, or they are about another text', () => {
    assert.equal(keptResultsFrom({ name: NAME, ...RESULTS, readAt: 'juče' }, NAME), null);
    assert.equal(keptResultsFrom({ name: 'drugi', ...RESULTS }, NAME), null);
    assert.equal(keptResultsFrom(null, NAME), null);
  });

  it('do not stop the Lektor when the disk refuses', async () => {
    const refusing = { write: async () => Promise.reject(new Error('Disk full')) } as unknown as FileSystem;
    await assert.doesNotReject(writeKeptResults(refusing, 'Podaci', NAME, RESULTS, log));
    assert.equal(warnings.length, 1);
  });
});

describe('saved corrections', () => {
  const TEXT = 'Tekst.';
  const choice = { preset: 'letters', level: 'free', note: '' };
  const none = { proposals: [], proposalsFor: '' };

  it('are found for the same text, kind, Lektor and note', () => {
    assert.deepEqual(savedCorrections(RESULTS, TEXT, choice), LETTERS);
  });

  it('say which model made them, even if another would make them now', () => {
    const kept = withCorrections(none, TEXT, { ...LETTERS, model: 'stariji-model' });
    assert.equal(savedCorrections(kept, TEXT, choice)?.model, 'stariji-model');
  });

  it('count a note the same whatever spaces surround it', () => {
    const kept = withCorrections(none, TEXT, { ...LETTERS, note: 'Bez zareza' });
    assert.equal(savedCorrections(kept, TEXT, { ...choice, note: '  Bez zareza ' })?.proposed, 'Tekst!');
  });

  it('are still found when only spaces or blank lines at the very end differ', () => {
    assert.deepEqual(savedCorrections(RESULTS, 'Tekst.  \n\n', choice), LETTERS);
    assert.deepEqual(savedCorrections({ proposals: [LETTERS], proposalsFor: 'Tekst.\n\n' }, TEXT, choice), LETTERS);
  });

  it('are not found when spaces differ anywhere but the very end', () => {
    assert.equal(savedCorrections(RESULTS, ' Tekst.', choice), null);
    assert.equal(savedCorrections({ proposals: [LETTERS], proposalsFor: 'Prvi deo. Drugi deo.' }, 'Prvi deo.  Drugi deo.', choice), null);
  });

  it('stay when a set is made for a text that differs only at its very end', () => {
    const grammar = withCorrections(RESULTS, 'Tekst.\n', { ...LETTERS, preset: 'grammar' });
    assert.equal(grammar.proposals.length, 2);
  });

  it('take on the ending the text has now, so the review does not offer to change it back', () => {
    assert.equal(withEndingOf('Tekst.\n\n', 'Tekst!\n'), 'Tekst!\n\n');
    assert.equal(withEndingOf('Tekst.', 'Tekst!\n'), 'Tekst!');
  });

  it('are not found when any part of the request differs', () => {
    assert.equal(savedCorrections(RESULTS, 'Tekst, malo drugaciji.', choice), null);
    assert.equal(savedCorrections(RESULTS, TEXT, { ...choice, preset: 'grammar' }), null);
    assert.equal(savedCorrections(RESULTS, TEXT, { ...choice, level: 'thorough' }), null);
    assert.equal(savedCorrections(RESULTS, TEXT, { ...choice, note: 'Bez zareza' }), null);
  });

  it('are not found when there are none, even for an empty text', () => {
    assert.equal(savedCorrections(none, '', choice), null);
  });

  it('stand side by side for each kind and each Lektor', () => {
    const grammar = withCorrections(RESULTS, TEXT, { ...LETTERS, preset: 'grammar', proposed: 'Gramatika' });
    const both = withCorrections(grammar, TEXT, { ...LETTERS, level: 'thorough', proposed: 'Placeno' });
    assert.equal(savedCorrections(both, TEXT, choice)?.proposed, 'Tekst!');
    assert.equal(savedCorrections(both, TEXT, { ...choice, preset: 'grammar' })?.proposed, 'Gramatika');
    assert.equal(savedCorrections(both, TEXT, { ...choice, level: 'thorough' })?.proposed, 'Placeno');
  });

  it('are replaced by a newer set of the same kind from the same Lektor, whatever its note', () => {
    const newer = withCorrections(RESULTS, TEXT, { ...LETTERS, note: 'Bez zareza', proposed: 'Novo' });
    assert.equal(newer.proposals.length, 1);
    assert.equal(savedCorrections(newer, TEXT, { ...choice, note: 'Bez zareza' })?.proposed, 'Novo');
    assert.equal(savedCorrections(newer, TEXT, choice), null);
  });

  it('are all dropped once a set is made for a changed text', () => {
    const changed = withCorrections(RESULTS, 'Drugi tekst.', { ...LETTERS, preset: 'grammar', proposed: 'Drugo' });
    assert.deepEqual(changed.proposals.map((kept) => kept.proposed), ['Drugo']);
    assert.equal(changed.proposalsFor, 'Drugi tekst.');
  });
});
