import { isEmptyText } from './note.ts';
import { worthKeeping } from './text-change.ts';

/**
 * What a save should do. Deciding is shared; carrying it out is each host's own
 * business, so the browser cannot drift from the real thing.
 *
 * Everything here is in ids — the extensionless name. Which file an id lives in
 * is storage's concern.
 *
 * A save never renames. The name a text gets when it is made is its name for
 * good: in a folder several machines sync offline, a rename is the one change
 * that another machine can undo — see `RESOPH-COEXISTENCE.md`. So the only
 * question here is whether something has to be kept before the write lands.
 */
export type SaveAction =
  | { kind: 'none' }
  | {
      kind: 'write';
      id: string;
      /** Text that must be kept somewhere before this write lands. */
      snapshot?: string;
    };

export interface SaveContext {
  /** The name a new text takes. Only asked for when there is a new text. */
  newName: (text: string) => Promise<string>;
  /**
   * The text as it was.
   *
   * Read on every save of an existing note, because how much of it is about to
   * go is the question this asks. On a 145KB essay that is the expensive part
   * of a save, so the store hands back the same read rather than going to disk
   * twice.
   */
  previousText: () => Promise<string>;
  /**
   * The newest copy already kept of this note, or null if there is none.
   *
   * Only ever asked for when enough is going to matter, so the ordinary save
   * never pays for it.
   */
  lastKept: () => Promise<string | null>;
}

export async function planSave(
  id: string | null,
  text: string,
  context: SaveContext,
): Promise<SaveAction> {
  // Never create a file for a note he started and left blank. Empty notes are
  // the single largest category of debris in his old corpus.
  if (id === null && text.trim().length === 0) return { kind: 'none' };

  if (id === null) return { kind: 'write', id: await context.newName(text) };

  /*
    Emptying is how he deletes — he never found Resoph's delete command — and it
    is the one edit that leaves nothing behind. Every other mistake leaves a
    file to dig at; this one leaves a name and no text, which is exactly what
    his old corpus is full of. So what was there is kept before the empty lands.
  */
  const previous = await context.previousText();

  if (isEmptyText(text)) {
    if (isEmptyText(previous)) return { kind: 'write', id };
    return { kind: 'write', id, snapshot: previous };
  }

  /*
    Autosaving is only dangerous when text goes away. If what he has now still
    contains what he had, nothing can be lost and it writes freely; if a large
    part of it has gone, a copy is kept before the write lands.

    Never blocking the edit: he genuinely does cut for brevity, and the point is
    only to make that recoverable. Note that each save is measured against the
    last saved text, so backspacing a paragraph away over half a minute is a
    run of small changes and keeps nothing. What this catches is the chunk that
    disappears between one save and the next.
  */
  const keep = worthKeeping(previous, text, await context.lastKept());
  return keep ? { kind: 'write', id, snapshot: previous } : { kind: 'write', id };
}
