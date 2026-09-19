import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { answersThePhrase, sentenceParts } from '../src/ui/confirm-dialog.ts';
import { strings } from '../src/language/wording.ts';

const SPELLINGS = ['uništi', 'unisti'];

describe('the word he has to write out', () => {
  it('takes it as he was shown it', () => {
    assert.equal(answersThePhrase('uništi', SPELLINGS), true);
  });

  it('takes it without the mark he may not know how to reach', () => {
    assert.equal(answersThePhrase('unisti', SPELLINGS), true);
  });

  it('does not care which case he used', () => {
    assert.equal(answersThePhrase('UNIŠTI', SPELLINGS), true);
  });

  it('forgives space either side of it', () => {
    assert.equal(answersThePhrase('  unisti ', SPELLINGS), true);
  });

  it('refuses the beginning of it', () => {
    assert.equal(answersThePhrase('unist', SPELLINGS), false);
  });

  it('refuses it with anything stuck on the end', () => {
    // Only the word will do, and nothing that merely contains it: the barrier
    // is there to make him stop, so a near miss has to stop him too.
    assert.equal(answersThePhrase('unistix', SPELLINGS), false);
  });

  it('refuses a sentence it happens to appear in', () => {
    assert.equal(answersThePhrase('da unisti ga', SPELLINGS), false);
  });

  it('refuses an empty box', () => {
    assert.equal(answersThePhrase('', SPELLINGS), false);
  });

  it('refuses a box of spaces', () => {
    assert.equal(answersThePhrase('   ', SPELLINGS), false);
  });

  it('takes the English word in English', () => {
    assert.equal(answersThePhrase('Destroy', ['destroy']), true);
  });
});

describe('the sentence asking for it', () => {
  it('marks out each spelling where its slot was', () => {
    assert.deepEqual(sentenceParts('Ukucaj {} ili {} da potvrdiš.', SPELLINGS), [
      { text: 'Ukucaj ', marked: false },
      { text: 'uništi', marked: true },
      { text: ' ili ', marked: false },
      { text: 'unisti', marked: true },
      { text: ' da potvrdiš.', marked: false },
    ]);
  });

  it('reads properly in a language that asks for one spelling', () => {
    // English has one slot where Serbian has two, and the spare spelling is
    // left unsaid rather than crowded in at the end.
    assert.deepEqual(sentenceParts('Type {} to confirm.', ['destroy', 'destroy']), [
      { text: 'Type ', marked: false },
      { text: 'destroy', marked: true },
      { text: ' to confirm.', marked: false },
    ]);
  });

  it('leaves a slot alone when no spelling was given for it', () => {
    assert.deepEqual(sentenceParts('Ukucaj {} ili {} da potvrdiš.', ['uništi']), [
      { text: 'Ukucaj ', marked: false },
      { text: 'uništi', marked: true },
      { text: ' ili ', marked: false },
      { text: ' da potvrdiš.', marked: false },
    ]);
  });

  it('puts the whole sentence through when it asks for nothing', () => {
    assert.deepEqual(sentenceParts('Nema ničega da se ukuca.', []), [
      { text: 'Nema ničega da se ukuca.', marked: false },
    ]);
  });

  it('reads back as the sentence with the spellings in it', () => {
    // Whatever the parts are, reading them in order has to give the sentence
    // the wording table holds, with each slot filled and none left showing.
    for (const language of ['sr', 'en'] as const) {
      const words = strings(language);
      const spellings = [words.destroyWord, words.destroyWordPlain];
      const parts = sentenceParts(words.destroyPrompt, spellings);

      const filled = spellings.reduce((sentence, word) => sentence.replace('{}', word), words.destroyPrompt);
      const read = parts.map((said) => said.text).join('');

      assert.equal(read, filled, language);
      assert.ok(!read.includes('{}'), `${language} left a slot showing`);
      assert.ok(
        parts.some((said) => said.marked),
        `${language} marked nothing out`,
      );
    }
  });
});
