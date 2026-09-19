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
/**
 * A note he has put away, and what bringing it back would give him.
 *
 * `text` here is not what is in the file — it is what he would get back. For a
 * text he emptied before deleting, the file is a husk and everything he wrote
 * is in the newest kept version, so that is what this carries, along with the
 * title and the searchable form built from it. Anything else would mean five
 * rows reading "Bez naslova" over forty thousand characters of his writing,
 * and a search that cannot find any of them.
 *
 * `versions` is what decides how hard it should be to destroy: the size of the
 * file says nothing about that when the file is a husk.
 */
export interface DeletedNote extends Note {
  versions: number;
  /** Whether `text` came from a kept version rather than from the file. */
  fromVersion: boolean;
}

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
  /**
   * Everything he has put away, newest first. Text included, same as `list`:
   * the dialog shows him what a deleted text said before he decides.
   */
  listDeleted(): Promise<DeletedNote[]>;
  /**
   * Brings one back, and returns the id it came back under — which differs from
   * the one asked for when he has since written something with the same title.
   */
  restore(id: string): Promise<string>;
  /**
   * Destroys one he had already put away, along with every version of it kept
   * when it went. The only thing in the app that loses his writing on purpose,
   * and it reaches nothing that is still in his list.
   */
  destroy(id: string): Promise<void>;
}

/**
 * Whether there is nothing left in a note.
 *
 * Not the same as him deleting it, though it used to be read that way here. His
 * old archive turned out to hold 95 texts he had deliberately put in the trash,
 * against 8 emptied ones still sitting in the list — so he knows how to delete
 * and does, and emptying is more often him clearing a page than throwing it
 * away.
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
