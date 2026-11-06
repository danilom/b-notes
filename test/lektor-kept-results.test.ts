import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { FileMissing, type FileSystem } from '../src/platform/file-system.ts';
import type { Log } from '../src/platform/logging.ts';
import { keptResultsFrom, readKeptResults, writeKeptResults } from '../src/ui/lektor/lektor-kept-results.ts';

const RESULTS = { feedback: 'Utisak.', readText: 'Tekst.', readAt: 5, proposal: 'Tekst!', proposalFor: 'Tekst.' };
const NAME = '   * čudno ime %2A ~1.txt';

let held: Map<string, string>;
let warnings: string[];

const log: Log = {
  info: () => undefined,
  warn: (message) => void warnings.push(message),
  error: (message) => void warnings.push(message),
};

const files = {
  read: async (at: string) => {
    const found = held.get(at);
    if (found === undefined) throw new FileMissing(at);
    return found;
  },
  write: async (at: string, text: string) => void held.set(at, text),
} as unknown as FileSystem;

beforeEach(() => {
  held = new Map();
  warnings = [];
});

describe('kept Lektor results', () => {
  it('come back as they were saved, for that text only', async () => {
    await writeKeptResults(files, 'Podaci', NAME, RESULTS, log);
    assert.deepEqual(await readKeptResults(files, 'Podaci', NAME, log), RESULTS);
    assert.equal(await readKeptResults(files, 'Podaci', 'drugi', log), null);
  });

  it('are kept under a safe file name, however hostile his title', async () => {
    await writeKeptResults(files, 'Podaci', NAME, RESULTS, log);
    assert.match([...held.keys()][0] ?? '', /^Podaci\/lektor-kept\/[0-9a-f]{8}\.json$/);
  });

  it('say nothing when there are none, which is the ordinary case', async () => {
    assert.equal(await readKeptResults(files, 'Podaci', NAME, log), null);
    assert.deepEqual(warnings, []);
  });

  it('are ignored and noted when the file is unreadable', async () => {
    await writeKeptResults(files, 'Podaci', NAME, RESULTS, log);
    const [at] = held.keys();
    held.set(at ?? '', '{polovina');
    assert.equal(await readKeptResults(files, 'Podaci', NAME, log), null);
    assert.equal(warnings.length, 1);
  });

  it('are not believed when a field is missing or of the wrong kind, or they are about another text', () => {
    assert.equal(keptResultsFrom({ name: NAME, ...RESULTS, proposalFor: undefined }, NAME), null);
    assert.equal(keptResultsFrom({ name: NAME, ...RESULTS, readAt: 'juče' }, NAME), null);
    assert.equal(keptResultsFrom({ name: 'drugi', ...RESULTS }, NAME), null);
    assert.equal(keptResultsFrom(null, NAME), null);
  });

  it('do not stop the Lektor when the disk refuses', async () => {
    const refusing = { write: async () => Promise.reject(new Error('Disk full')) } as unknown as FileSystem;
    await assert.doesNotReject(writeKeptResults(refusing, 'Podaci', NAME, RESULTS, log));
    assert.equal(warnings.length, 1);
  });
});
