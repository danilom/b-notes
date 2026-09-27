export interface Note {
  /** The filename. Storage detail — he never sees it. */
  id: string;
  /** His first line, edges trimmed and spaces made one: what the list shows. */
  title: string;
  /**
   * His first line exactly as typed, for sorting: the leading spaces he ranks
   * his texts by are kept, so a list in title order is his order.
   */
  sortTitle: string;
  /** How high those leading spaces rank it, in steps the list can mark. */
  rank: 0 | 1 | 2 | 3;
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
 * A note he has put away, and how many earlier copies went with it.
 *
 * Nothing special about its text: a deleted note holds what he wrote, because
 * one he had emptied first has its last kept copy written into it on the way
 * out. `versions` is what is left to say — how many older copies would go if
 * he destroyed it, which is what decides how hard destroying should be.
 */
export interface DeletedNote extends Note {
  versions: number;
}

/**
 * A copy of a text as it was before a save wrote over it.
 *
 * Nothing distinguishes one from another by its opening, since they are all the
 * same text — so what a list of them shows is when it was taken and how much of
 * the writing was there at the time.
 */
export interface NoteVersion {
  /** The moment it was taken, which is also what the file is called. */
  id: string;
  takenAt: number;
  text: string;
}

/**
 * What a run of the conversion did, and what it could not do.
 *
 * `refused` carries why as well as which. A name on its own says a file is not
 * in his list and leaves the reason on the floor at the one moment it existed —
 * and held open by Dropbox, gone, and refused by Windows all want different
 * answers from whoever reads the log.
 */
/**
 * A text sitting in an archive, and where it sits.
 *
 * `archive` is the folder's name, which is the only label an archive has and
 * the only thing that says where a row came from. `versions` counts what is
 * kept beside it — as with a deleted text, counted rather than read.
 *
 * `alsoLive` is whether something in his list already opens the same way. Not
 * a judgement that they are the same text, which nothing here can make: it is
 * the one fact that stops him bringing in a fourth copy of an essay he has,
 * and it is computed from titles alone.
 */
export interface ArchivedNote extends Note {
  archive: string;
  versions: number;
  alsoLive: boolean;
}

/** One folder of imported writing, and how much is in it. */
export interface Archive {
  name: string;
  texts: number;
}

export interface NoteStore {
  /**
   * Every note, text included. His whole corpus is under 3MB, so holding it in
   * memory makes searching instant and costs nothing worth measuring.
   */
  list(): Promise<Note[]>;
  read(id: string): Promise<string>;
  /**
   * Writes the text, creating the note when `id` is null. Never renames: a
   * text keeps the name it was made with. Returns the note's id, which may differ from the
   * one passed in, or null when there was nothing worth creating.
   */
  save(id: string | null, text: string): Promise<string | null>;
  /** Puts a note out of the way without destroying it. */
  moveToDeleted(id: string): Promise<void>;
  /**
   * The archive folders and how many texts each holds. Names and counts only —
   * nothing is read, so this is cheap enough to ask at startup, which is what
   * decides whether the strip under his list is there at all.
   */
  listArchives(): Promise<Archive[]>;
  /**
   * Every archived text, from every archive, with its text.
   *
   * Only when he asks. An import is mostly older copies of what he already
   * has, so searching them by default would answer nearly every search with a
   * pile of near-duplicates — and they are set aside for a reason.
   *
   * @param liveTitles what is already in his list, for `alsoLive`. Passed in
   * rather than read here: the caller is holding the whole corpus in memory
   * already, and reading six hundred files again to learn their first lines
   * would double what this costs to answer a question the caller can answer.
   */
  listArchived(liveTitles: ReadonlySet<string>): Promise<ArchivedNote[]>;
  /**
   * Moves one out of its archive and into his list, with its kept copies, and
   * returns the name it arrived under.
   *
   * A move, not a copy: two of a text is what the archive exists to avoid.
   */
  bringBack(archive: string, id: string): Promise<string>;
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
  /** How many copies are kept of a note. Counted without reading any of them. */
  /**
   * Keeps a copy of a note's text now, whatever the ordinary rule would say.
   *
   * That rule is built for him editing: it declines when little enough is
   * going, and declines again when the newest copy already holds most of it.
   * Neither reading applies to a whole text being replaced on purpose, and the
   * caller that does that is promising him in so many words that what is there
   * now will still be there afterwards.
   *
   * @returns what the copy is called, so a caller that made one on his behalf
   * can point at it afterwards.
   */
  keepCopy(id: string, text: string): Promise<string>;

  countVersions(id: string): Promise<number>;
  /** Every copy kept of a note, newest first. */
  listVersions(id: string): Promise<NoteVersion[]>;
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
