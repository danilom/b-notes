import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { holdsAnythingElse, isStub, stubText } from '../src/notes/resoph-stub.ts';

/*
  EVERY STUB WORDING THAT HAS SHIPPED, VERBATIM. Append; never edit or remove.

  These sit in his Resoph folder for good, and every b-notes to come must know
  them for what they are. The newest pair must equal what `stubText` writes
  today, so changing the wording fails a test until the new pair is added here
  — and the old pairs go on being checked against the frozen rule.
*/
const SHIPPED: readonly { since: string; moved: string; deleted: string }[] = [
  {
    since: 'the first release with stubs',
    moved: [
      '[b-notes] 📋 OVAJ TEKST JE PREMEŠTEN U B-NOTES',
      '[b-notes] ❌ NE PIŠI OVDE — ovde ga više nema.',
      '[b-notes] Otvori b-notes i ukucaj ~K3F9A2 u pretragu.',
      '',
      '[b-notes] Datum: 2026-09-28 14:32, Dell',
      '[b-notes] Fajl: C:\\Users\\Brano\\Dropbox\\b-notes\\GRAD Kilim ~K3F9A2.txt',
      '[b-notes] Program: https://github.com/danilom/b-notes/releases',
      '',
    ].join('\r\n'),
    deleted: [
      '[b-notes] 🗑 OVAJ TEKST JE OBRISAN IZ B-NOTES',
      '[b-notes] ❌ NE PIŠI OVDE — ovde ga više nema.',
      '[b-notes] Sačuvan je među obrisanima u b-notes.',
      '',
      '[b-notes] Ako ti ikad zatreba, otvori b-notes,',
      '[b-notes] ukucaj ~K3F9A2 u pretragu i vrati ga',
      '[b-notes] iz "Obrisani tekstovi".',
      '',
      '[b-notes] Datum: 2026-09-28 14:32, Dell',
      '[b-notes] Fajl: C:\\Users\\Brano\\Dropbox\\b-notes\\GRAD Kilim ~K3F9A2.txt',
      '[b-notes] Program: https://github.com/danilom/b-notes/releases',
      '',
    ].join('\r\n'),
  },
];

const FACTS = {
  when: new Date(2026, 8, 28, 14, 32),
  machine: 'Dell',
  path: 'C:\\Users\\Brano\\Dropbox\\b-notes\\GRAD Kilim ~K3F9A2.txt',
  code: '~K3F9A2',
};
const MOVED = stubText({ kind: 'moved', ...FACTS });
const DELETED = stubText({ kind: 'deleted', ...FACTS });

/** A sentence of his, `length` characters long not counting spaces. */
function his(length: number): string {
  let written = '';
  for (const word of 'Ovo sam ja dopisao u Resophu pa neka se zna sta je bilo i kako je bilo tada'.repeat(10).split(' ')) {
    for (const letter of word) {
      if (written.replace(/ /g, '').length === length) return written.trim();
      written += letter;
    }
    written += ' ';
  }
  return written.trim();
}

const lines = MOVED.split('\r\n');
const withLine = (at: number, line: string): string => lines.map((each, index) => (index === at ? line : each)).join('\r\n');

describe('every stub wording that has shipped', () => {
  it('is what b-notes writes today, for the newest', () => {
    const newest = SHIPPED.at(-1);
    assert.equal(MOVED, newest?.moved, 'the moved stub changed: add the new wording to SHIPPED');
    assert.equal(DELETED, newest?.deleted, 'the deleted stub changed: add the new wording to SHIPPED');
  });

  for (const { since, moved, deleted } of SHIPPED) {
    it(`is still a stub, and stops being one with a sentence of his in it: ${since}`, () => {
      for (const stub of [moved, deleted]) {
        assert.equal(isStub(stub), true);
        assert.equal(isStub(stub.replaceAll('\r\n', '\n')), true);
        assert.equal(isStub(`${stub}${his(40)}`), false);
      }
    });
  }
});

/*
  Nothing below looks at the wording: that is pinned by the samples above and
  free to change. Only the frozen rule, and what b-notes needs in any wording.
*/
describe('what the stub says', () => {
  it('tells him the code to type into the search, moved or deleted', () => {
    assert.ok(MOVED.includes('~K3F9A2'));
    assert.ok(DELETED.includes('~K3F9A2'));
    assert.notEqual(MOVED, DELETED);
  });

  it('starts every line it writes with the prefix, and ends on an empty line of his', () => {
    const written = MOVED.split('\r\n').filter((line) => line !== '');
    assert.ok(written.every((line) => line.startsWith('[b-notes] ')));
    assert.equal(MOVED.endsWith('\r\n'), true);
  });

  it('shortens a long path in the middle, keeping the file name, so the line stays a stub line', () => {
    const deep = `C:\\Users\\Brano\\${'Dropbox\\Neka duboka fascikla\\'.repeat(8)}GRAD Kilim ~K3F9A2.txt`;
    const stub = stubText({ kind: 'moved', ...FACTS, path: deep });
    const pathLine = stub.split('\r\n').find((line) => line.startsWith('[b-notes] Fajl:')) ?? '';

    assert.ok([...pathLine.slice('[b-notes]'.length)].length <= 150, `${pathLine.length} long`);
    assert.ok(pathLine.endsWith('GRAD Kilim ~K3F9A2.txt'));
    assert.ok(pathLine.includes('…'));
    assert.equal(isStub(stub), true);
  });
});

describe('the frozen rule', () => {
  it('needs a line with the prefix, so none of his short notes is ever taken for a stub', () => {
    assert.equal(isStub(''), false);
    assert.equal(isStub('Pozvati Marka'), false);
    assert.equal(isStub('Tekst u kome pise [b-notes] negde u sredini, ali to je moj tekst.'), false);
  });

  it('knows the prefix with spaces before it or none after it', () => {
    assert.equal(isStub('   [b-notes] NE PIŠI OVDE'), true);
    assert.equal(isStub('[b-notes]NE PIŠI OVDE'), true);
  });

  it('forgives up to 20 characters of his, spaces aside, and no more', () => {
    assert.equal(isStub(`${MOVED}${his(20)}`), true);
    assert.equal(isStub(`${MOVED}${his(21)}`), false);
    assert.equal(isStub(`${MOVED}\r\n\r\n    \t\r\n`), true);
  });

  it('sees his words wherever they go outside the prefixed lines', () => {
    assert.equal(isStub(`${lines[0]}\r\n${his(30)}`), false, 'typed over everything but the headline');
    assert.equal(isStub(withLine(3, his(30))), false, 'typed into the blank line');
  });

  it('forgives anything on a prefixed line within 150 characters, and counts what goes past them', () => {
    assert.equal(isStub(withLine(1, `${lines[1]}${his(60)}`)), true);
    const full = `[b-notes] ${'x'.repeat(150)}`;
    assert.equal(isStub(withLine(1, `${full}${his(20)}`)), true);
    assert.equal(isStub(withLine(1, `${full}${his(21)}`)), false);
  });

  it('lets a first line of up to 100 characters pass, for a title Resoph wrote into the file', () => {
    assert.equal(isStub(`${his(100)}\r\n${MOVED}`), true);
    assert.equal(isStub(`${his(120)}\r\n${MOVED}`), true);
    assert.equal(isStub(`${his(121)}\r\n${MOVED}`), false);
  });

  it('stays a stub with its lines deleted, since nothing of his is in it', () => {
    assert.equal(isStub(lines[0] ?? ''), true);
    assert.equal(isStub(lines.slice(4).join('\r\n')), true);
  });
});

describe('what a stub holds besides b-notes own lines', () => {
  it('is nothing in a stub as b-notes wrote it', () => {
    assert.equal(holdsAnythingElse(MOVED), false);
    assert.equal(holdsAnythingElse(DELETED), false);
  });

  it('is a first line he wrote, or a stray character, even where the rule lets them pass', () => {
    assert.equal(holdsAnythingElse(`Moj prvi red\r\n${MOVED}`), true);
    assert.equal(holdsAnythingElse(`${MOVED}x`), true);
  });
});
