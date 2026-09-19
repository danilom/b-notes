import { type Language, describeWhen, strings } from '../language/wording.ts';
import type { NoteVersion } from '../notes/note.ts';
import { titleFrom } from '../notes/note-title.ts';
import { paragraphsNotIn } from '../notes/text-change.ts';
import { countWords } from '../notes/word-count.ts';
import { onOneLine } from './text-snippet.ts';

/** Enough of a paragraph to recognise it by, on the one line a row has for it. */
const SNIPPET = 120;

/**
 * The first paragraph `text` has that `other` does not.
 *
 * Read off `paragraphsNotIn` rather than worked out beside it, so a row and the
 * preview it opens can never disagree about what is missing — including the
 * case where everything is, which both have to treat as nothing being marked.
 *
 * Never `alreadySaid`, which is whichever title is on screen already: a row
 * that says the same thing on two lines reads as a fault.
 */
function firstOnlyIn(text: string, other: string, alreadySaid: string): string | null {
  const only = paragraphsNotIn(text, other).find(
    (piece) => piece.missing && piece.text.trim() !== alreadySaid,
  );
  return only?.text.trim() ?? null;
}

/**
 * What one row in the versions list says.
 *
 * Every copy of a text opens the same way, so its opening tells them apart
 * about as well as its file size does. What does tell them apart is how it
 * differs from what he has now, in both directions — what it would give him
 * back, and what it never had.
 */
export interface VersionRow {
  /** How long it was, and what that is beside his text now. */
  size: string;
  when: string;
  /** Only when this copy opened differently from the way the text opens now. */
  wasCalled: string | null;
  /** The first thing it holds that his text no longer does, if there is one. */
  added: string | null;
  /** The first thing his text holds that this copy never did. */
  missing: string | null;
}

export function describeVersion(
  version: NoteVersion,
  current: string,
  currentTitle: string,
  language: Language,
): VersionRow {
  const words = strings(language);
  const was = titleFrom(version.text);
  const length = countWords(version.text);

  // Each direction skips the title that is already on screen for it: the copy's
  // own on the line above, and his text's in the heading over the whole dialog.
  const extra = firstOnlyIn(version.text, current, was);
  const gone = firstOnlyIn(current, version.text, currentTitle);

  return {
    size: words.versionSize(length, length - countWords(current)),
    when: describeWhen(version.takenAt, language),
    wasCalled: was.length > 0 && was !== currentTitle ? words.versionWasCalled(was) : null,
    added: extra === null ? null : words.versionAdded(onOneLine(extra, SNIPPET)),
    missing: gone === null ? null : words.versionMissing(onOneLine(gone, SNIPPET)),
  };
}

/**
 * The copies worth putting in front of him.
 *
 * One that matches his text exactly has nothing to give back, and offering to
 * replace his text with itself is offering him nothing. It happens for real:
 * the moment he brings a copy back, that copy is what he has, and it would sit
 * in this list from then on saying so.
 */
export function versionsWorthShowing(
  versions: readonly NoteVersion[],
  current: string,
): NoteVersion[] {
  return versions.filter((version) => version.text !== current);
}
