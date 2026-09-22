import { type ClaimedName, baseOf, claimName, fileNameBase, nextFreeId } from './note-naming.ts';
import { isEmptyText, survivedTooLittle } from './note.ts';
import { worthKeeping } from './text-change.ts';
import { titleFrom } from './note-title.ts';

/**
 * What a save should do. Deciding is shared; carrying it out is each host's own
 * business, so the browser cannot drift from the real thing.
 *
 * Everything here is in ids — the extensionless name. Which file an id lives in,
 * and whether that file ends `.txt` or `.md`, is storage's concern.
 */
/**
 * What both kinds of write have in common.
 *
 * The snapshot belongs to the write, not to whether the name changes with it:
 * a save that rewrites his opening line can also be the save that cuts half the
 * text, and it used to be declared on only one of the two. `planSave` put it on
 * both regardless — a spread carries no excess property check — so the store
 * quietly dropped it on the renaming half, and the one save that both renames
 * and cuts kept nothing.
 */
interface Written {
  id: string;
  /** Text that must be kept somewhere before this write lands. */
  snapshot?: string;
  /**
   * An older text that has to give up the bare name, so that neither of two
   * texts reading the same is left unnumbered. Absent on the saves that claim
   * a name nobody else wants, which is nearly all of them.
   */
  displaced?: { from: string; to: string };
}

export type SaveAction =
  | { kind: 'none' }
  | ({ kind: 'write' } & Written)
  | ({ kind: 'writeAndRename'; to: string } & Written);

export interface SaveContext {
  takenIds: () => Promise<ReadonlySet<string>>;
  /**
   * The text as it was.
   *
   * Read on every save of an existing note now, because how much of it is about
   * to go is the question this asks. On a 145KB essay that is the expensive
   * part of a save, so the store hands back the same read rather than going to
   * disk twice.
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

/**
 * Spread rather than assigned, so a save with nothing to displace carries no
 * key at all. `displaced: null` on every ordinary save would read as a decision
 * taken about a second file each time one is written.
 */
function displacing(taking: ClaimedName): { displaced?: { from: string; to: string } } {
  return taking.displaced === null ? {} : { displaced: taking.displaced };
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

  if (id === null) {
    const taking = claimName(base, null, await context.takenIds());
    return { kind: 'write', id: taking.id, ...displacing(taking) };
  }

  /*
    Emptying is how he deletes — he never found Resoph's delete command — and it
    is the one edit that leaves nothing behind. Every other mistake leaves a
    file to dig at; this one leaves a name and no text, which is exactly what
    his old corpus is full of. So what was there is kept before the empty lands.

    Ahead of the shortcut below, because a note he never titled is already
    called "Bez naslova" and emptying it would otherwise look like no change at
    all to the name, and return before ever reading what it said.
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
  const keep = worthKeeping(previous, text, await context.lastKept()) ? previous : undefined;
  const kept = keep === undefined ? {} : { snapshot: keep };

  // The id already reflects his opening lines, so leave it be. This is most
  // saves.
  if (baseOf(id) === base) return { kind: 'write', id, ...kept };

  // Trimming is ordinary and should still rename. But when almost nothing
  // survived, the text wasn't shortened, it was replaced — and the old name is
  // then the last evidence of what the note was.
  if (survivedTooLittle(previous, text)) return { kind: 'write', id, ...kept };

  const taking = claimName(base, id, await context.takenIds());
  return { kind: 'writeAndRename', id, to: taking.id, ...displacing(taking), ...kept };
}

/**
 * The id a put-away note takes. Keeps the one it had — after an emptying that's
 * all that's left of it — and never overwrites a note already put away under it.
 */
export function deletedIdFor(id: string, takenInDeleted: ReadonlySet<string>): string {
  return nextFreeId(baseOf(id), null, takenInDeleted);
}
