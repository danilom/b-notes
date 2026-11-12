import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appUpdateFrom } from '../src/platform/app-update.ts';

describe('appUpdateFrom', () => {
  it('takes a download under way and one waiting, with their version', () => {
    assert.deepEqual(appUpdateFrom({ kind: 'downloading', version: '1.0.1' }), { kind: 'downloading', version: '1.0.1' });
    assert.deepEqual(appUpdateFrom({ kind: 'downloaded', version: '1.0.1' }), { kind: 'downloaded', version: '1.0.1' });
  });

  it('reads anything else as no update', () => {
    for (const value of [null, undefined, 'downloaded', { kind: 'downloaded' }, { kind: 'downloaded', version: '' }, { kind: 'installing', version: '1' }, { kind: 'downloaded', version: 101 }]) {
      assert.deepEqual(appUpdateFrom(value), { kind: 'none' });
    }
  });
});
