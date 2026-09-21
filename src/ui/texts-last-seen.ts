import type { FileSystem } from '../platform/file-system.ts';

/**
 * How many texts were there the last time the app started, and where.
 *
 * The one thing that can tell an empty list from a catastrophe. A folder that
 * isn't there reads as empty by design — asking what is somewhere must not
 * bring it into being — so without this the app greets him with "Još nema
 * tekstova" when six hundred essays have gone missing, which is the single
 * worst sentence it could say.
 *
 * Kept per machine beside the log and the session. Losing it costs one startup
 * check, never a word of his.
 */
export interface TextsLastSeen {
  /** Which folder they were seen in, so pointing elsewhere isn't a loss. */
  folder: string;
  /** Texts plus deleted ones: everything that would have to have gone. */
  texts: number;
}

const FILE = 'seen.json';

const pathOf = (appFolder: string): string => `${appFolder}/${FILE}`;

export async function readTextsLastSeen(
  files: FileSystem,
  appFolder: string,
): Promise<TextsLastSeen | null> {
  try {
    const raw: unknown = JSON.parse(await files.read(pathOf(appFolder)));
    if (typeof raw !== 'object' || raw === null) return null;
    const held = raw as Record<string, unknown>;
    const folder = held['folder'];
    const texts = held['texts'];
    if (typeof folder !== 'string' || typeof texts !== 'number') return null;
    return { folder, texts: Math.max(0, Math.trunc(texts)) };
  } catch {
    /*
      Deliberately not logged, and this one is worth being sure about.

      Missing on the first run, which is every machine once. Unreadable means
      the same thing here — with nothing to compare against, nothing can be
      called a loss — and the failure that matters is the one in front of it:
      if his writing itself cannot be read, that throws and is reported.
    */
    return null;
  }
}

export async function writeTextsLastSeen(
  files: FileSystem,
  appFolder: string,
  seen: TextsLastSeen,
): Promise<void> {
  await files.write(pathOf(appFolder), JSON.stringify(seen));
}

/**
 * Whether this looks like his writing having gone missing.
 *
 * Only ever true where we have seen texts in this very folder before and now
 * see none at all. A first run has nothing to compare against, a folder he has
 * just been pointed at is a different place, and a man who has genuinely
 * deleted everything still has it in his deleted texts.
 */
export function looksLikeLoss(
  seen: TextsLastSeen | null,
  now: { folder: string; texts: number },
): boolean {
  if (seen === null || seen.folder !== now.folder) return false;
  return seen.texts > 0 && now.texts === 0;
}
