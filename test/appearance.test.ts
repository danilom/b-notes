import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_WRITING,
  MAX_ZOOM,
  MIN_SCALE,
  SCALE_STEPS,
  clampScale,
  stepScale,
} from '../src/ui/settings/appearance.ts';

describe('how large he has made everything', () => {
  it('stops at the ends rather than running away', () => {
    assert.equal(stepScale(MAX_WRITING, 1), MAX_WRITING);
    assert.equal(stepScale(MIN_SCALE, -1), MIN_SCALE);
  });

  it('lands back exactly where it started after a step up and down', () => {
    for (const from of SCALE_STEPS.slice(1, -1)) {
      assert.equal(stepScale(stepScale(from, 1), -1), from, `from ${from}`);
    }
  });

  it('steps through the sizes a browser shows, not ones of our own invention', () => {
    const climbed: number[] = [];
    let at: number = MIN_SCALE;
    while (at !== MAX_WRITING) {
      at = stepScale(at, 1);
      climbed.push(at);
    }
    // Exactly Chrome's own ladder over this range: no 121%, no 146%.
    assert.deepEqual(climbed, [0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);
  });

  it('stops the app a rung below where his writing may go', () => {
    assert.equal(stepScale(MAX_ZOOM, 1, MAX_ZOOM), MAX_ZOOM);
    assert.equal(stepScale(MAX_ZOOM, 1, MAX_WRITING), MAX_WRITING);
    // A zoom saved by a build that allowed more comes down to what we allow.
    assert.equal(clampScale(2, MAX_ZOOM), MAX_ZOOM);
  });

  it('brings a size written by some other build onto the nearest real step', () => {
    assert.equal(clampScale(1.21), 1.25);
    assert.equal(clampScale(1.46), 1.5);
    assert.equal(clampScale(0.01), MIN_SCALE);
    assert.equal(clampScale(99), MAX_WRITING);
  });

  it('steps off an in-between size onto the ladder rather than past it', () => {
    assert.equal(stepScale(1.21, 1), 1.5);
    assert.equal(stepScale(1.21, -1), 1.1);
  });

  it('refuses a stored value that is not a usable number', () => {
    assert.equal(clampScale(Number.NaN), 1);
    assert.equal(clampScale(Number.POSITIVE_INFINITY), 1);
  });
});
