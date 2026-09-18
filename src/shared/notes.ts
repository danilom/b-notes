export interface NoteSummary {
  id: string;
  title: string;
  updatedAt: number;
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
  write(id: string, text: string): Promise<void>;
  create(title: string): Promise<string>;
}
