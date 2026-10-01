import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSearchable } from '../src/language/diacritics.ts';
import { hasEveryWord, hasWholeWord, phrasesIn, wordsOf } from '../src/ui/phrase-match.ts';

/** The phrases found in his text, as he would read them, with how each was matched. */
const phrases = (text: string, query: string) =>
  phrasesIn(toSearchable(text), wordsOf(query)).map(({ start, end, kind }) => `${text.slice(start, end)}:${kind}`);

describe('a search of several words', () => {
  it('takes the words he typed, whatever spaces he put between them', () => {
    assert.deepEqual(wordsOf('  Ivo   Andrić '), ['ivo', 'andric']);
    // Pasted from his text, where a name may be held together by a non-breaking space.
    assert.deepEqual(wordsOf('Ivo\u00a0Andrić'), ['ivo', 'andric']);
  });

  it('finds a text only where every word is in it, together or apart', () => {
    const words = wordsOf('ivo andric');
    assert.equal(hasEveryWord('ivo je pisao. andric je...', words), true);
    assert.equal(hasEveryWord('ivo je pisao.', words), false);
  });

  it('finds the words standing together, in the order he typed them', () => {
    assert.deepEqual(phrases('O Ivo Andric, i Andric Ivo.', 'ivo andric'), ['Ivo Andric:whole']);
  });

  it('takes the words as together across punctuation and a line break', () => {
    assert.deepEqual(phrases('Ivo,\nAndric', 'ivo andric'), ['Ivo,\nAndric:whole']);
  });

  it('takes the words together where each only begins the word, as his words decline', () => {
    assert.deepEqual(phrases('sa Ivom Andricem', 'ivo andric'), ['Ivom Andric:start']);
  });

  it('takes the words together as only beginning words where the last one does', () => {
    assert.deepEqual(phrases('O Ivo Andricu', 'ivo andric'), ['Ivo Andric:start']);
  });

  it('does not take words with another word between them as together', () => {
    assert.deepEqual(phrases('Ivo i Andric', 'ivo andric'), []);
  });

  it('does not take a word inside the next word as beginning it', () => {
    assert.deepEqual(phrases('Ivo Nandric', 'ivo andric'), []);
  });

  it('says where the first word is inside another word', () => {
    assert.deepEqual(phrases('Zivot Andrica', 'ivot andric'), ['ivot Andric:inside']);
  });

  it('takes a number glued to a word as two words together', () => {
    assert.deepEqual(phrases('5Nosac aviona', '5 nosac'), ['5Nosac:whole']);
  });

  it('finds a word he typed with its bracket in front', () => {
    assert.deepEqual(phrases('Ivo (Andric)', 'ivo (andric'), ['Ivo (Andric:whole']);
  });

  it('matches one word exactly as a search always has, inside words too', () => {
    assert.deepEqual(phrases('Ivo, zivot, Ivom', 'ivo'), ['Ivo:whole', 'ivo:inside', 'Ivo:start']);
  });
});

describe('whether a word is there whole', () => {
  it('finds it standing alone, at either end or between punctuation', () => {
    assert.equal(hasWholeWord('ivo je bio', 'ivo'), true);
    assert.equal(hasWholeWord('bio je (ivo)', 'ivo'), true);
  });

  it('does not count it beginning a longer word or inside one', () => {
    assert.equal(hasWholeWord('ivom i zivot', 'ivo'), false);
  });

  it('counts it glued to a number, as his series numbers are', () => {
    assert.equal(hasWholeWord('5nosac', 'nosac'), true);
    assert.equal(hasWholeWord('nosac5', 'nosac'), true);
  });

  it('takes what he typed literally, brackets and dots included', () => {
    assert.equal(hasWholeWord('vidi (up) 3', '(up)'), true);
    assert.equal(hasWholeWord('vidi up 3', '(up)'), false);
    assert.equal(hasWholeWord('ab', '.'), false);
  });
});
