import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/**
 * The word on a new version, in the app itself: told by the main process, across the bridge, into
 * the status line. The updater never runs in a dev build, so the test speaks for it from the main
 * process's side, sending what the app would send; nothing in the app is switched for the test.
 *
 * Everything of the run's own is in a temporary folder, as in lektor-electron.spec.ts.
 */

const ROOT = path.join(import.meta.dirname, '..');

let app: ElectronApplication | undefined;
let root: string | undefined;

test.afterEach(async () => {
  await app?.close();
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  app = undefined;
  root = undefined;
});

test('shows what the main process tells of a new version, and nothing before it is told', async () => {
  root = mkdtempSync(path.join(tmpdir(), 'b-notes-electron-'));
  const [data, home] = ['data', 'home'].map((name) => path.join(root ?? '', name));
  for (const folder of [data, home, path.join(home, 'Documents')]) mkdirSync(folder);
  writeFileSync(path.join(data, 'folders.json'), JSON.stringify({ notes: `${root.replaceAll('\\', '/')}/notes` }));
  app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: { ...process.env, USERPROFILE: home, HOME: home, B_NOTES_TEST_DATA: data },
  });

  const window = await app.firstWindow();
  // The status line listens from when the app is ready, which only the log says.
  const logs = path.join(data, 'logs');
  await expect.poll(() => readdirSync(logs).map((file) => readFileSync(path.join(logs, file), 'utf8')).join('\n')).toContain('[renderer] Ready');
  const update = window.locator('#status-update');
  // Asked on starting, and a dev build has nothing on its way.
  await expect(update).toBeHidden();

  const tell = (told: object): Promise<void> =>
    (app as ElectronApplication).evaluate(({ BrowserWindow }, sent) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('app:update', sent);
    }, told);

  await tell({ kind: 'downloading', version: '1.0.1' });
  await expect(update).toHaveText('Preuzimam verziju 1.0.1…');
  await tell({ kind: 'downloaded', version: '1.0.1' });
  await expect(update).toHaveText('Verzija 1.0.1 je preuzeta.');
  // What crosses is checked before it is believed: nonsense is no update at all.
  await tell({ kind: 'installing', version: 7 });
  await expect(update).toBeHidden();
});
