import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffTexts, mergeCloseChanges, separateTidying } from '../src/notes/text-diff.ts';
import { createFakeAi, fakeProposal } from '../src/ui/lektor/lektor-fake-ai.ts';
import { LektorServiceError } from '../src/ui/lektor/lektor-service.ts';

const TEXT = `Naslov sa recima

${'Ovo je sasvim obicna recenica koja sadrzi slova sto se mogu ispraviti, zasto da ne. '.repeat(30)}

    Uvuceni red ostaje na mestu.
`;

const signal = new AbortController().signal;
const finals = { noCredit: () => 'Novac je potrošen.', dailyCap: () => 'Današnji pokušaji su potrošeni.' };

function kinds(proposal: string): { tidy: number; larger: number } {
  const pieces = mergeCloseChanges(separateTidying(diffTexts(TEXT, proposal)));
  return { tidy: pieces.filter((piece) => piece.kind === 'tidy').length, larger: pieces.filter((piece) => piece.kind === 'change').length };
}

describe('the test Lektor', () => {
  it('gives the same text the same corrections every time, so a bug can be found again', () => {
    assert.equal(fakeProposal(TEXT, 'grammar'), fakeProposal(TEXT, 'grammar'));
  });

  it('gives the review small fixes for letters and only those', () => {
    const { tidy, larger } = kinds(fakeProposal(TEXT, 'letters'));
    assert.ok(tidy > 5);
    assert.equal(larger, 0);
  });

  it('adds larger changes the stronger the preset, so the review has both kinds to show', () => {
    const grammar = kinds(fakeProposal(TEXT, 'grammar')).larger;
    const rewrite = kinds(fakeProposal(TEXT, 'rewrite')).larger;
    assert.ok(grammar > 0);
    assert.ok(rewrite > grammar);
  });

  it('reworks whole runs of words in Dubinska prerada, as the real services do, and none in Slova i zarezi', () => {
    const longRuns = (proposal: string): number =>
      mergeCloseChanges(diffTexts(TEXT, proposal)).filter((piece) => piece.kind === 'change' && (piece.removed.match(/\p{L}+/gu) ?? []).length >= 6).length;
    assert.ok(longRuns(fakeProposal(TEXT, 'rewrite')) >= 3);
    assert.equal(longRuns(fakeProposal(TEXT, 'letters')), 0);
  });

  it('leaves his lines and spacing alone', () => {
    const proposal = fakeProposal(TEXT, 'rewrite');
    assert.equal(proposal.split('\n').length, TEXT.split('\n').length);
    assert.match(proposal, /\n {4}\S/);
  });

  it('copes with a text with nothing in it to correct', () => {
    assert.equal(fakeProposal('123 ... !!!', 'rewrite'), '123 ... !!!');
    assert.equal(fakeProposal('', 'letters'), '');
  });

  it('returns a real reply saved for the text in place of its own, and its own where none is saved', async () => {
    const saved = async (text: string, preset: string): Promise<string | null> => (preset === 'rewrite' ? `${text} prerađeno` : null);
    const fake = createFakeAi('ok', { ...finals, realReply: saved });
    assert.equal(await fake.corrections({ text: TEXT, preset: 'rewrite', instruction: '', note: '' }, signal), `${TEXT} prerađeno`);
    assert.equal(await fake.corrections({ text: TEXT, preset: 'letters', instruction: '', note: '' }, signal), fakeProposal(TEXT, 'letters'));
  });

  it('says plainly that its comment is a test', async () => {
    const comment = await createFakeAi('ok', finals).feedback(TEXT, signal);
    assert.match(comment, /^\[PROBNI UTISAK/);
  });

  it('acts out a failure when set to, with no retry where there would be none', async () => {
    const failure = await createFakeAi('no-credit', finals).feedback(TEXT, signal).catch((error: unknown) => error);
    assert.ok(failure instanceof LektorServiceError);
    assert.equal(failure.failure, 'no-credit');
    assert.equal(failure.finalSentence, 'Novac je potrošen.');
  });

  it('stops when he stops it', async () => {
    const stopping = new AbortController();
    const answer = createFakeAi('ok', finals).feedback(TEXT, stopping.signal);
    stopping.abort();
    await assert.rejects(answer, (thrown: unknown) => thrown instanceof DOMException && thrown.name === 'AbortError');
  });

  it('reads as offline only when set to', async () => {
    await assert.doesNotReject(createFakeAi('overloaded', finals).connectionCheck(signal));
    await assert.rejects(createFakeAi('offline', finals).connectionCheck(signal), LektorServiceError);
  });
});
