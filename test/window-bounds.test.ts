import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Rect, pulledBackOnScreen } from '../src/hosts/electron/window-bounds.ts';

/** A plain 1920x1080 screen with a taskbar along the bottom. */
const DESK: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const WINDOW = { width: 1100, height: 800 };
const at = (x: number, y: number): Rect => ({ x, y, ...WINDOW });

describe('keeping the window where he can reach it', () => {
  it('leaves it alone in the middle of the screen', () => {
    assert.equal(pulledBackOnScreen(at(300, 120), DESK), null);
  });

  it('leaves it alone hanging off the side, which is his business', () => {
    // Half off the right is a window he put there, not a window he has lost.
    assert.equal(pulledBackOnScreen(at(1400, 120), DESK), null);
  });

  it('leaves it alone filling the screen exactly', () => {
    assert.equal(pulledBackOnScreen(DESK, DESK), null);
  });

  it('brings it back when nearly all of it has gone off the right', () => {
    assert.deepEqual(pulledBackOnScreen(at(1860, 120), DESK), { x: 820, y: 120, ...WINDOW });
  });

  it('brings it back when it has gone off the left', () => {
    assert.deepEqual(pulledBackOnScreen(at(-1050, 120), DESK), { x: 0, y: 120, ...WINDOW });
  });

  it('brings it back when it has gone under the taskbar', () => {
    assert.deepEqual(pulledBackOnScreen(at(300, 1000), DESK), { x: 300, y: 240, ...WINDOW });
  });

  it('brings it back when it has gone off the top', () => {
    assert.deepEqual(pulledBackOnScreen(at(300, -760), DESK), { x: 300, y: 0, ...WINDOW });
  });

  it('brings it back when it has gone off a corner', () => {
    assert.deepEqual(pulledBackOnScreen(at(-1080, -790), DESK), { x: 0, y: 0, ...WINDOW });
  });

  it('never changes how big it is', () => {
    const back = pulledBackOnScreen(at(4000, 4000), DESK);

    assert.equal(back?.width, WINDOW.width);
    assert.equal(back?.height, WINDOW.height);
  });

  it('settles at once, rather than needing bringing back again', () => {
    // It is called again after it moves the window, so a correction that still
    // failed the test would move it for ever.
    const back = pulledBackOnScreen(at(4000, 4000), DESK);

    assert.equal(pulledBackOnScreen(back ?? at(0, 0), DESK), null);
  });

  it('works on a screen that does not start at zero, as a second one does not', () => {
    // A monitor to the left of the main one has negative coordinates, and a
    // window living happily on it must not be dragged back to the other screen.
    const left: Rect = { x: -1920, y: 0, width: 1920, height: 1040 };

    assert.equal(pulledBackOnScreen(at(-1500, 100), left), null);
    // Back by its right edge, not flung to the far corner: the smallest move
    // that puts the whole of it on that screen.
    assert.deepEqual(pulledBackOnScreen(at(-60, 100), left), { x: -1100, y: 100, ...WINDOW });
  });

  it('puts a window too big for the screen at the corner rather than nowhere', () => {
    const small: Rect = { x: 0, y: 0, width: 800, height: 600 };
    const huge = { x: 3000, y: 3000, width: 1400, height: 900 };

    assert.deepEqual(pulledBackOnScreen(huge, small), { x: 0, y: 0, width: 1400, height: 900 });
  });
});
