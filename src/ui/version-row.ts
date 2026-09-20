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
  /**
   * Set on the copy a restore made of what he had before it.
   *
   * Above the rest of the row rather than under it, and in the accent, because
   * it answers a question the other lines cannot: he restored something, wants
   * it back the way it was, and this is the only row that can give it to him.
   * It does not displace the comparison, which is still worth reading.
   */
  wasActive: string | null;
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

/**
 * One copy and everything needed to say anything about it.
 *
 * Named rather than ordered. Two of these are strings a few characters apart in
 * meaning — his text, and what his text is called — and a list of parameters is
 * the wrong place to keep two of those side by side.
 */
export interface VersionInList {
  version: NoteVersion;
  /** His text as it stands, which the copy is read against. */
  current: string;
  /** What that text is called now, so a copy that opened differently can say so. */
  currentTitle: string;
  /** Where the copy sits in the list as drawn. */
  at?: { row: number; of: number };
  /** Whether a restore in this sitting is what made this copy. */
  restoredFrom?: boolean;
}

export function describeVersion(
  { version, current, currentTitle, at = { row: 1, of: 1 }, restoredFrom = false }: VersionInList,
  language: Language,
): VersionRow {
  const words = strings(language);
  const was = titleFrom(version.text);
  const length = countWords(version.text);
  const difference = length - countWords(current);

  const renamed = was.length > 0 && was !== currentTitle;
  return {
    wasActive: restoredFrom ? words.previouslyActive : null,
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
 *
 * Nor two copies that say the same thing, which would be two rows he cannot
 * tell apart opening the same diff. The store no longer makes those, but a
 * folder that collected some before it stopped should not go on showing them.
 *
 * Newest first, so the one kept of any repeated text is the most recent.
 */
export function versionsWorthShowing(
  versions: readonly NoteVersion[],
  current: string,
): NoteVersion[] {
  const already = new Set<string>([current]);

  return versions.filter((version) => {
    if (already.has(version.text)) return false;
    already.add(version.text);
    return true;
  });
}
