import { type Language, describeWhen, strings } from '../language/wording.ts';
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
  /** Whether a save is waiting to run. */
  saving: boolean;
  /** Something to tell him once, which outranks everything else here. */
  notice: string | null;
}

/**
 * The line along the bottom, in the order the answers take precedence.
 *
 * A notice first: it reports a thing that has just happened, and a thing that
 * has just happened is worth more than how long ago he last saved. Then
 * silence, while there is nothing to report — the line is for reporting, not
 * for telling him to get on with it. Then the save, which is what it says for
 * the rest of the day.
 */
export function statusFor(now: WhatIsHappening, language: Language): string {
  const words = strings(language);

  if (now.notice !== null) return now.notice;
  if (now.openId === null && isEmptyText(now.text)) return '';
  if (now.saving) return words.saving;
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
