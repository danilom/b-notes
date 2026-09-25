import { type Language, describeWhen, strings } from '../language/wording.ts';
import { NO_NOTE, type NoNote, type NoteHandle } from '../notes/note-handle.ts';
import { isEmptyText } from '../notes/note.ts';

/**
 * What the app knows about the text in front of him, at one moment.
 *
 * Everything the strip along the bottom is decided from, and nothing else — so
 * what it says can be worked out and checked without a screen to say it on.
 */
export interface WhatIsHappening {
  /** Null when the text he started has not become a file yet. */
  openId: string | null;
  /** What is in the editor, which is not always what is on disk. */
  text: string;
  /** When it last reached disk, or null if it never has. */
  savedAt: number | null;
  /** Whether a save is waiting to run, including another attempt at one that failed. */
  saving: boolean;
  /**
   * Whether writing what he has typed has failed, and gone on failing.
   *
   * Not the first failure: Dropbox holds a file for about a second while it
   * uploads, and the attempt after that succeeds. A warning that appears and
   * clears itself weekly is one he learns to pass over, and then passes over
   * the once it is real.
   */
  couldNotSave: boolean;
  /** Something to tell him once, which outranks everything else here. */
  notice: string | null;
}

/**
 * The line along the bottom, in the order the answers take precedence.
 *
 * Writing that has not reached disk first, over even a notice: everything else
 * this line says is about what has already happened safely, and this is the one
 * thing he would act on. It outranks the pending save below it too, or the
 * silence kept for a save still on its way would go on being kept by the
 * attempts that keep failing.
 *
 * Then a notice: it reports a thing that has just happened, and a thing that
 * has just happened is worth more than how long ago he last saved. Then
 * silence, while there is nothing to report — the line is for reporting, not
 * for telling him to get on with it. Then the save, which is what it says for
 * the rest of the day.
 *
 * Silence again while a save is still waiting to run, and that is the whole
 * point of it. `Sačuvano` is read as *everything you have typed is on the
 * disk*, whatever tense it is written in, so saying it over keystrokes that
 * have not been written yet tells him his work is safe at the one moment it
 * is not. `Čuvam…` was worse: a promise about the future dressed as a report.
 * Nothing said claims nothing, and it is never wrong.
 */
export function statusFor(now: WhatIsHappening, language: Language): string {
  const words = strings(language);

  if (now.couldNotSave) return words.changesNotSaved;
  if (now.notice !== null) return now.notice;
  if (now.openId === null && isEmptyText(now.text)) return '';
  if (now.saving) return '';
  return now.savedAt === null ? words.notSaved : words.savedAgo(describeWhen(now.savedAt, language));
}

/**
 * Whether the bubble pointing at the delete button is up.
 *
 * Only once the empty state has settled. Selecting everything and typing over
 * it leaves the text empty for a fraction of a second, and a bubble blinking in
 * the corner of an ordinary edit is the unexplained movement this app works to
 * avoid. Waiting for the save to land means it appears when the text really is
 * empty and he has stopped.
 */
export function emptyHintShows(now: WhatIsHappening): boolean {
  return now.openId !== null && !now.saving && isEmptyText(now.text);
}

/**
 * Whether there is anything to put away.
 *
 * A text he has started but not saved has nothing on disk to move, so the
 * button is there and inert rather than coming and going as he types.
 */
export function canDelete(now: WhatIsHappening): boolean {
  return now.openId !== null;
}

/** A count of the copies kept of one text, and which text it was counted for. */
export interface KeptCopies {
  /** The text the count belongs to. Null before anything has been counted. */
  note: NoteHandle | NoNote;
  count: number;
}

/**
 * How many copies are kept of whatever he has open.
 *
 * None unless the count was taken for that very text. Holding the number on its
 * own meant every place that changes which text is open had to remember to
 * clear it, and the two that forgot left the way to one text's copies live over
 * another's — over a text he had just started, and over the empty editor a
 * delete leaves behind. Tying the count to its text makes forgetting impossible
 * rather than making it a thing to remember.
 */
export function keptOf(open: NoteHandle | NoNote, kept: KeptCopies): number {
  return open !== NO_NOTE && kept.note === open ? kept.count : 0;
}
