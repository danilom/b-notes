import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clearOfWindowsDevices, isWindowsDeviceName } from '../src/notes/windows-device-names.ts';

/**
 * Every name here was tried on Windows 10 through `cmd.exe`, the path handling
 * Resoph and Explorer share: the devices never became files, the rest did.
 */
describe('which names Windows takes for a device', () => {
  const devices = ['CON', 'CON ', 'CON.', 'CON. Pismo', 'nul.txt', 'con.x', 'COM1', 'LPT9', 'CONIN$', 'CONOUT$', 'Aux', 'PRN   '];
  const files = [' CON', '   CON', 'CON_', '_CON', 'COM0', 'CLOCK$', 'AUX-', 'CON something', 'Pismo'];

  for (const name of devices) {
    it(`takes "${name}" for a device`, () => assert.equal(isWindowsDeviceName(name), true));
  }
  for (const name of files) {
    it(`leaves "${name}" a file`, () => assert.equal(isWindowsDeviceName(name), false));
  }
});

describe('a name moved clear of the devices', () => {
  it('gets an underscore straight after the device, before any dot or trailing space', () => {
    assert.equal(clearOfWindowsDevices('CON'), 'CON_');
    assert.equal(clearOfWindowsDevices('nul.txt'), 'nul_.txt');
    assert.equal(clearOfWindowsDevices('Con. Pismo'), 'Con_. Pismo');
    assert.equal(clearOfWindowsDevices('PRN   '), 'PRN_   ');
  });

  it('is left exactly as it was when it is no device, his spaces and all', () => {
    assert.equal(clearOfWindowsDevices('   CON'), '   CON');
    assert.equal(clearOfWindowsDevices('   %2APismo  '), '   %2APismo  ');
  });

  it('is never a device afterwards', () => {
    for (const name of ['CON', 'aux.', 'COM¹', 'nul.txt', 'LPT1   . x']) {
      assert.equal(isWindowsDeviceName(clearOfWindowsDevices(name)), false, name);
    }
  });
});
