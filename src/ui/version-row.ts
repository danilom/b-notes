import { type Language, describeWhen, strings } from '../language/wording.ts';
import type { NoteVersion } from '../notes/note.ts';
import { titleFrom } from '../notes/note-title.ts';
import { diffParagraphs } from '../notes/paragraph-diff.ts';
import { countWords } from '../notes/word-count.ts';
import { onOneLine } from './text-snippet.ts';

/** Enough of a paragraph to recognise it by, on the one line a row has for it. */
const SNIPPET = 120;

/**
 * The first paragraph of one kind in the same comparison the preview draws.
 *
 * The one comparison, not a second one that agrees with it most of the time: a
 * row promising something the preview then fails to mark is the kind of fault
 * nobody finds until he does.
 *
 * Never `alreadySaid`, whichever title is on screen already — a row that says
 * the same thing on two lines reads as broken.
 */
function firstOfKind(
  diff: ReturnType<typeof diffParagraphs>,
  kind: 'added' | 'missing',
  alreadySaid: string,
): string | null {
  if (diff.unrelated) return null;
  const only = diff.pieces.find((piece) => piece.kind === kind && piece.text !== alreadySaid);
  return only?.text ?? null;
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
  added: Difference | null;
  /** The first thing his text holds that this copy never did. */
  missing: Difference | null;
}

/**
 * One of the two directions, as a row says it.
 *
 * The two halves apart, because they are read differently: the tag is ours and
 * carries the colour of the block it stands for in the preview, and the rest is
 * a piece of his writing.
 */
export interface Difference {
  tag: string;
  text: string;
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
  // own on the line above, and the active text's in the heading over the dialog.
  const diff = diffParagraphs(version.text, current);
  const extra = firstOfKind(diff, 'added', was);
  const gone = firstOfKind(diff, 'missing', currentTitle);

  return {
    size: words.versionSize(length, length - countWords(current)),
    when: describeWhen(version.takenAt, language),
    wasCalled: was.length > 0 && was !== currentTitle ? words.versionWasCalled(was) : null,
    added:
      extra === null
        ? null
        : { tag: words.versionAddedTag, text: words.quoted(onOneLine(extra, SNIPPET)) },
    missing:
      gone === null
        ? null
        : { tag: words.versionMissingTag, text: words.quoted(onOneLine(gone, SNIPPET)) },
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
