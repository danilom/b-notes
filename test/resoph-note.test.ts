import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  composeResophText,
  isResophId,
  resophIdOf,
  resophStemOf,
  titleOfResophName,
} from '../src/notes/resoph-note.ts';

describe('the title Resoph shows for a file', () => {
  it('reads back the characters Resoph had to escape', () => {
    assert.equal(titleOfResophName('%2AGRAD Kilim%3F'), '*GRAD Kilim?');
    assert.equal(titleOfResophName('KO JE STO 11%5C10%5C2021'), 'KO JE STO 11\\10\\2021');
    assert.equal(titleOfResophName('HALT%2F STOJ'), 'HALT/ STOJ');
  });

  it('keeps his spaces exactly, at both ends', () => {
    assert.equal(titleOfResophName('          Pismo%2A%2A '), '          Pismo** ');
  });

  it('leaves a percent sign alone when what follows is not one of Resoph escapes', () => {
    assert.equal(titleOfResophName('Rast od 40%41'), 'Rast od 40%41');
    assert.equal(titleOfResophName('100% tacno'), '100% tacno');
  });

  it('reads an escape written in lower case', () => {
    assert.equal(titleOfResophName('Zvijezda%2a'), 'Zvijezda*');
  });
});

describe('a Resoph note as Resoph shows it', () => {
  it('puts the title above what the file holds', () => {
    assert.equal(composeResophText('Pismo', 'Prvi red.\n\nDrugi.'), 'Pismo\nPrvi red.\n\nDrugi.');
  });

  it('is only the title when the file is empty', () => {
    assert.equal(composeResophText('Osa i staklo', ''), 'Osa i staklo');
  });

  it('does not double a title the file already starts with', () => {
    // His Simplenote-era files carry the title inside too.
    assert.equal(composeResophText('Pismo', 'Pismo\n\nPrvi red.'), 'Pismo\n\nPrvi red.');
  });

  it('counts a title as already there despite spacing and case', () => {
    assert.equal(composeResophText('   Pismo  iz Boke', 'pismo iz boke\nTekst.'), 'pismo iz boke\nTekst.');
  });

  it('keeps the title when the file merely starts with the same words', () => {
    assert.equal(composeResophText('Pismo', 'Pismo iz Boke\nTekst.'), 'Pismo\nPismo iz Boke\nTekst.');
  });
});

describe('telling a Resoph text from one of b-notes own', () => {
  it('round-trips the name on disk, spaces and escapes included', () => {
    const stem = '        %2AMuskulus%2A%2A ';
    assert.equal(resophStemOf(resophIdOf(stem)), stem);
  });

  it('never takes an ordinary filename for a Resoph one', () => {
    assert.equal(isResophId('Pismo ~K3F9A2'), false);
    assert.equal(resophStemOf('Pismo ~K3F9A2'), null);
  });
});
