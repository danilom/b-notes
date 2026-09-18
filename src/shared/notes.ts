export interface NoteSummary {
  /** The filename. Storage detail — he never sees it. */
  id: string;
  /** His own first line, which is the only title there is. */
  title: string;
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
  list(): Promise<NoteSummary[]>;
  read(id: string): Promise<string>;
  /**
   * Writes the text, creating the note when `id` is null and renaming it when
   * his first line changed. Returns the note's id, which may differ from the one
   * passed in, or null when there was nothing worth creating.
   */
  save(id: string | null, text: string): Promise<string | null>;
}
