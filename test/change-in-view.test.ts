import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scrollShowing } from '../src/ui/change-in-view.ts';

const view = { height: 600, scrollable: 7000 };

describe('putting one change of a diff in front of him', () => {
  it('leaves text above it, so it reads as a change inside his writing', () => {
    const at = scrollShowing({ top: 2000, height: 120 }, view);

    assert.equal(2000 - at, 240, 'a screen and a bit above the change');
  });

  it('gives a change taller than the view most of the view', () => {
    // Room above costs him the thing he came to see, once the thing is bigger
    // than the room.
    const at = scrollShowing({ top: 2000, height: 900 }, view);

    assert.equal(2000 - at, 72);
  });

  it('does not scroll past the top for a change near the beginning', () => {
    assert.equal(scrollShowing({ top: 60, height: 120 }, view), 0);
  });

  it('does not scroll past the end for the last change', () => {
    // 7500 less its 240 of room is still past the bottom of the box.
    assert.equal(scrollShowing({ top: 7500, height: 120 }, view), 7000);
  });

  it('leaves a diff that fits on one screen where it is', () => {
    assert.equal(scrollShowing({ top: 100, height: 120 }, { height: 600, scrollable: 0 }), 0);
  });
});
