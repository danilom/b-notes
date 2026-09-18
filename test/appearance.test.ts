import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS, clampZoom, stepZoom } from '../src/ui/appearance.ts';

describe('how large he has made everything', () => {
  it('stops at the ends rather than running away', () => {
    assert.equal(stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
    assert.equal(stepZoom(MIN_ZOOM, -1), MIN_ZOOM);
  });

  it('lands back exactly where it started after a step up and down', () => {
    for (const from of ZOOM_STEPS.slice(1, -1)) {
      assert.equal(stepZoom(stepZoom(from, 1), -1), from, `from ${from}`);
    }
  });

  it('steps through the sizes a browser shows, not ones of our own invention', () => {
    const climbed: number[] = [];
    let at: number = MIN_ZOOM;
    while (at !== MAX_ZOOM) {
      at = stepZoom(at, 1);
      climbed.push(at);
    }
    // Exactly Chrome's own ladder over this range: no 121%, no 146%.
    assert.deepEqual(climbed, [0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);
  });

  it('brings a size written by some other build onto the nearest real step', () => {
    assert.equal(clampZoom(1.21), 1.25);
    assert.equal(clampZoom(1.46), 1.5);
    assert.equal(clampZoom(0.01), MIN_ZOOM);
    assert.equal(clampZoom(99), MAX_ZOOM);
  });

  it('steps off an in-between size onto the ladder rather than past it', () => {
    assert.equal(stepZoom(1.21, 1), 1.5);
    assert.equal(stepZoom(1.21, -1), 1.1);
  });

  it('refuses a stored value that is not a usable number', () => {
    assert.equal(clampZoom(Number.NaN), 1);
    assert.equal(clampZoom(Number.POSITIVE_INFINITY), 1);
  });
});
