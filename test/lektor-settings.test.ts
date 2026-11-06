import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { FileMissing, type FileSystem } from '../src/platform/file-system.ts';
import type { Log } from '../src/platform/logging.ts';
import { fakeBehaviourFrom, readFakeBehaviour, writeFakeBehaviour } from '../src/ui/lektor/lektor-fake-setting.ts';
import { lektorSettingsFrom, NO_LEKTOR_SETTINGS, readLektorSettings, writeLektorSettings } from '../src/ui/lektor/lektor-settings.ts';

let held: Map<string, string>;
let logged: unknown[];

const log: Log = {
  info: (...line) => void logged.push(line),
  warn: (...line) => void logged.push(line),
  error: (...line) => void logged.push(line),
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
  logged = [];
});

describe('the Lektor settings', () => {
  it('are nothing set before anyone has pasted a key, and say nothing about it', async () => {
    assert.deepEqual(await readLektorSettings(files, 'Tekstovi', log), NO_LEKTOR_SETTINGS);
    assert.deepEqual(logged, []);
  });

  it('come back as they were saved', async () => {
    const settings = { googleKey: 'g', anthropicKey: 'a' };
    await writeLektorSettings(files, 'Tekstovi', settings, log);
    assert.deepEqual(await readLektorSettings(files, 'Tekstovi', log), settings);
  });

  it('leave alone what a newer build wrote to the same file', async () => {
    held.set('Tekstovi/lektor.json', JSON.stringify({ somethingNewer: 1 }));
    await writeLektorSettings(files, 'Tekstovi', NO_LEKTOR_SETTINGS, log);
    assert.equal((JSON.parse(held.get('Tekstovi/lektor.json') ?? '{}') as { somethingNewer: number }).somethingNewer, 1);
  });

  it('fall back field by field, so one bad value costs only itself', () => {
    assert.deepEqual(lektorSettingsFrom({ googleKey: 'g', anthropicKey: 5 }), { googleKey: 'g', anthropicKey: '' });
    assert.deepEqual(lektorSettingsFrom(null), NO_LEKTOR_SETTINGS);
  });

  it('has no say over which Lektor he gets: the free one each time the app starts', () => {
    assert.deepEqual(Object.keys(lektorSettingsFrom({ googleKey: 'g', level: 'thorough' })).sort(), ['anthropicKey', 'googleKey']);
  });

  it('never put a key in the log, even when the file is damaged', async () => {
    held.set('Tekstovi/lektor.json', '{"googleKey": "tajna"');
    await readLektorSettings(files, 'Tekstovi', log);
    assert.doesNotMatch(JSON.stringify(logged), /tajna/);
  });
});

describe('the test Lektor setting', () => {
  it('is off on a machine nobody has set it on', async () => {
    assert.equal(await readFakeBehaviour(files, 'Podaci', log), null);
    assert.deepEqual(logged, []);
  });

  it('comes back as it was set, in the folder that never syncs', async () => {
    await writeFakeBehaviour(files, 'Podaci', 'slow');
    assert.ok(held.has('Podaci/lektor-test.json'));
    assert.equal(await readFakeBehaviour(files, 'Podaci', log), 'slow');
  });

  it('is off for anything it does not recognise', () => {
    assert.equal(fakeBehaviourFrom({ behaviour: 'pokvaren' }), null);
    assert.equal(fakeBehaviourFrom(null), null);
  });
});
