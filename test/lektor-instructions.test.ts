import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { correctionInstruction, proposalFrom, withHisFilingMarks } from '../src/ui/lektor/lektor-instructions.ts';
import { LektorServiceError } from '../src/ui/lektor/lektor-service.ts';

/* What the Lektor asks for, and what it makes of the reply, whichever AI wrote it. */

describe('correctionInstruction', () => {
  const request = { text: 't', instruction: 'Uputstvo.', note: '' };

  it('holds corrections to correcting', () => {
    const asked = correctionInstruction({ ...request, preset: 'grammar' });
    assert.match(asked, /only corrected/);
    assert.match(asked, /do not understand/);
  });

  it('frees a rewrite from correcting, while still protecting quoted speech and his notes', () => {
    const asked = correctionInstruction({ ...request, preset: 'rewrite' });
    assert.doesNotMatch(asked, /only corrected/);
    assert.doesNotMatch(asked, /do not understand/);
    assert.match(asked, /quotation marks/);
    assert.match(asked, /notes the author/);
  });

  it('adds what he wrote himself, and nothing when he wrote only spaces', () => {
    assert.match(correctionInstruction({ ...request, preset: 'letters', note: ' Bez zareza. ' }), /The author adds \(in his own words\): Bez zareza\./);
    assert.doesNotMatch(correctionInstruction({ ...request, preset: 'letters', note: '   ' }), /The author adds/);
  });
});

describe('withHisFilingMarks', () => {
  it("lets the title's words be corrected", () => {
    assert.equal(withHisFilingMarks('Cuprija- Sumrak\n\nStari most.\n', 'Ćuprija – Sumrak\n\nStari, stari most.\n'), 'Ćuprija – Sumrak\n\nStari, stari most.\n');
  });

  it('puts back the marks his filing relies on when the reply tidied them away', () => {
    assert.equal(withHisFilingMarks('* * Pismo( konacno)\nTekst\n', 'Pismo (konačno)\nTekst.\n'), '* * Pismo (konačno)\nTekst.\n');
    assert.equal(withHisFilingMarks('AA(E)Kafana\nTekst\n', 'Kafana\nTekst.\n'), 'AA(E)Kafana\nTekst.\n');
    assert.equal(withHisFilingMarks('(UP) II   12 Grad\nTekst\n', 'Grad\nTekst.\n'), '(UP) II   12 Grad\nTekst.\n');
  });

  it('does not double the marks when the reply kept them', () => {
    assert.equal(withHisFilingMarks('  * Pismo\nTekst\n', '  * Pismo!\nTekst.\n'), '  * Pismo!\nTekst.\n');
    assert.equal(withHisFilingMarks('  * Pismo\nTekst\n', '* Pismo\nTekst.\n'), '  * Pismo\nTekst.\n');
  });

  it('keeps blank lines and ranking spaces before his title', () => {
    assert.equal(withHisFilingMarks('\n    Naslov\nTekst\n', 'Naslov\nTekst.\n'), '\n    Naslov\nTekst.\n');
  });

  it('accepts a title reworded altogether, keeping only its filing', () => {
    assert.equal(withHisFilingMarks('zz Stari most\n\nDjed je govorio.\n', 'Most nad vodom\n\nDjed reče.\n'), 'zz Most nad vodom\n\nDjed reče.\n');
  });

  it('puts his title back on top when the reply dropped it, losing nothing', () => {
    assert.equal(withHisFilingMarks('Stari most\n\nDjed je govorio.\n', 'Djed je rekao.\n'), 'Stari most\n\nDjed je rekao.\n');
  });

  it('leaves a reply with no lines to the check for short replies', () => {
    assert.equal(withHisFilingMarks('Naslov\n', '  '), '  ');
  });
});

describe('proposalFrom', () => {
  const original = 'Jedan dugačak tekst koji se ispravlja.\n';

  it('takes off a code fence and gives back his own ending', () => {
    assert.equal(proposalFrom('```\nJedan dugačak tekst koji je ispravljen.\n```', original), 'Jedan dugačak tekst koji je ispravljen.\n');
  });

  it('refuses a reply so short that accepting it would delete his text', () => {
    assert.throws(() => proposalFrom('Jedan.', original), (thrown: unknown) => thrown instanceof LektorServiceError && thrown.failure === 'cut-off');
  });

  it('turns Cyrillic letters that slipped into a Latin text into the Latin ones they stand for', () => {
    assert.equal(proposalFrom('Štеđen i nasloжen, Љepota zapršкан tekst.', 'Stedjen i naslozen, Ljepota zaprshkan tekst.'), 'Šteđen i nasložen, Ljepota zaprškan tekst.');
  });

  it('leaves the Cyrillic alone in a text that has Cyrillic of its own', () => {
    assert.equal(proposalFrom('Цитат на ћирилици и ostatak teksta.', 'Citat: цитат на ћирилици и ostatak teksta.'), 'Цитат на ћирилици и ostatak teksta.');
  });
});
