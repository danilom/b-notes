import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFakeNetwork, type FakeDay } from '../src/hosts/mockup/lektor-fake-network.ts';
import { FileMissing, type FileSystem } from '../src/platform/file-system.ts';
import type { Log } from '../src/platform/logging.ts';
import { createLektorConnection } from '../src/ui/lektor/lektor-connection.ts';
import { LektorServiceError } from '../src/ui/lektor/lektor-service.ts';

/* What the panel opens on (spec §4), and the paid balance it reads, on the fake network. */

function setUp(day: FakeDay, keys: { googleKey?: string; openRouterKey?: string }) {
  const held = new Map<string, string>([['Tekstovi/lektor.json', JSON.stringify(keys)]]);
  const files = {
    read: async (at: string) => {
      const found = held.get(at);
      if (found === undefined) throw new FileMissing(at);
      return found;
    },
    write: async (at: string, text: string) => void held.set(at, text),
  } as unknown as FileSystem;
  const logged: { message: string; detail: unknown }[] = [];
  const log: Log = {
    info: (message, detail) => void logged.push({ message, detail }),
    warn: (message, detail) => void logged.push({ message, detail }),
    error: (message, detail) => void logged.push({ message, detail }),
  };
  const network = createFakeNetwork(day, { now: () => 0, after: (_ms, then) => (queueMicrotask(then), () => {}) });
  const connection = createLektorConnection({ askService: network.ask, files, notesFolder: 'Tekstovi', log });
  const open = async () => {
    await connection.readSettingsOnce();
    return connection.checkOpening(new AbortController().signal);
  };
  return { connection, network, logged, held, open };
}

const signal = new AbortController().signal;

describe('opening the panel', () => {
  it('asks for keys when there are none and the internet is there', async () => {
    const { open, network } = setUp({}, {});
    assert.equal(await open(), 'no-keys');
    assert.deepEqual(network.asked.map((one) => one.action), ['ping']);
  });

  it('says offline when there are no keys and the keyless check gets no answer', async () => {
    assert.equal(await setUp({ isOffline: true }, {}).open(), 'offline');
  });

  it("checks the keys themselves, and nothing else, when there are keys", async () => {
    const { open, network } = setUp({}, { googleKey: 'g', openRouterKey: 'o' });
    assert.equal(await open(), 'ready');
    assert.deepEqual(network.asked.map((one) => `${one.provider} ${one.action}`).sort(), ['gemini check', 'openrouter balance']);
  });

  it('says offline when the key checks get no answer at all', async () => {
    assert.equal(await setUp({ isOffline: true }, { googleKey: 'g', openRouterKey: 'o' }).open(), 'offline');
    assert.equal(await setUp({ isOffline: true }, { googleKey: 'g' }).open(), 'offline');
  });

  for (const [provider, which] of [
    ['gemini', 'free'],
    ['openrouter', 'paid'],
  ] as const) {
    it(`finds a dead ${which} key early, and says so for the whole Lektor`, async () => {
      const { open, connection } = setUp({ deadKeys: [provider] }, { googleKey: 'g', openRouterKey: 'o' });
      assert.equal(await open(), 'dead-key');
      assert.equal(connection.dead[which], true);
      assert.equal(connection.isAnyDead(), true);
    });
  }

  it('clears a dead key once a working one is pasted, and saves it', async () => {
    const { open, connection, held } = setUp({ deadKeys: ['openrouter'] }, { googleKey: 'g', openRouterKey: 'old' });
    await open();
    const network = createFakeNetwork({});
    const fresh = createLektorConnection({ askService: network.ask, files: { read: async () => held.get('Tekstovi/lektor.json') ?? '', write: async (at: string, text: string) => void held.set(at, text) } as unknown as FileSystem, notesFolder: 'Tekstovi', log: { info: () => {}, warn: () => {}, error: () => {} } });
    await fresh.readSettingsOnce();
    await fresh.takeKey('paid', 'new-key', signal);
    assert.equal(fresh.dead.paid, false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((JSON.parse(held.get('Tekstovi/lektor.json') ?? '{}') as { openRouterKey: string }).openRouterKey, 'new-key');
    assert.equal(connection.dead.paid, true);
  });

  it('refuses a wrong pasted key as a bad key, and keeps the old one', async () => {
    const { open, connection } = setUp({ deadKeys: ['gemini'] }, { googleKey: 'g' });
    await open();
    await assert.rejects(connection.takeKey('free', 'pogresan', signal), (error: unknown) => error instanceof LektorServiceError && error.failure === 'bad-key');
  });
});

describe('the paid balance', () => {
  it('is read on opening, and every read is logged with its figure', async () => {
    const { open, connection, logged } = setUp({ balance: 7.47 }, { openRouterKey: 'o' });
    await open();
    assert.equal(connection.balance()?.toFixed(2), '7.47');
    await connection.rereadBalance();
    const reads = logged.filter((line) => /balance/.test(line.message));
    assert.equal(reads.length, 2);
    assert.deepEqual(reads[0]?.detail, { dollars: 7.47 });
  });

  it('is unknown, and said to be, when it cannot be read', async () => {
    const { open, connection, logged } = setUp({ balance: null }, { openRouterKey: 'o' });
    assert.equal(await open(), 'ready');
    assert.equal(connection.balance(), null);
    assert.deepEqual(logged.find((line) => /balance/.test(line.message))?.detail, { reading: 'unreadable' });
  });

  it('never logs a key', async () => {
    const { open, connection, logged } = setUp({}, { googleKey: 'AIza-tajni', openRouterKey: 'sk-or-tajni' });
    await open();
    await connection.rereadBalance();
    assert.doesNotMatch(JSON.stringify(logged), /tajni/);
  });
});
