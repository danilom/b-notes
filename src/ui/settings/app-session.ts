import type { FileSystem } from '../../platform/file-system.ts';
import { isNoteId } from '../../notes/note-naming.ts';

const FILE = 'session.json';

/** Where the caret sat in a text, and how far down the box was scrolled. */
export interface Place {
  caret: number;
  scrollTop: number;
}

/** What he was doing when the app last closed. Per machine, and never synced. */
export interface Session {
  openNoteId: string | null;
  /**
   * Where he was in that text, or null when the file does not say.
   *
   * Null is a real answer and not a zero. A file written by a build from before
   * any of this says nothing about where he was, and reading that as the top of
   * the text would put a live caret on his first line — which is the filename,
   * and the one place the app must not leave one. Not knowing has its own
   * answer, and it is the caller's to give.
   *
   * Nothing here is believed either: the text it describes lives in Dropbox and
   * may have been rewritten on another machine since, so an offset can point
   * past the end of what is there now. Held to the text at the moment it is
   * used, which is the only place the text is known.
   */
  place: Place | null;
}

const NOTHING_OPEN: Session = { openNoteId: null, place: null };

/**
 * Safe to delete. A missing or unreadable file opens the app with nothing
 * selected, which is a worse morning than usual and no worse than that.
 *
 * The id is checked rather than trusted: this file outlives the note it names,
 * and a stale one must not become a path.
 */
export async function readSession(files: FileSystem, folder: string): Promise<Session> {
  let text: string;
  try {
    text = await files.read(`${folder}/${FILE}`);
  } catch {
    /*
      Deliberately not logged, which is the exception rather than the habit.

      There is no file here until he first opens a text, so on every fresh
      machine this is the answer, and a warning at every first run is a warning
      nobody will read by the time one matters. Losing it costs him which text
      was open and nothing else — `DESIGN.md` calls this folder safe to delete.
    */
    return NOTHING_OPEN;
  }

  try {
    return sessionFrom(JSON.parse(text));
  } catch {
    // Deliberately not logged, for the same reason as the read above: this
    // module has no logger, and what a half-written session costs him is which
    // text was open. A truncated file is what an interrupted write leaves, and
    // it is the ordinary way this one fails.
    return NOTHING_OPEN;
  }
}

/**
 * What the file says, with each part judged on its own.
 *
 * A place he cannot be put back into must not cost him the text he was in: the
 * two are written together but they are not one fact, and the text is the part
 * worth having. So a nonsense offset falls back to the top of a text that still
 * opens, rather than to no text at all.
 */
export function sessionFrom(raw: unknown): Session {
  if (typeof raw !== 'object' || raw === null) return NOTHING_OPEN;
  const held = raw as Record<string, unknown>;

  const open = held['openNoteId'];
  if (typeof open !== 'string' || !isNoteId(open)) return NOTHING_OPEN;

  return { openNoteId: open, place: placeFrom(held['place']) };
}

/**
 * The two numbers, or nothing at all.
 *
 * All or neither: half a place is not one, and a caret without the scroll that
 * went with it would put him somewhere he never was. Nothing is a perfectly
 * good answer here, so there is no reason to salvage a broken one.
 */
function placeFrom(raw: unknown): Place | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const held = raw as Record<string, unknown>;
  const caret = offsetFrom(held['caret']);
  const scrollTop = offsetFrom(held['scrollTop']);
  return caret === null || scrollTop === null ? null : { caret, scrollTop };
}

/** A position in his text or in the box, or nothing when it is not one. */
function offsetFrom(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  // Whole pixels and whole characters. A fraction is harmless in both, and
  // rounding here keeps the file readable by whoever opens it.
  return Math.floor(value);
}

export async function writeSession(
  files: FileSystem,
  folder: string,
  session: Session,
): Promise<void> {
  await files.write(`${folder}/${FILE}`, `${JSON.stringify(session, null, 2)}\n`);
}
