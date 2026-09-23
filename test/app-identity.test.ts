import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * The one string the app and its installer both have to say.
 *
 * Windows groups a taskbar button with a pinned shortcut only when the running
 * program declares the same AppUserModelID the shortcut carries. The installer
 * takes it from `electron-builder.yml`; the app sets it in `electron-main.ts`.
 * Nothing connects the two, and a disagreement shows up as one program with two
 * taskbar buttons — which nobody would think to blame on a config file.
 *
 * Read as text rather than imported: the main process reaches for `electron`
 * at the top of the file, which is not there under `node --test`.
 */
describe('who the app says it is', () => {
  it('declares the same identity its installer puts on the shortcut', async () => {
    const main = await readFile('src/hosts/electron/electron-main.ts', 'utf8');
    const config = await readFile('electron-builder.yml', 'utf8');

    const declared = /APP_ID = '([^']+)'/.exec(main)?.[1];
    const installed = /^appId:\s*(\S+)/m.exec(config)?.[1];

    assert.ok(declared !== undefined, 'electron-main.ts must define APP_ID');
    assert.equal(declared, installed);
  });

  it('actually tells Windows, rather than only defining it', async () => {
    const main = await readFile('src/hosts/electron/electron-main.ts', 'utf8');

    assert.match(main, /app\.setAppUserModelId\(APP_ID\)/);
  });
});
