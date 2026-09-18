import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FileSystem } from '../src/platform/file-system.ts';
import { MAX_ZOOM, MIN_ZOOM } from '../src/ui/appearance.ts';
import {
  DEFAULT_SETTINGS,
  type Settings,
  createSettingsWriter,
  readSettings,
  settingsFrom,
} from '../src/ui/app-settings.ts';

const FOLDERS = { writingFolder: 'Tekstovi', appFolder: 'Podaci' };

/** A filesystem whose writes finish in whatever order the test asks for. */
function slowFiles() {
  const stored = new Map<string, string>();
  const waiting: (() => void)[] = [];

  const files: FileSystem = {
    list: async () => [...stored.keys()].map((path) => ({ path, updatedAt: 0, bytes: 0 })),
    read: async (path) => {
      const text = stored.get(path);
      if (text === undefined) throw new Error(`no such file: ${path}`);
      return text;
    },
    write: async (path, text) => {
      await new Promise<void>((resolve) => waiting.push(resolve));
      stored.set(path, text);
    },
    rename: async () => {
      throw new Error('not used');
    },
  };

  return {
    files,
    stored,
    /** Lets every write so far complete, newest first. */
    finishNewestFirst: async () => {
      while (waiting.length > 0) waiting.pop()?.();
      await new Promise((resolve) => setImmediate(resolve));
    },
    finishAll: async () => {
      for (let turn = 0; turn < 20; turn += 1) {
        while (waiting.length > 0) waiting.shift()?.();
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
}

describe('reading how he likes the app set up', () => {
  it('gives the defaults when nothing has been saved yet', async () => {
    const { files } = slowFiles();
    assert.deepEqual(await readSettings(files, FOLDERS), DEFAULT_SETTINGS);
  });

  it('keeps the settings it understands when one of them is nonsense', () => {
    const settings = settingsFrom({ language: 'sr', font: 'papyrus', accent: 'green' }, {});
    assert.equal(settings.accent, 'green');
    assert.equal(settings.font, DEFAULT_SETTINGS.font);
  });

  it('ignores a file that is not an object at all', () => {
    assert.deepEqual(settingsFrom({}, {}), DEFAULT_SETTINGS);
  });

  it('takes the screen settings from this machine and the rest from his writing folder', () => {
    const settings = settingsFrom({ font: 'corbel', accent: 'red' }, { zoom: 1.5, mode: 'dark' });
    assert.equal(settings.font, 'corbel');
    assert.equal(settings.accent, 'red');
    assert.equal(settings.zoom, 1.5);
    assert.equal(settings.mode, 'dark');
  });

  it('brings a zoom from outside the allowed range to the nearest one allowed', () => {
    assert.equal(settingsFrom({}, { zoom: 12 }).zoom, MAX_ZOOM);
    assert.equal(settingsFrom({}, { zoom: 0.01 }).zoom, MIN_ZOOM);
  });

  it('falls back when the stored zoom is not a number at all', () => {
    assert.equal(settingsFrom({}, { zoom: 'veliko' }).zoom, DEFAULT_SETTINGS.zoom);
    assert.equal(settingsFrom({}, { zoom: null }).zoom, DEFAULT_SETTINGS.zoom);
  });

  it('never takes dark from the shared file, which would reach across his machines', () => {
    const settings = settingsFrom({ mode: 'dark' }, {});
    assert.equal(settings.mode, 'light');
  });
});

describe('saving how he likes the app set up', () => {
  const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });

  it('keeps the last choice he made, even when writes finish out of order', async () => {
    const world = slowFiles();
    const save = createSettingsWriter(world.files, FOLDERS, (error) => {
      throw error;
    });

    // Three clicks in quick succession, faster than a write completes.
    save(settings({ accent: 'green' }));
    save(settings({ accent: 'green', font: 'corbel' }));
    save(settings({ accent: 'green', font: 'corbel', zoom: 1.25 }));

    await world.finishNewestFirst();
    await world.finishAll();

    assert.deepEqual(await readSettings(world.files, FOLDERS), {
      language: 'sr',
      accent: 'green',
      font: 'corbel',
      zoom: 1.25,
      mode: 'light',
    });
  });

  it('leaves settings it does not recognise untouched, for older builds', async () => {
    const world = slowFiles();
    world.stored.set('Tekstovi/settings.json', '{"font":"corbel","lineSpacing":"wide"}');

    const save = createSettingsWriter(world.files, FOLDERS, (error) => {
      throw error;
    });
    save(settings({ accent: 'red' }));
    await world.finishAll();

    const written: unknown = JSON.parse(world.stored.get('Tekstovi/settings.json') ?? '{}');
    assert.equal((written as Record<string, unknown>)['lineSpacing'], 'wide');
    assert.equal((written as Record<string, unknown>)['accent'], 'red');
  });

  it('reports a failed write rather than swallowing it', async () => {
    const failing: FileSystem = {
      list: async () => [],
      read: async () => {
        throw new Error('nothing here');
      },
      write: async () => {
        throw new Error('disk is full');
      },
      rename: async () => {
        throw new Error('not used');
      },
    };

    const seen: unknown[] = [];
    const save = createSettingsWriter(failing, FOLDERS, (error) => seen.push(error));
    save(DEFAULT_SETTINGS);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(seen.length, 1);
    assert.match(String(seen[0]), /disk is full/);
  });
});
