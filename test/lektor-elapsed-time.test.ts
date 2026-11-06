import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { strings } from '../src/language/wording.ts';
import { elapsedLine } from '../src/ui/lektor/lektor-elapsed-time.ts';

const { elapsed } = strings('sr').lektor;

describe('elapsedLine', () => {
  it('counts seconds alone under a minute, dropping any fraction', () => {
    assert.equal(elapsedLine(42.9, elapsed), 'Radi već 42 s');
  });

  it('turns over to minutes at exactly sixty seconds', () => {
    assert.equal(elapsedLine(59.9, elapsed), 'Radi već 59 s');
    assert.equal(elapsedLine(60, elapsed), 'Radi već 1 min 0 s');
    assert.equal(elapsedLine(135, elapsed), 'Radi već 2 min 15 s');
  });

  it('stays at nothing if the clock has stepped back', () => {
    assert.equal(elapsedLine(-3, elapsed), 'Radi već 0 s');
  });
});
