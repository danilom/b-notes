export interface Note {
  /** The filename. Storage detail — he never sees it. */
  id: string;
  /** Built from the start of his text; there is no title anywhere else. */
  title: string;
  text: string;
  updatedAt: number;
  bytes: number;
}

/**
 * The only way the app touches stored text.
 *
 * Async in every implementation, including the in-browser mock, so that call
 * sites are identical whether they're talking to the filesystem over IPC or to
 * `localStorage` during UI work.
 */
export interface NoteStore {
  /**
   * Every note, text included. His whole corpus is under 3MB, so holding it in
   * memory makes searching instant and costs nothing worth measuring.
   */
  list(): Promise<Note[]>;
  read(id: string): Promise<string>;
  /**
   * Writes the text, creating the note when `id` is null and renaming it when
   * his opening lines changed. Returns the note's id, which may differ from the
   * one passed in, or null when there was nothing worth creating.
   */
  save(id: string | null, text: string): Promise<string | null>;
  /** Puts a note out of the way without destroying it. */
  moveToDeleted(id: string): Promise<void>;
}

/**
 * Clearing the text is how he deletes — he never found Resoph's delete command,
 * and his corpus carries dozens of emptied files still sitting in the list.
 */
export function isEmptied(note: Note): boolean {
  return note.text.trim().length === 0;
}
