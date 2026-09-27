import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isStub, stubText } from '../src/notes/resoph-stub.ts';

const MOVED = stubText({
  kind: 'moved',
  when: new Date(2026, 8, 27, 14, 32),
  machine: 'ASUS',
  path: 'D:\\Dropbox\\b-notes\\GRAD Kilim ~K3F9A2.txt',
});
const DELETED = stubText({
  kind: 'deleted',
  when: new Date(2026, 8, 27, 14, 32),
  machine: 'ASUS',
  path: 'D:\\Dropbox\\b-notes\\GRAD Kilim ~K3F9A2.txt',
});

describe('the stub left in Resoph', () => {
  it('says loudly where the text went, and records when, where and from what', () => {
    const lines = MOVED.split('\r\n');
    assert.equal(lines[0], '!!! OVAJ TEKST JE PREMEŠTEN U B-NOTES !!!');
    assert.ok(lines.includes('[b-notes] 2026-09-27 14:32, ASUS'));
    assert.ok(lines.includes('[b-notes] D:\\Dropbox\\b-notes\\GRAD Kilim ~K3F9A2.txt'));
    assert.ok(lines.includes('[b-notes] https://github.com/danilom/b-notes/releases'));
  });

  it('says it was deleted, and where to bring it back from, when it was', () => {
    assert.equal(DELETED.split('\r\n')[0], '!!! OVAJ TEKST JE OBRISAN U B-NOTES !!!');
    assert.match(DELETED, /Obrisani tekstovi/);
  });
});

describe('recognising a stub', () => {
  it('knows the stubs it writes, with either line ending', () => {
    assert.equal(isStub(MOVED), true);
    assert.equal(isStub(DELETED), true);
    assert.equal(isStub(MOVED.replaceAll('\r\n', '\n')), true);
  });

  it('forgives a few stray characters anywhere, even in its loud first line', () => {
    assert.equal(isStub(`${MOVED}x`), true);
    assert.equal(isStub(MOVED.replace('PREMEŠTEN', 'PREMEŠTENjj')), true);
    assert.equal(isStub(`dd\r\n${MOVED}`), true);
  });

  it('counts a sentence he wrote into it as his writing', () => {
    assert.equal(isStub(`${MOVED}\r\nIpak sam ovde dopisao jednu recenicu.`), false);
    assert.equal(isStub(`Novi pocetak teksta koji sam ovde napisao.\r\n${MOVED}`), false);
  });

  it('counts words typed onto the end of its last line as his', () => {
    assert.equal(isStub(`${MOVED} i jos malo mojih reci, ovde dopisanih posle linka.`), false);
  });

  it('never takes one of his texts for a stub', () => {
    assert.equal(isStub('Dragi prijatelju, pisem ti iz grada.'), false);
    assert.equal(isStub(''), false);
    assert.equal(isStub('Tekst u kome pise [b-notes] negde u sredini, ali to je moj tekst.'), false);
  });
});
