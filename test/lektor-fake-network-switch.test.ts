import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FileMissing, type FileSystem } from '../src/platform/file-system.ts';
import type { LektorRequest } from '../src/platform/lektor-remote.ts';
import type { Log } from '../src/platform/logging.ts';
import { createFakeNetworkSwitch, fakeNetworkSettingFrom, readFakeNetworkSetting } from '../src/ui/lektor/lektor-fake-network-switch.ts';

/* Advanced → "Fake AI network": every Lektor's requests to the fake instead of the real network, per machine. */

const quiet: Log = { info: () => {}, warn: () => {}, error: () => {} };

function filesHolding(initial: Record<string, string> = {}) {
  const held = new Map(Object.entries(initial));
  const files = {
    read: async (at: string) => {
      const found = held.get(at);
      if (found === undefined) throw new FileMissing(at);
      return found;
    },
    write: async (at: string, text: string) => void held.set(at, text),
    removeFile: async (at: string) => {
      if (!held.delete(at)) throw new FileMissing(at);
    },
  } as unknown as FileSystem;
  return { files, held };
}

const ping: LektorRequest = { provider: 'gemini', action: 'check', key: 'k', model: '', system: '', input: '' };
const signal = new AbortController().signal;

describe('the fake AI network setting', () => {
  it('is off where it was never switched on, without a word in the log', async () => {
    const logged: string[] = [];
    const log: Log = { info: () => {}, warn: (message) => void logged.push(message), error: (message) => void logged.push(message) };
    assert.equal(await readFakeNetworkSetting(filesHolding().files, 'Podaci', log), null);
    assert.deepEqual(logged, []);
  });

  it('reads a scenario, and a day written beside it as the GUI tests write one', () => {
    assert.deepEqual(fakeNetworkSettingFrom({ scenario: 'Google busy' }), { scenario: 'Google busy', extra: {} });
    assert.deepEqual(fakeNetworkSettingFrom({ balance: 0.9 }), { scenario: 'normal', extra: { balance: 0.9 } });
    assert.equal(fakeNetworkSettingFrom({ scenario: 'no such thing' })?.scenario, 'normal');
    assert.equal(fakeNetworkSettingFrom('on'), null);
  });
});

describe('the switch', () => {
  it('asks the real network while it is off', async () => {
    let realAsks = 0;
    const real = async () => {
      realAsks += 1;
      return { status: 200, reply: { real: true } };
    };
    const fakeSwitch = createFakeNetworkSwitch({ real, files: filesHolding().files, appFolder: 'Podaci', log: quiet }, null);
    assert.equal(fakeSwitch.isOn(), false);
    assert.deepEqual(await fakeSwitch.ask(ping, signal, () => {}), { status: 200, reply: { real: true } });
    assert.equal(realAsks, 1);
  });

  it('never asks the real network while it is on, acts out the scenario chosen, and stops at once when turned off', async () => {
    let realAsks = 0;
    const real = async () => {
      realAsks += 1;
      return { status: 200, reply: {} };
    };
    const { files, held } = filesHolding({ 'Podaci/lektor-fake-network.json': '{"scenario":"normal"}' });
    const fakeSwitch = createFakeNetworkSwitch({ real, files, appFolder: 'Podaci', log: quiet }, { scenario: 'normal', extra: {} });
    assert.equal((await fakeSwitch.ask(ping, signal, () => {})).status, 200);
    await fakeSwitch.choose('dead keys');
    assert.equal((await fakeSwitch.ask(ping, signal, () => {})).status, 400);
    assert.equal(held.get('Podaci/lektor-fake-network.json'), '{"scenario":"dead keys"}\n');
    assert.equal(realAsks, 0);
    await fakeSwitch.turnOff();
    assert.equal(held.has('Podaci/lektor-fake-network.json'), false);
    await fakeSwitch.ask(ping, signal, () => {});
    assert.equal(realAsks, 1);
  });
});
