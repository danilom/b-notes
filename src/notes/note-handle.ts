declare const handle: unique symbol;

/**
 * What a text he can edit is called, while the app is running.
 *
 * Never written down anywhere, and meaningless between one run and the next.
 * It exists because the only other name a text has is its filename, and that
 * is built from his opening line — so it changes when he rewrites the first
 * sentence, which he does constantly. Everything that went wrong with saving
 * came from using that name as a name for the thing: a text renamed out from
 * under whatever was holding it, and two entries for what was one text.
 *
 * So: the filename says where a text lives at this moment, and a handle says
 * which text it is. Only one of those is allowed out of this folder.
 *
 * Handles are for texts he can edit, and only those. What he has put away,
 * what sits in an archive and the copies kept of a text are pointed at by
 * their names, because nothing renames them while he is looking at a list of
 * them. That is a smaller promise than it sounds — putting a second `Pismo`
 * away renames the `Pismo` already in Obrisano, by the same rule his own list
 * uses — so a name that no longer finds anything is an error to be reported
 * and never a near miss to be acted on.
 */
export type NoteHandle = number & { readonly [handle]: true };

/**
 * Handles in the order they were minted, which is the order they were read.
 *
 * A counter and nothing else. Reusing a number would let something holding an
 * old one act on a text that has taken its place, which is the whole class of
 * fault this type exists to end.
 */
export function createHandles(): () => NoteHandle {
  let last = 0;
  return () => {
    last += 1;
    return last as NoteHandle;
  };
}
