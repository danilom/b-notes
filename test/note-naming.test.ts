import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { broughtBackNameFor, codeOf, copyNameFor, newNameFor, safeTitle, tagOf, unusedName } from '../src/notes/note-naming.ts';

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

  it('steers round them where a dot follows, which Windows reads as the same device', () => {
    assert.equal(safeTitle('Con. Pismo'), '_Con. Pismo');
    assert.equal(safeTitle('nul.txt'), '_nul.txt');
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

describe('the code a copy carries, which the stub in Resoph tells him to search for', () => {
  const stem = '                %2AGRAD Kilim';

  it('is read off a copy name, tilde and all', () => {
    assert.equal(codeOf(copyNameFor(stem)), `~${tagOf(stem)}`);
  });

  it('is the same on a second copy of the same Resoph file, which only gains a number', () => {
    assert.equal(codeOf(`${copyNameFor(stem)} 2`), `~${tagOf(stem)}`);
  });

  it('is not found in a text started in b-notes, whose name ends in when and where', () => {
    const when = new Date(2026, 8, 27, 14, 32, 10);
    assert.equal(codeOf(newNameFor('Pismo', when, 'LAPTOP')), null);
    assert.equal(codeOf(newNameFor('Pismo ~ABC123', when, 'PC')), null);
  });

  it('is not found in a name without one', () => {
    assert.equal(codeOf('Pismo'), null);
    assert.equal(codeOf('Pismo ~k3f9a2'), null);
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

describe('the name of a text brought back from an archive', () => {
  it('is never the name of the copy of the Resoph text it shares a name with', () => {
    assert.notEqual(broughtBackNameFor('Stari laptop', 'Pismo.txt', 'Pismo'), copyNameFor('Pismo'));
  });

  it('tells apart the .md and the .txt of one name in one archive', () => {
    assert.notEqual(
      broughtBackNameFor('Stari laptop', 'Pismo.md', 'Pismo'),
      broughtBackNameFor('Stari laptop', 'Pismo.txt', 'Pismo'),
    );
  });

  it('takes its readable part from the title, made safe', () => {
    assert.match(broughtBackNameFor('Stari laptop', '   %2AKOTOR.md', '   *KOTOR'), /^KOTOR ~[0-9A-Z]{6}$/);
  });
});
