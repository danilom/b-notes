import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeResophTray } from '../src/ui/settings/advanced-panel.ts';

const OCT_2 = new Date(2026, 9, 2, 14, 0).getTime();

describe("what the advanced panel says about Resoph's minimize-to-tray", () => {
  it('says off, and when b-notes switched it off, without alarm', () => {
    assert.deepEqual(describeResophTray({ on: false, switchedOffAt: OCT_2 }), {
      said: 'off (switched off by b-notes 2026-10-02)',
      trouble: false,
    });
  });

  it('says simply off when someone else switched it off', () => {
    assert.deepEqual(describeResophTray({ on: false, switchedOffAt: null }), { said: 'off', trouble: false });
  });

  it('marks it as trouble while it is on', () => {
    assert.equal(describeResophTray({ on: true, switchedOffAt: null }).trouble, true);
  });

  it('says when it was turned back on after b-notes switched it off', () => {
    assert.deepEqual(describeResophTray({ on: true, switchedOffAt: OCT_2 }), {
      said: 'on — turned back on since it was switched off by b-notes 2026-10-02',
      trouble: true,
    });
  });

  it('says so, calmly, on a machine without Resoph', () => {
    assert.deepEqual(describeResophTray({ on: null, switchedOffAt: null }), {
      said: 'no Resoph settings on this machine',
      trouble: false,
    });
  });
});
