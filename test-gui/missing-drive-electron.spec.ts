import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/**
 * The app itself, Electron and all, started with a folder chosen in the advanced panel on a
 * drive that is not there: a USB stick unplugged, a drive letter that moved. Startup is in the
 * background process, which the browser build does not have, so only this sees it.
 *
 * A log folder gone is no business of his: the app opens and logs to its default folder. b-notes'
 * own folder gone is: the app stops on the screen saying it cannot find his texts, rather than
 * opening on a list with every text written in b-notes silently missing.
 *
 * Everything of the run's own is in a temporary folder, as in lektor-electron.spec.ts.
 */

const ROOT = path.join(import.meta.dirname, '..');

/** A drive letter this computer does not have, which is what an unplugged drive looks like. */
function absentDrive(): string {
  for (const letter of 'QRSTUVWXYPONMLKJ') {
    if (!existsSync(`${letter}:/`)) return `${letter}:`;
  }
  throw new Error('Every drive letter tried is taken; pick another way to stand for a drive that is gone');
}

interface Place {
  root: string;
  data: string;
  home: string;
}

function walledOff(chosen: Record<string, string>): Place {
  const root = mkdtempSync(path.join(tmpdir(), 'b-notes-electron-'));
  const [data, home] = ['data', 'home'].map((name) => path.join(root, name));
  for (const folder of [data, home]) mkdirSync(folder);
  // Windows finds Documents in the home folder, and the app does not start without one.
  mkdirSync(path.join(home, 'Documents'));
  writeFileSync(path.join(data, 'folders.json'), JSON.stringify(chosen));
  return { root, data, home };
}

function launch(place: Place): Promise<ElectronApplication> {
  return electron.launch({
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', ROOT],
    cwd: ROOT,
    // Where os.homedir() looks, on Windows and elsewhere: Resoph's settings are looked for there.
    env: { ...process.env, USERPROFILE: place.home, HOME: place.home, B_NOTES_TEST_DATA: place.data },
  });
}

function logSaid(place: Place): string {
  const logs = path.join(place.data, 'logs');
  return readdirSync(logs).map((file) => readFileSync(path.join(logs, file), 'utf8')).join('\n');
}

let app: ElectronApplication | undefined;
let place: Place | undefined;

test.afterEach(async () => {
  await app?.close();
  if (place !== undefined) rmSync(place.root, { recursive: true, force: true });
  app = undefined;
  place = undefined;
});

test('opens as usual with its log folder on a drive that is gone, logging to the default folder instead', async () => {
  const gone = `${absentDrive()}/b-notes-logs`;
  place = walledOff({ logs: gone });
  app = await launch(place);

  const window = await app.firstWindow();
  const started = place;
  await expect.poll(() => logSaid(started)).toContain('[renderer] Ready');
  await expect(window.locator('.lost')).toHaveCount(0);
  await expect(window.locator('#new-note')).toBeVisible();
  expect(logSaid(place)).toContain('Could not write the log in this folder');
  expect(logSaid(place)).toContain(gone);
});

test('stops on the screen saying it cannot find his texts when the drive his b-notes folder is on is gone', async () => {
  const gone = `${absentDrive()}/b-notes-texts`;
  place = walledOff({ notes: gone });
  app = await launch(place);

  const window = await app.firstWindow();
  const lost = window.locator('.lost');
  await expect(lost).toBeVisible();
  await expect(lost).toContainText('Ne mogu da nađem tvoje tekstove');
  await expect(lost.locator('.lost-said')).toContainText(gone);
  await expect(window.locator('#new-note')).toBeHidden();
});

test('opens as usual on a first start, when his b-notes folder is not there yet but the folder it goes in is', async () => {
  place = walledOff({});
  const notesParent = path.join(place.root, 'dropbox');
  mkdirSync(notesParent);
  writeFileSync(path.join(place.data, 'folders.json'), JSON.stringify({ notes: `${notesParent.replaceAll('\\', '/')}/b-notes` }));
  app = await launch(place);

  const window = await app.firstWindow();
  // The list's buttons are drawn before his folders are looked at, so only "Ready" in the log
  // says the look has been taken and found nothing wrong.
  const started = place;
  await expect.poll(() => logSaid(started)).toContain('[renderer] Ready');
  await expect(window.locator('.lost')).toHaveCount(0);
  await expect(window.locator('#new-note')).toBeVisible();
});
