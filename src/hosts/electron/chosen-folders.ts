import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * Where a folder picker should open, given where we would like it to open.
 *
 * Two things stop the wanted folder being usable as it stands. Paths are kept
 * with forward slashes, which is what the filesystem contract expects and what
 * Windows accepts everywhere except its own dialogs — handed one, the dialog
 * does not recognise it and falls back to wherever it likes. And the folder may
 * not be there at all: his writing folder comes into being on the first save,
 * so on a new machine it is a name rather than a place.
 *
 * Both came out the same way — the picker opening at Documents however the app
 * was configured — which made it look like the current folder was being ignored
 * rather than not being found.
 */
export function whereToOpen(wanted: string): string {
  let at = path.normalize(wanted);
  for (;;) {
    try {
      if (statSync(at).isDirectory()) return at;
    } catch {
      // Not there is the expected answer on the way up, and the reason for the
      // walk; anything else about it is the picker's problem, not ours.
    }
    const up = path.dirname(at);
    // `dirname` of a root is the root, which is where the walk has to stop.
    if (up === at) return at;
    at = up;
  }
}
