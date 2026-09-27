/**
 * Opens b-notes' log folder in VS Code — wherever the logs have been pointed.
 *
 * The folder is decided the way the app decides it (`logsFolderFor`), from the
 * same `folders.json` in the app's own folder, so moving the logs in the
 * advanced panel moves where this looks too. Falls back to Explorer when VS
 * Code cannot be found, and always says which folder it means.
 *
 *   node scripts/open-logs.mts           (or logs.cmd, which runs this)
 *   node scripts/open-logs.mts --print   (only says which folder)
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { logsFolderFor, readChosenFolders } from '../src/hosts/electron/chosen-folders.ts';

/**
 * The app's own folder, as Electron names it: `%APPDATA%` and the app's name.
 * Both the installed app and a dev run are called b-notes, so both land here.
 */
const APP_NAME = 'b-notes';

const run = promisify(execFile);

function fail(said: string): never {
  console.error(said);
  process.exit(1);
}

const roaming = process.env['APPDATA'];
if (roaming === undefined) fail('APPDATA is not set, so there is no telling where b-notes keeps its logs.');
const appFolder = path.join(roaming, APP_NAME);
const logs = path.normalize(logsFolderFor(appFolder, readChosenFolders(appFolder)));

// Only says where, for checking this without a window opening.
if (process.argv.includes('--print')) {
  console.log(logs);
  process.exit(0);
}

if (!existsSync(logs)) {
  fail(`No logs yet. Run the app at least once, then try again.\nLooked in: ${logs}`);
}

/**
 * VS Code's launcher, by its full path. Called by bare name, its own launcher
 * resolves itself against the current folder and looks for Code.exe there. A
 * shell opened before VS Code was installed will not have it on PATH, hence
 * the usual install folder as a second place to look.
 */
async function findCode(): Promise<string | null> {
  try {
    const { stdout } = await run('where', ['code'], { windowsHide: true });
    const first = stdout.split(/\r?\n/).find((line) => line.trim().length > 0);
    if (first !== undefined) return first.trim();
  } catch {
    // `where` exits non-zero when nothing is found, which is the case the
    // install folder below is for; nothing to report yet.
  }
  const local = process.env['LOCALAPPDATA'];
  const installed = local === undefined ? null : path.join(local, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd');
  return installed !== null && existsSync(installed) ? installed : null;
}

const code = await findCode();
if (code === null) {
  console.log(`Could not find VS Code, so opening the folder in Explorer: ${logs}`);
  spawn('explorer.exe', [logs], { detached: true, stdio: 'ignore' }).unref();
} else {
  // `code.cmd` is a batch file, which Windows will only start through cmd.
  const opened = spawn('cmd.exe', ['/c', code, logs], { stdio: 'inherit', windowsHide: true });
  opened.on('exit', (status) => {
    if (status !== 0) fail(`Could not open VS Code. The logs are in: ${logs}`);
    console.log(`Opened ${logs}`);
  });
}
