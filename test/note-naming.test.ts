import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { copyNameFor, newNameFor, safeTitle, tagOf, unusedName } from '../src/notes/note-naming.ts';

describe('a title made safe for a filename', () => {
  it('takes the diacritics off, which Windows zip mangles', () => {
    assert.equal(safeTitle('Čizme u tropima, Đurđevdan'), 'Cizme u tropima, Durdevdan');
  });

  it('takes his ranking spaces off both ends, which Explorer refuses', () => {
    assert.equal(safeTitle('                  Pismo  iz Boke   '), 'Pismo iz Boke');
  });

  it('turns everything Windows or zip might refuse into a space', () => {
    assert.equal(safeTitle('*GRAD Kilim? 11\\10\\2021 a/b: "c" <d> |e|'), 'GRAD Kilim 11 10 2021 a b c d e');
  });

  it('never keeps the tilde that separates the tag', () => {
    assert.equal(safeTitle('Pismo ~ABC123'), 'Pismo ABC123');
  });

  it('drops a trailing dot, which Windows drops on its own', () => {
    assert.equal(safeTitle('Krugovi druga verz.'), 'Krugovi druga verz');
  });

  it('cuts a long title at a word', () => {
    const cut = safeTitle('Generali naci gadjenje i slava divljenje i odvratnost nuzda neizbjeznost');
    assert.ok(cut.length <= 50, cut);
    assert.equal(cut, 'Generali naci gadjenje i slava divljenje i');
  });

  it('says Bez naslova when nothing usable is left', () => {
    assert.equal(safeTitle('   ***   '), 'Bez naslova');
    assert.equal(safeTitle(''), 'Bez naslova');
  });

  it('steers round the names Windows reserves for devices', () => {
    assert.equal(safeTitle('con'), '_con');
  });
});

describe('the tag that makes a name unique', () => {
  it('is six upper-case letters and digits', () => {
    assert.match(tagOf('Pismo'), /^[0-9A-Z]{6}$/);
  });

  it('is the same for the same text, whenever and wherever it is worked out', () => {
    assert.equal(tagOf('   Pismo%2A'), tagOf('   Pismo%2A'));
  });

  it('differs for texts that differ only in their spacing', () => {
    assert.notEqual(tagOf('   Pismo'), tagOf('    Pismo'));
  });
});

describe('the name of a copy b-notes makes of a Resoph text', () => {
  it('is the title made safe, then the tag of the exact Resoph name', () => {
    const stem = '                %2AGRAD Kilim';
    assert.equal(copyNameFor(stem), `GRAD Kilim ~${tagOf(stem)}`);
  });

  it('is the same every time, so two machines copying one file write one file', () => {
    assert.equal(copyNameFor('   Pismo'), copyNameFor('   Pismo'));
  });

  it('keeps his spacing variants apart, though they read the same', () => {
    assert.notEqual(copyNameFor('   Pismo'), copyNameFor('         Pismo'));
    assert.notEqual(copyNameFor('Pismo'), copyNameFor(' Pismo'));
  });
});

describe('the name of a text he starts in b-notes', () => {
  const when = new Date(2026, 8, 27, 14, 32, 10);

  it('is the first line made safe, then when and where it was started', () => {
    assert.equal(newNameFor('Pismo za Zoru', when, 'DELL-7'), 'Pismo za Zoru ~2026-09-27 14-32-10 DELL-7');
  });

  it('differs between two machines starting the same title at the same moment', () => {
    assert.notEqual(newNameFor('Pismo', when, 'Dell'), newNameFor('Pismo', when, 'Asus'));
  });

  it('keeps only the plain part of a machine name', () => {
    assert.equal(newNameFor('Pismo', when, 'Branov laptop (stari)'), 'Pismo ~2026-09-27 14-32-10 Branovlaptopstari');
    assert.equal(newNameFor('Pismo', when, '***'), 'Pismo ~2026-09-27 14-32-10 PC');
  });
});

describe('a free name, for the rare move inside b-notes own folder', () => {
  it('is the name itself when nothing holds it', () => {
    assert.equal(unusedName('Pismo ~K3F9A2', new Set()), 'Pismo ~K3F9A2');
  });

  it('counts up past whatever is taken, never with brackets', () => {
    assert.equal(unusedName('Pismo', new Set(['Pismo', 'Pismo 2'])), 'Pismo 3');
  });
});
