import { type FileSystem, FileMissing } from '../platform/file-system.ts';
import type { Host } from '../platform/host.ts';
import type { Log } from '../platform/logging.ts';

/**
 * Whether test mode is on, on this machine.
 *
 * A file of its own beside `advanced.json` rather than a key in it, so that
 * test mode stays in its own folder from end to end. Per machine, in the app's
 * own folder and not in Dropbox: switching it on at one machine must not follow
 * him to the next.
 */
const FILE = 'test-mode.json';

/**
 * What the file says, or off.
 *
 * Absent is the ordinary answer — on every machine until somebody switches it
 * on — and is not logged. Anything else going wrong is, and still reads as off:
 * the one wrong way for this to fail is on, at his machine.
 */
export async function readTestMode(files: FileSystem, appFolder: string, log: Log): Promise<boolean> {
  let text: string;
  try {
    text = await files.read(`${appFolder}/${FILE}`);
  } catch (failure: unknown) {
    if (!(failure instanceof FileMissing)) log.warn('Could not read the test mode setting', { failure });
    return false;
  }
  try {
    return testModeFrom(JSON.parse(text));
  } catch (failure: unknown) {
    log.warn('The test mode setting is not JSON; test mode is off', { failure });
    return false;
  }
}

/** On where the file says so, or for one visit where the browser build was opened with `?test`. */
export async function testModeIsOn(host: Host): Promise<boolean> {
  if (host.testTools?.requested === true) return true;
  return readTestMode(host.files, host.appFolder, host.log);
}

/** On only where the file says so in so many words. Separate so it can be tested without a disk. */
export function testModeFrom(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>)['on'] === true;
}

export async function writeTestMode(files: FileSystem, appFolder: string, on: boolean): Promise<void> {
  await files.write(`${appFolder}/${FILE}`, `${JSON.stringify({ on }, null, 2)}\n`);
}
