export interface Note {
  /** The filename. Storage detail — he never sees it. */
  id: string;
  /** Built from the start of his text; there is no title anywhere else. */
  title: string;
  text: string;
  /**
   * The same text, lower case and without diacritics, ready to be searched.
   *
   * Kept rather than worked out when he types, because he drops diacritics
   * inconsistently and a search has to fold both sides to find his own writing.
   * Folding six hundred texts costs a tenth of a second once; folding them on
   * every letter he types costs that on every letter.
   */
  searchable: string;
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
   * Puts anything he has in another format into `.txt`, and reports what it
   * couldn't move. Run once at startup, before anything is listed.
   */
  convertToPlainText(): Promise<{ converted: number; refused: string[] }>;
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
  return isEmptyText(note.text);
}

/** The same test, for a save that hasn't become a note yet. */
export function isEmptyText(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * Whether a save replaced the text rather than edited it.
 *
 * A proportion rather than a byte count, so it means the same thing for a
 * 200-byte jot and a 145KB essay. Trimming a sentence is an edit and should
 * still rename the file; an essay replaced by one keystroke should not, because
 * the old filename is then the last evidence of what the note was.
 */
export function survivedTooLittle(previous: string, next: string): boolean {
  if (previous.length === 0) return false;
  return next.trim().length < previous.trim().length * 0.1;
}
