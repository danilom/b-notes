import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { strings } from '../src/language/wording.ts';
import { elapsedLine } from '../src/ui/lektor/lektor-elapsed-time.ts';

const { elapsed } = strings('sr').lektor.window;

describe('elapsedLine', () => {
  it('counts seconds alone under a minute, dropping any fraction', () => {
    assert.equal(elapsedLine(42.9, elapsed), 'Prošlo je 42 s');
  });

  it('turns over to minutes at exactly sixty seconds', () => {
    assert.equal(elapsedLine(59.9, elapsed), 'Prošlo je 59 s');
    assert.equal(elapsedLine(60, elapsed), 'Prošlo je 1 min 0 s');
    assert.equal(elapsedLine(135, elapsed), 'Prošlo je 2 min 15 s');
  });

  it('stays at nothing if the clock has stepped back', () => {
    assert.equal(elapsedLine(-3, elapsed), 'Prošlo je 0 s');
  });
});
