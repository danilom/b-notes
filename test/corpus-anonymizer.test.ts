import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anonymize, oddityOfFile, oddityOfName } from '../scripts/anonymize-corpus.mjs';

/**
 * The script that makes his corpus safe to carry off his machine.
 *
 * Every failure here is silent in the worst direction: a cut in the wrong place
 * or a letter left alone looks exactly like a working copy, and what it hands
 * over is his writing.
 */

const words = (n: number, stem = 'Reč'): string =>
  Array.from({ length: n }, (_, i) => `${stem}${i + 1}`).join(' ');

const redacted = (text: string, keep = 30): string =>
  anonymize(Buffer.from(text, 'utf8'), keep).bytes.toString('utf8');

describe('what survives of his writing', () => {
  it('keeps exactly the first thirty words and turns every later letter into an x', () => {
    const out = redacted(words(32, 'Word'));
    assert.ok(out.includes('Word30 '), out);
    assert.ok(out.endsWith('Xxxx31 Xxxx32'), out);
  });

  it('keeps a short text whole rather than inventing x-es it never had', () => {
    assert.equal(redacted('Samo četiri reči ovde'), 'Samo četiri reči ovde');
  });

  it('keeps his title however it is laid out, across as many lines as it takes', () => {
    const text = `Naslov\r\n\r\npodnaslov\n${words(40)}`;
    assert.ok(redacted(text).startsWith('Naslov\r\n\r\npodnaslov\nReč1 '));
  });

  it('does not spend his thirty words on rules and brackets', () => {
    // "- [ ]" is a real title in his corpus. Counted as three words, a line of
    // decoration would eat the budget meant for his opening.
    const out = redacted(`*** --- [ ] ---\n${words(31, 'Zima')}`);
    assert.ok(out.includes('Zima30 Xxxx31'), out);
  });

  it('touches nothing but ASCII letters: not digits, punctuation, spacing or Serbian', () => {
    const out = redacted(`${words(30)}\r\n\tČaša, 42 — ćup! Žar.`);
    assert.ok(out.endsWith('\r\n\tČxšx, 42 — ćxx! Žxx.'), out);
  });

  it('comes out the same length it went in, whatever the encoding', () => {
    // Byte for byte is what lets a file in an encoding nobody identified come
    // back still in that encoding.
    const cp1250 = Buffer.from([...Buffer.from(`${words(30)} `), 0xe8, 0x61, 0x9a, 0x41]);
    const out = anonymize(cp1250).bytes;
    assert.equal(out.length, cp1250.length);
    assert.deepEqual([...out.subarray(-4)], [0xe8, 0x78, 0x9a, 0x58]);
  });

  it('reads a Notepad "Unicode" file in its own units, not as bytes', () => {
    // As bytes, č is 0D 01 — a carriage return — and the words are cut in the
    // wrong places. This is the failure that keeps the wrong amount of him.
    const text = `Unicode naslov\r\n${words(40, 'Mačka')}`;
    const file = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

    const { bytes, read } = anonymize(file);
    const back = bytes.subarray(2).toString('utf16le');

    assert.equal(read, 'utf-16le');
    assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe]);
    assert.ok(back.includes('Mačka28 Xxčxx29'), back);
  });

  it('reads a big-endian file the same way and writes it back big-endian', () => {
    const body = Buffer.from(words(31, 'Pas'), 'utf16le');
    body.swap16();
    const file = Buffer.concat([Buffer.from([0xfe, 0xff]), body]);

    const out = Buffer.from(anonymize(file).bytes.subarray(2));
    out.swap16();

    assert.ok(out.toString('utf16le').endsWith('Pas30 Xxx31'));
  });

  it('keeps a UTF-8 mark at the front and does not count it as a word', () => {
    // Opening on a blank line, which is where it would matter: the mark then
    // stands alone, and counted as a word it would cost him one of his thirty.
    const file = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`\r\n${words(31)}`)]);
    const out = anonymize(file).bytes;
    assert.deepEqual([...out.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(out.toString('utf8').endsWith('Reč30 Xxč31'));
  });

  it('treats a file marked UTF-16 with an odd number of bytes as bytes, and says so', () => {
    const file = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('abc', 'latin1')]);
    assert.equal(anonymize(file).read, 'utf-16le, odd length');
  });
});

describe('what the census says about a name', () => {
  it('reports the dots and spaces Windows trims off the end, as one finding', () => {
    assert.deepEqual(oddityOfName('Tekst. '), ['ends in ". ", which Windows trims']);
  });

  it('reports device names with or without an extension', () => {
    assert.ok(oddityOfName('CON.txt').includes('is a reserved device name'));
    assert.ok(oddityOfName('nul').includes('is a reserved device name'));
    assert.deepEqual(oddityOfName('Console.txt'), []);
  });

  it('reports a name spelt with a letter and a separate accent', () => {
    assert.deepEqual(oddityOfName('čevapi.txt'), ['is not in normal form']);
  });

  it('reports a character nobody can see', () => {
    assert.deepEqual(oddityOfName('zero​width.txt'), ['holds an invisible mark']);
  });

  it('says nothing about an ordinary name of his', () => {
    assert.deepEqual(oddityOfName('Pismo Mileni 2019.txt'), []);
  });
});

describe('what the census says about a file', () => {
  it('does not mistake the line endings of a UTF-16 file for lone carriage returns', () => {
    const file = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('a\r\nb\r\n', 'utf16le')]);
    assert.deepEqual(oddityOfFile(file, 'utf-16le'), ['is utf-16le']);
  });

  it('flags zero bytes in a file with no mark, which is UTF-16 read the wrong way', () => {
    const file = Buffer.from('a\u0000b\u0000', 'latin1');
    assert.ok(oddityOfFile(file, 'bytes').includes('holds NUL bytes but has no mark saying what it is'));
  });

  it('reports tabs and mixed line endings, which is what Notepad hides', () => {
    const why = oddityOfFile(Buffer.from('a\tb\r\nc\nd'), 'bytes');
    assert.ok(why.includes('holds tabs'));
    assert.ok(why.includes('mixes line endings'));
  });
});
