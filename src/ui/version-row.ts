import { type Language, describeWhen, strings } from '../language/wording.ts';
import type { NoteVersion } from '../notes/note.ts';
import { titleFrom } from '../notes/note-title.ts';
import { countWords } from '../notes/word-count.ts';

/**
 * One row of the index beside a diff.
 *
 * Thin on purpose. A row cannot say which copy he wants — every copy of one
 * text opens the same way, so anything it puts on a line is a guess at what
 * distinguishes them. What tells him is the diff, which is now open beside it,
 * so the row's job is to be a place in a list and not a summary of one.
 */
export interface VersionRow {
  /** Where this copy sits in the list as drawn, or null when it is the only one. */
  number: string | null;
  /** How long it was. */
  size: string;
  when: string;
  /**
   * The one line underneath: what the copy was called, where that differed, and
   * otherwise how its length compares. Null when it is neither.
   *
   * The title wins the line when both apply. A copy that opened differently is
   * the rarer thing and the more distinctive, and the length is the fact the
   * diff beside it will make plain anyway.
   */
  note: string | null;
}

export function describeVersion(
  version: NoteVersion,
  current: string,
  currentTitle: string,
  language: Language,
  at: { row: number; of: number } = { row: 1, of: 1 },
): VersionRow {
  const words = strings(language);
  const was = titleFrom(version.text);
  const length = countWords(version.text);
  const difference = length - countWords(current);

  const renamed = was.length > 0 && was !== currentTitle;
  return {
    // One copy needs no number: it is the only row, and the heading says which
    // text it belongs to already.
    number: at.of > 1 ? words.versionNumber(at.row) : null,
    size: words.versionWords(length),
    when: describeWhen(version.takenAt, language),
    note: renamed
      ? words.versionWasCalled(was)
      : difference === 0
        ? null
        : words.versionCompared(difference),
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
