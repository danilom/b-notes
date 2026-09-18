import { baseOf, fileNameBase, nextFreeName } from './note-naming.ts';
import { survivedTooLittle } from './notes.ts';
import { titleFrom } from './title.ts';

/**
 * What a save should do. Deciding is shared; carrying it out is each store's
 * own business, so the browser cannot drift from the real thing.
 */
export type SaveAction =
  | { kind: 'none' }
  | { kind: 'write'; id: string }
  | { kind: 'writeAndRename'; id: string; to: string };

/**
 * What the store can tell us, asked for only when needed.
 *
 * Both are lazy because the common case — typing into a note whose opening
 * lines haven't changed — needs neither, and that save happens constantly.
 */
export interface SaveContext {
  takenNames: () => Promise<ReadonlySet<string>>;
  previousText: () => Promise<string>;
}

export async function planSave(
  id: string | null,
  text: string,
  context: SaveContext,
): Promise<SaveAction> {
  // Never create a file for a note he started and left blank. Empty notes are
  // the single largest category of debris in his old corpus.
  if (id === null && text.trim().length === 0) return { kind: 'none' };

  const base = fileNameBase(titleFrom(text));

  if (id === null) return { kind: 'write', id: nextFreeName(base, null, await context.takenNames()) };

  // The filename already reflects his opening lines, so leave it be. This is
  // most saves, and it's why nothing above has been read yet.
  if (baseOf(id) === base) return { kind: 'write', id };

  // Trimming is ordinary and should still rename. But when almost nothing
  // survived, the text wasn't shortened, it was replaced — and the old filename
  // is then the last evidence of what the note was.
  if (survivedTooLittle(await context.previousText(), text)) return { kind: 'write', id };

  return { kind: 'writeAndRename', id, to: nextFreeName(base, id, await context.takenNames()) };
}

/**
 * The name a put-away note takes. Keeps the name it had — after an emptying
 * that's all that's left of it — and never overwrites a deleted note that
 * already has it.
 */
export function deletedNameFor(id: string, takenInDeleted: ReadonlySet<string>): string {
  return nextFreeName(baseOf(id), null, takenInDeleted);
}
