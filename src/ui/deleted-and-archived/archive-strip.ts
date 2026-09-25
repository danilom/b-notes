import { type Language, strings } from '../../language/wording.ts';
import type { Archive } from '../../notes/note.ts';

/** What the Arhiva strip says, and whether there is a strip at all. */
export interface ArchiveStrip {
  label: string;
  /** False when nothing was ever imported, which is when there is no strip. */
  present: boolean;
}

/**
 * The way into writing brought in from somewhere else.
 *
 * Unlike the strip above it, this one is not always there. He fills Obrisani
 * tekstovi himself simply by using the app, so an empty one is empty *for now*
 * and saying "nema obrisanih" is the honest answer. He cannot make an archive
 * at all — one exists only because somebody put a folder there — so an empty
 * Arhiva is not a place he has not been to yet, it is not a place on this
 * machine, and a control that can never come to life is worse than no control.
 *
 * The count does not move when he searches, and that is deliberate. The
 * deleted strip can say how many match because those texts are already in
 * memory; these are not read until he asks, because an import is mostly older
 * copies of what he already has and searching it by default would answer
 * nearly every search with a pile of near-duplicates. A strip that claimed a
 * number here would be claiming to have looked.
 */
export function archiveStripFor(
  archives: readonly Archive[],
  language: Language,
): ArchiveStrip {
  const words = strings(language);
  const texts = archives.reduce((sum, archive) => sum + archive.texts, 0);
  return {
    present: archives.length > 0,
    // Named and counted in one line, the way the headings above it are — and
    // the same counting words, so the foot of the list reads like the rest.
    label: `${words.archive} · ${words.noteCount(texts)}`,
  };
}
