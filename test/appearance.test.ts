import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_ZOOM, MIN_ZOOM, clampZoom, stepZoom } from '../src/ui/appearance.ts';

describe('how large he has made everything', () => {
  it('stops at the ends rather than running away', () => {
    assert.equal(stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
    assert.equal(stepZoom(MIN_ZOOM, -1), MIN_ZOOM);
  });

  it('lands back exactly where it started after a step up and down', () => {
    for (const from of [0.8, 1, 1.21, 1.61, 2.14]) {
      assert.equal(stepZoom(stepZoom(from, 1), -1), from, `from ${from}`);
    }
  });

  it('changes by the same apparent amount whether it is small or large', () => {
    const small = stepZoom(1, 1) / 1;
    const large = stepZoom(2, 1) / 2;
    assert.ok(Math.abs(small - large) < 0.01, `${small} vs ${large}`);
  });

  it('refuses a stored value that is not a usable number', () => {
    assert.equal(clampZoom(Number.NaN), 1);
    assert.equal(clampZoom(Number.POSITIVE_INFINITY), 1);
  });
});
