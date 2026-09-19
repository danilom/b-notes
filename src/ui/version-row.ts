import { type Language, describeWhen, strings } from '../language/wording.ts';
import type { NoteVersion } from '../notes/note.ts';
import { titleFrom } from '../notes/note-title.ts';
import { paragraphsNotIn } from '../notes/text-change.ts';
import { countWords } from '../notes/word-count.ts';
import { onOneLine } from './text-snippet.ts';

/** Enough of a paragraph to recognise it by, on the one line a row has for it. */
const SNIPPET = 120;

/**
 * What one row in the versions list says.
 *
 * Every copy of a text opens the same way, so its opening tells them apart
 * about as well as its file size does. What does tell them apart is what each
 * one still holds that his text has since lost — which is also the only reason
 * he is in this dialog.
 */
/**
 * The first thing this copy says that his text no longer does.
 *
 * Read off `paragraphsNotIn` rather than worked out beside it, so a row and the
 * preview it opens can never disagree about what is missing — including the
 * case where everything is, which both have to treat as nothing being marked.
 *
 * Never its title, even when that changed: the line above already says what it
 * used to be called, and a row saying the same thing twice reads as a fault.
 */
function whatIsGone(version: string, current: string, was: string): string | null {
  const gone = paragraphsNotIn(version, current).find(
    (piece) => piece.missing && piece.text.trim() !== was,
  );
  return gone?.text.trim() ?? null;
}

export interface VersionRow {
  /** How long it was, and what that is beside his text now. */
  size: string;
  when: string;
  /** Only when this copy opened differently from the way the text opens now. */
  wasCalled: string | null;
  /** The first thing it says that his text no longer does, if there is one. */
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
  const gone = whatIsGone(version.text, current, was);
  const length = countWords(version.text);

  return {
    size: words.versionSize(length, length - countWords(current)),
    when: describeWhen(version.takenAt, language),
    wasCalled: was.length > 0 && was !== currentTitle ? words.versionWasCalled(was) : null,
    missing: gone === null ? null : words.versionNowMissing(onOneLine(gone, SNIPPET)),
  };
}
