import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Where his writing and our logs have been pointed, if anyone has pointed them.
 *
 * Kept beside the log rather than with the rest of the settings, because the
 * writing folder cannot be configured from inside the writing folder — and read
 * before anything else starts, since one of the things it decides is where the
 * log goes.
 *
 * Read off disk, so it is checked like anything else read off disk: a hand-
 * edited file, a half-written one, or one from a build that knew different
 * keys, all have to come out as "nothing is set" rather than as a crash at
 * startup with no log to say why.
 */
export interface ChosenFolders {
  writing: string | null;
  logs: string | null;
}

const FILE = 'folders.json';

/** Windows takes forward slashes perfectly well, and the contract expects them. */
const asPath = (value: string): string => value.replaceAll('\\', '/');

function asFolder(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? asPath(value.trim()) : null;
}

export function readChosenFolders(appFolder: string): ChosenFolders {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(appFolder, FILE), 'utf8'));
    if (typeof raw !== 'object' || raw === null) return { writing: null, logs: null };
    const held = raw as Record<string, unknown>;
    return { writing: asFolder(held['writing']), logs: asFolder(held['logs']) };
  } catch {
    // Missing is the ordinary case and unreadable is the same answer: fall back
    // to where things go by default. There is nowhere to report this yet — the
    // log's own folder is one of the things being decided here.
    return { writing: null, logs: null };
  }
}

export function writeChosenFolders(appFolder: string, folders: ChosenFolders): void {
  mkdirSync(appFolder, { recursive: true });
  writeFileSync(path.join(appFolder, FILE), JSON.stringify(folders, null, 2), 'utf8');
}
