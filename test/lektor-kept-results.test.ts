import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { keptResultsFrom, readKeptResults, writeKeptResults } from '../design/lektor-kept-results.ts';

const RESULTS = { feedback: 'Utisak.', readText: 'Tekst.', readAt: 5, proposal: 'Tekst!', proposalFor: 'Tekst.' };

beforeEach(() => {
  const held = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => void held.set(key, value) } },
    configurable: true,
  });
});

describe('kept Lektor results', () => {
  it('come back as they were saved, for that text only', () => {
    writeKeptResults('jedan', RESULTS);
    assert.deepEqual(readKeptResults('jedan'), RESULTS);
    assert.equal(readKeptResults('drugi'), null);
  });

  it('are ignored when the store holds something unreadable', () => {
    window.localStorage.setItem('lektor-kept:jedan', '{polovina');
    assert.equal(readKeptResults('jedan'), null);
  });

  it('are ignored when a field is missing or of the wrong kind', () => {
    assert.equal(keptResultsFrom({ ...RESULTS, proposalFor: undefined }), null);
    assert.equal(keptResultsFrom({ ...RESULTS, readAt: 'juče' }), null);
    assert.equal(keptResultsFrom(null), null);
  });

  it('do not stop the Lektor when the store is full', () => {
    window.localStorage.setItem = () => {
      throw new Error('Quota exceeded');
    };
    assert.doesNotThrow(() => writeKeptResults('jedan', RESULTS));
  });
});
