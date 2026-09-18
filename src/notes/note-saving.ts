import { baseOf, fileNameBase, nextFreeId } from './note-naming.ts';
import { survivedTooLittle } from './note.ts';
import { titleFrom } from './note-title.ts';

/**
 * What a save should do. Deciding is shared; carrying it out is each host's own
 * business, so the browser cannot drift from the real thing.
 *
 * Everything here is in ids — the extensionless name. Which file an id lives in,
 * and whether that file ends `.txt` or `.md`, is storage's concern.
 */
export type SaveAction =
  | { kind: 'none' }
  | { kind: 'write'; id: string }
  | { kind: 'writeAndRename'; id: string; to: string };

export interface SaveContext {
  takenIds: () => Promise<ReadonlySet<string>>;
  /**
   * The text as it was. Read only when a rename is on the table, because on a
   * 145KB essay it is the expensive part of a save.
   */
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

  if (id === null) return { kind: 'write', id: nextFreeId(base, null, await context.takenIds()) };

  // The id already reflects his opening lines, so leave it be. This is most
  // saves, and it's why the old text hasn't been read.
  if (baseOf(id) === base) return { kind: 'write', id };

  // Trimming is ordinary and should still rename. But when almost nothing
  // survived, the text wasn't shortened, it was replaced — and the old name is
  // then the last evidence of what the note was.
  if (survivedTooLittle(await context.previousText(), text)) return { kind: 'write', id };

  return { kind: 'writeAndRename', id, to: nextFreeId(base, id, await context.takenIds()) };
}

/**
 * The id a put-away note takes. Keeps the one it had — after an emptying that's
 * all that's left of it — and never overwrites a note already put away under it.
 */
export function deletedIdFor(id: string, takenInDeleted: ReadonlySet<string>): string {
  return nextFreeId(baseOf(id), null, takenInDeleted);
}
