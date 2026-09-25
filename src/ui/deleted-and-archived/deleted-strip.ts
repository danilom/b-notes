import { type Language, strings } from '../../language/wording.ts';
import type { DeletedNote } from '../../notes/note.ts';
import { matches } from '../note-list.ts';

/** What the strip under his list says, and whether there is anything behind it. */
export interface DeletedStrip {
  label: string;
  /** False when he has thrown nothing away, which is when the strip is inert. */
  canOpen: boolean;
}

/**
 * The way back to what he has put away.
 *
 * Says how many while he is just looking, and how many match while he is
 * searching — because a search that comes back with nothing is exactly the
 * moment he needs telling that the text might be in here.
 *
 * Always there, even with nothing in it. It used to go, on the reading that the
 * app should not keep a tally of his deletions in front of him while he writes;
 * what that actually did was make a whole place in the app appear and disappear
 * under him. He is the sort of user who writes down where things are, and
 * "nema obrisanih" is a smaller thing to read past than a strip that is
 * sometimes a strip.
 *
 * Still live while a search matches none of them: there is something in there
 * to see, and the dialog he lands in offers him all of it.
 */
export function deletedStripFor(
  deleted: readonly DeletedNote[],
  query: string,
  language: Language,
): DeletedStrip {
  const words = strings(language);
  const looking = query.trim();
  const canOpen = deleted.length > 0;

  if (looking.length === 0) {
    return {
      canOpen,
      // Named and counted in one line, the way the headings above it are.
      label: `${words.deleted} · ${canOpen ? words.noteCount(deleted.length) : words.deletedNone}`,
    };
  }

  const found = deleted.filter((note) => matches(note, looking));
  return { canOpen, label: words.deletedMatching(found.length, looking) };
}
