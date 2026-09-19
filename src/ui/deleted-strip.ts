import { type Language, strings } from '../language/wording.ts';
import type { DeletedNote } from '../notes/note.ts';
import { matches } from './note-list.ts';

/** What the strip under his list says, and whether it is there at all. */
export interface DeletedStrip {
  shown: boolean;
  label: string;
}

/**
 * The way back to what he has put away.
 *
 * Says how many while he is just looking, and how many match while he is
 * searching — because a search that comes back with nothing is exactly the
 * moment he needs telling that the text might be in here. Gone entirely when
 * nothing matches, so the app is not keeping a tally of his deletions in front
 * of him while he writes.
 */
export function deletedStripFor(
  deleted: readonly DeletedNote[],
  query: string,
  language: Language,
): DeletedStrip {
  const words = strings(language);
  const looking = query.trim();

  if (looking.length === 0) {
    return {
      shown: deleted.length > 0,
      // Named and counted in one line, the way the headings above it are.
      label: `${words.deleted} · ${words.noteCount(deleted.length)}`,
    };
  }

  const found = deleted.filter((note) => matches(note, looking));
  return { shown: found.length > 0, label: words.deletedMatching(found.length, looking) };
}
