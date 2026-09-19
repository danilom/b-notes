import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Rect, deskAround, keptOnTheDesk } from '../src/hosts/electron/window-bounds.ts';

/** One 1920x1080 screen with a taskbar along the bottom. */
const ONE: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const WINDOW = { width: 1100, height: 800 };
const at = (x: number, y: number): Rect => ({ x, y, ...WINDOW });

describe('the desk his screens make', () => {
  it('is the screen itself, when he has one', () => {
    assert.deepEqual(deskAround([ONE]), ONE);
  });

  it('reaches across a second screen to the right', () => {
    const right: Rect = { x: 1920, y: 0, width: 1280, height: 1000 };

    assert.deepEqual(deskAround([ONE, right]), { x: 0, y: 0, width: 3200, height: 1040 });
  });

  it('reaches across a second screen to the left, which starts below zero', () => {
    const left: Rect = { x: -1280, y: 0, width: 1280, height: 1000 };

    assert.deepEqual(deskAround([ONE, left]), { x: -1280, y: 0, width: 3200, height: 1040 });
  });

  it('reaches over a screen above, and one at a different height', () => {
    const above: Rect = { x: 200, y: -900, width: 1600, height: 900 };

    assert.deepEqual(deskAround([ONE, above]), { x: 0, y: -900, width: 1920, height: 1940 });
  });

  it('is nothing at all when there are no screens, rather than a crash', () => {
    assert.deepEqual(deskAround([]), { x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('stopping the window at the edge of the desk', () => {
  it('lets him put it anywhere on the screen', () => {
    assert.equal(keptOnTheDesk(at(300, 120), ONE), null);
  });

  it('lets it hang over an edge by a little, so snapping is left alone', () => {
    // A maximised or snapped window overhangs the work area by its border. A
    // rule with no give in it would fight that every time.
    assert.equal(keptOnTheDesk(at(-8, -8), ONE), null);
    assert.equal(keptOnTheDesk(at(ONE.width - WINDOW.width + 8, 120), ONE), null);
  });

  it('stops it going off the right', () => {
    const kept = keptOnTheDesk(at(1500, 120), ONE);

    assert.equal(kept?.x, 1920 + 32 - 1100);
    assert.equal(kept?.y, 120);
  });

  it('stops it going off the left', () => {
    assert.equal(keptOnTheDesk(at(-400, 120), ONE)?.x, -32);
  });

  it('stops it going under the taskbar', () => {
    assert.equal(keptOnTheDesk(at(300, 900), ONE)?.y, 1040 + 32 - 800);
  });

  it('stops it going off the top', () => {
    assert.equal(keptOnTheDesk(at(300, -200), ONE)?.y, -32);
  });

  it('never changes how big it is', () => {
    const kept = keptOnTheDesk(at(9000, 9000), ONE);

    assert.equal(kept?.width, WINDOW.width);
    assert.equal(kept?.height, WINDOW.height);
  });

  it('settles at once, rather than being corrected again', () => {
    // It runs again after it moves the window, so a correction that still
    // failed would move it for ever.
    const kept = keptOnTheDesk(at(9000, 9000), ONE);

    assert.equal(keptOnTheDesk(kept ?? at(0, 0), ONE), null);
  });

  it('lets him carry it from one screen to the next', () => {
    // Halfway between two monitors the window is over the edge of both. Held to
    // whichever was nearest, it could never make the journey.
    const desk = deskAround([ONE, { x: 1920, y: 0, width: 1280, height: 1000 }]);

    // Straddling the join, then settled on the far screen. Both fit on the
    // desk, so neither is refused.
    assert.equal(keptOnTheDesk(at(1600, 120), desk), null);
    assert.equal(keptOnTheDesk(at(2000, 120), desk), null);
  });

  it('still stops it at the far edge of the second screen', () => {
    const desk = deskAround([ONE, { x: 1920, y: 0, width: 1280, height: 1000 }]);

    assert.equal(keptOnTheDesk(at(3500, 120), desk)?.x, 3200 + 32 - 1100);
  });

  it('puts a window wider than the desk at the near edge rather than nowhere', () => {
    const small: Rect = { x: 0, y: 0, width: 800, height: 600 };
    const huge = { x: 3000, y: 3000, width: 1400, height: 900 };

    assert.deepEqual(keptOnTheDesk(huge, small), { x: -32, y: -32, width: 1400, height: 900 });
  });
});
