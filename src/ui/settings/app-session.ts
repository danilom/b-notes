import type { FileSystem } from '../../platform/file-system.ts';
import { isNoteId } from '../../notes/note-naming.ts';

const FILE = 'session.json';

/** What he was doing when the app last closed. Per machine, and never synced. */
export interface Session {
  openNoteId: string | null;
  /**
   * Where the caret sat, as an offset into his text, and how far down the box
   * was scrolled.
   *
   * Both mean nothing without a text to apply them to, and neither is believed
   * when it arrives: the file it describes is in Dropbox and may have been
   * rewritten on another machine since, so an offset can easily point past the
   * end of what is now there. Held to the text at the moment it is used rather
   * than checked here, which is the only place the text is known.
   */
  caret: number;
  scrollTop: number;
}

const NOTHING_OPEN: Session = { openNoteId: null, caret: 0, scrollTop: 0 };

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

  return {
    openNoteId: open,
    caret: offsetFrom(held['caret']),
    scrollTop: offsetFrom(held['scrollTop']),
  };
}

/** A position in his text or in the box, or the top when it is not one. */
function offsetFrom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
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
