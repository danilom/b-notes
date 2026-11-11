import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { FileMissing, type FileSystem } from '../src/platform/file-system.ts';
import type { Log } from '../src/platform/logging.ts';
import { areSetsVoid, keptResultsFrom, keptSet, readKeptResults, withCorrections, withEndingOf, writeKeptResults } from '../src/ui/lektor/lektor-kept-results.ts';

const LETTERS = { preset: 'letters', proposed: 'Tekst!', model: 'gemini-3.6-flash', madeAt: 1000, cost: null };
const RESULTS = { feedback: 'Utisak.', readText: 'Tekst.', readAt: 5, readBy: 'gemini-3.8-flash', commentCost: null, proposals: [LETTERS], proposalsFor: 'Tekst.', paidCosts: {} };
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
    const older = { name: NAME, feedback: 'Utisak.', readText: 'Tekst.', readAt: 5, proposal: 'Tekst!', proposalFor: 'Tekst.' };
    assert.deepEqual(keptResultsFrom(older, NAME), { feedback: 'Utisak.', readText: 'Tekst.', readAt: 5, readBy: '', commentCost: null, paidCosts: {}, proposals: [], proposalsFor: '' });
  });

  it("take an older version's sets without a time or a cost, ignoring its level and note", () => {
    const older = { name: NAME, ...RESULTS, readBy: 'thorough', proposals: [{ preset: 'letters', level: 'thorough', note: 'x', proposed: 'Tekst!', model: 'claude-opus-5-5' }] };
    const kept = keptResultsFrom(older, NAME);
    assert.deepEqual(kept?.proposals, [{ preset: 'letters', proposed: 'Tekst!', model: 'claude-opus-5-5', madeAt: 0, cost: null }]);
    assert.equal(kept?.readBy, 'thorough');
  });

  it("keep the later of an older version's two sets of one kind", () => {
    const older = { name: NAME, ...RESULTS, proposals: [{ ...LETTERS, proposed: 'Besplatno' }, { ...LETTERS, proposed: 'Plaćeno' }] };
    assert.deepEqual(keptResultsFrom(older, NAME)?.proposals.map((kept) => kept.proposed), ['Plaćeno']);
  });

  it('leave out only the corrections that cannot be believed', () => {
    const stored = { name: NAME, ...RESULTS, proposals: [LETTERS, { ...LETTERS, preset: 'wording', model: undefined }, { preset: 'grammar' }, null] };
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

describe('kept corrections', () => {
  const TEXT = 'Tekst.';
  const none = { proposals: [], proposalsFor: '', paidCosts: {} };
  const PAID = { preset: 'letters', proposed: 'Plaćeno', model: 'google/gemini-3.8-flash', madeAt: 2000, cost: 0.09 };

  it('are found by kind alone, for the same text', () => {
    assert.deepEqual(keptSet(RESULTS, TEXT, 'letters'), LETTERS);
    assert.equal(keptSet(RESULTS, TEXT, 'grammar'), null);
  });

  it('say which model made them, even if another would make them now', () => {
    const kept = withCorrections(none, TEXT, { ...LETTERS, model: 'stariji-model' });
    assert.equal(keptSet(kept, TEXT, 'letters')?.model, 'stariji-model');
  });

  it('are still found when only spaces or blank lines at the very end differ', () => {
    assert.deepEqual(keptSet(RESULTS, 'Tekst.  \n\n', 'letters'), LETTERS);
    assert.deepEqual(keptSet({ proposals: [LETTERS], proposalsFor: 'Tekst.\n\n' }, TEXT, 'letters'), LETTERS);
  });

  it('are not found when spaces differ anywhere but the very end', () => {
    assert.equal(keptSet(RESULTS, ' Tekst.', 'letters'), null);
    assert.equal(keptSet({ proposals: [LETTERS], proposalsFor: 'Prvi deo. Drugi deo.' }, 'Prvi deo.  Drugi deo.', 'letters'), null);
  });

  it('take on the ending the text has now, so the review does not offer to change it back', () => {
    assert.equal(withEndingOf('Tekst.\n\n', 'Tekst!\n'), 'Tekst!\n\n');
    assert.equal(withEndingOf('Tekst.', 'Tekst!\n'), 'Tekst!');
  });

  it('are one per kind: a newer set replaces the older, whichever Lektor made either', () => {
    const paid = withCorrections(RESULTS, TEXT, PAID);
    assert.deepEqual(paid.proposals, [PAID]);
    const freeAgain = withCorrections(paid, TEXT, { ...LETTERS, proposed: 'Opet besplatno' });
    assert.deepEqual(freeAgain.proposals.map((kept) => kept.proposed), ['Opet besplatno']);
  });

  it('stand side by side for different kinds', () => {
    const both = withCorrections(RESULTS, TEXT, { ...LETTERS, preset: 'grammar', proposed: 'Gramatika' });
    assert.equal(keptSet(both, TEXT, 'letters')?.proposed, 'Tekst!');
    assert.equal(keptSet(both, TEXT, 'grammar')?.proposed, 'Gramatika');
  });

  it('are all dropped once a set is made for a changed text', () => {
    const changed = withCorrections(RESULTS, 'Drugi tekst.', { ...LETTERS, preset: 'grammar', proposed: 'Drugo' });
    assert.deepEqual(changed.proposals.map((kept) => kept.proposed), ['Drugo']);
    assert.equal(changed.proposalsFor, 'Drugi tekst.');
  });

  it('remember what a paid set cost on this text, past a newer free set and a changed text', () => {
    const paid = withCorrections(RESULTS, TEXT, PAID);
    const afterFree = withCorrections(paid, TEXT, LETTERS);
    const changed = withCorrections(afterFree, 'Drugi tekst.', { ...LETTERS, preset: 'grammar' });
    assert.deepEqual(changed.paidCosts, { letters: 0.09 });
  });
});

describe('void corrections', () => {
  it('are void once the text differs, trailing spaces aside', () => {
    assert.equal(areSetsVoid(RESULTS, 'Tekst. Promenjen.'), true);
    assert.equal(areSetsVoid(RESULTS, 'Tekst.\n  '), false);
  });

  it('say so once however many sets there were, and not at all when there were none', () => {
    const many = { proposals: [LETTERS, { ...LETTERS, preset: 'grammar' }, { ...LETTERS, preset: 'wording' }], proposalsFor: 'Tekst.' };
    assert.equal(areSetsVoid(many, 'Drugo.'), true);
    assert.equal(areSetsVoid({ proposals: [], proposalsFor: '' }, 'Drugo.'), false);
  });
});
