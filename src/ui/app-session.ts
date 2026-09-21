import type { FileSystem } from '../platform/file-system.ts';
import { isNoteId } from '../notes/note-naming.ts';

const FILE = 'session.json';

/** What he was doing when the app last closed. Per machine, and never synced. */
export interface Session {
  openNoteId: string | null;
}

const NOTHING_OPEN: Session = { openNoteId: null };

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
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return NOTHING_OPEN;
    const open = (parsed as Record<string, unknown>)['openNoteId'];
    return typeof open === 'string' && isNoteId(open) ? { openNoteId: open } : NOTHING_OPEN;
  } catch {
    // Deliberately not logged, for the same reason as the read above: this
    // module has no logger, and what a half-written session costs him is which
    // text was open. A truncated file is what an interrupted write leaves, and
    // it is the ordinary way this one fails.
    return NOTHING_OPEN;
  }
}

export async function writeSession(
  files: FileSystem,
  folder: string,
  session: Session,
): Promise<void> {
  await files.write(`${folder}/${FILE}`, `${JSON.stringify(session, null, 2)}\n`);
}
