import { FileMissing, type FileSystem } from '../../platform/file-system.ts';
import { describeError, type Log } from '../../platform/logging.ts';

/*
  The Lektor's keys and which Lektor he chose. A file of its own, so that nothing about the
  Lektor can disturb how the app looks: an unreadable one costs him the Lektor's settings and
  nothing else. In b-notes' folder, so one paste serves every machine he has.

  Never to be logged: these are keys, one of them spending someone's money.
*/

export type RealLevel = 'free' | 'thorough';

export interface LektorSettings {
  googleKey: string;
  anthropicKey: string;
  level: RealLevel;
}

const FILE = 'lektor.json';

export const NO_LEKTOR_SETTINGS: LektorSettings = { googleKey: '', anthropicKey: '', level: 'free' };

/** Every field falls back on its own, and any other key in the file is left alone when writing. */
export function lektorSettingsFrom(raw: unknown): LektorSettings {
  if (typeof raw !== 'object' || raw === null) return NO_LEKTOR_SETTINGS;
  const { googleKey, anthropicKey, level } = raw as Record<string, unknown>;
  return {
    googleKey: typeof googleKey === 'string' ? googleKey : '',
    anthropicKey: typeof anthropicKey === 'string' ? anthropicKey : '',
    level: level === 'thorough' ? 'thorough' : 'free',
  };
}

async function readRaw(files: FileSystem, notesFolder: string, log: Log): Promise<unknown> {
  try {
    return JSON.parse(await files.read(`${notesFolder}/${FILE}`));
  } catch (error) {
    // Absent until someone pastes a key, so only anything else is worth a line.
    if (!(error instanceof FileMissing)) log.warn('The Lektor settings could not be read', describeError(error));
    return {};
  }
}

export async function readLektorSettings(files: FileSystem, notesFolder: string, log: Log): Promise<LektorSettings> {
  return lektorSettingsFrom(await readRaw(files, notesFolder, log));
}

/** Laid over what is there, as `settings.json` is: an old build on another machine must not lose what a newer one wrote. */
export async function writeLektorSettings(files: FileSystem, notesFolder: string, settings: LektorSettings, log: Log): Promise<void> {
  const had = await readRaw(files, notesFolder, log);
  const kept = typeof had === 'object' && had !== null ? had : {};
  await files.write(`${notesFolder}/${FILE}`, `${JSON.stringify({ ...kept, ...settings }, null, 2)}\n`);
}
