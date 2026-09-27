import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  composeResophText,
  isResophId,
  resophIdOf,
  resophNameFor,
  resophPartsOf,
  resophStemOf,
  titleOfResophName,
} from '../src/notes/resoph-note.ts';

describe('the file name Resoph gives a title', () => {
  it('writes what a filename cannot hold as Resoph does, and keeps every space', () => {
    assert.equal(resophNameFor('   *GRAD: Kilim?  '), '   %2AGRAD%3A Kilim%3F  ');
    assert.equal(resophNameFor('A/B\\C'), 'A%2FB%5CC');
  });

  it('reads back as the title it was made from', () => {
    for (const title of ['   *GRAD: Kilim?  ', 'Obican naslov', '50% "tacno" <ili> |ne|', 'Tab\there']) {
      assert.equal(titleOfResophName(resophNameFor(title)), title);
    }
  });
});

describe('a text split the way Resoph keeps it', () => {
  it('takes the first line as the title, exactly, and the rest less one blank line', () => {
    assert.deepEqual(resophPartsOf('   *Naslov  \n\nPrvi red.\nDrugi.'), { title: '   *Naslov  ', body: 'Prvi red.\nDrugi.' });
  });

  it('keeps a body that starts straight under the title', () => {
    assert.deepEqual(resophPartsOf('Naslov\nPrvi red.'), { title: 'Naslov', body: 'Prvi red.' });
  });

  it('shows again as the same text once Resoph puts the title back above it', () => {
    const text = '   *Naslov  \n\nPrvi red.\n\n\nDrugi.';
    const { title, body } = resophPartsOf(text);
    assert.equal(composeResophText(title, body), text);
  });

  it('has no title for a text with nothing in it', () => {
    assert.deepEqual(resophPartsOf('\n  \n'), { title: '', body: '' });
  });
});

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
  it('puts the title above what the file holds, with a blank line between', () => {
    // As Resoph holds every one of his 1,215 notes in its own database.
    assert.equal(composeResophText('Pismo', 'Prvi red.\n\nDrugi.'), 'Pismo\n\nPrvi red.\n\nDrugi.');
  });

  it('is the title and the blank line when the file is empty', () => {
    assert.equal(composeResophText('Osa i staklo', ''), 'Osa i staklo\n\n');
  });

  it('does not double a title the file already starts with', () => {
    // His Simplenote-era files carry the title inside too.
    assert.equal(composeResophText('Pismo', 'Pismo\n\nPrvi red.'), 'Pismo\n\nPrvi red.');
  });

  it('counts a title as already there despite spacing and case', () => {
    assert.equal(composeResophText('   Pismo  iz Boke', 'pismo iz boke\nTekst.'), 'pismo iz boke\nTekst.');
  });

  it('keeps the title when the file merely starts with the same words', () => {
    assert.equal(composeResophText('Pismo', 'Pismo iz Boke\nTekst.'), 'Pismo\n\nPismo iz Boke\nTekst.');
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
