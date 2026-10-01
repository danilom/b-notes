import { type Language, describeWhen, strings } from '../../language/wording.ts';
import type { LengthBands } from '../../notes/text-length.ts';
import { type Shelf, openTextShelf } from './text-shelf.ts';
import type { ArchivedNote } from '../../notes/note.ts';

/**
 * The shelf somebody else filled, and the way to take something off it.
 *
 * The same act as the deleted texts and the same screen, which is why they
 * share one. What differs is that nothing in here was ever his to lose: there
 * is no Uništi zauvek, because an archive is a folder he was given a way into
 * rather than one he filled, and emptying it is not his to do from in here.
 */

export interface ArchiveHandlers {
  onBringBack: (note: ArchivedNote) => void;
  onClose: () => void;
  /** Reading the archives failed while the dialog waited for them. */
  onUnreadable: (error: unknown) => void;
}

/** What this dialog is about: everything in the archives, and what he searched. */
export interface ArchivedTexts {
  /** Or the reading of them, which the dialog waits for with a spinner. */
  archived: readonly ArchivedNote[] | Promise<readonly ArchivedNote[]>;
  query: string;
  /** The bands his own list is drawn by, so a page means the same thing here. */
  lengths: LengthBands;
}

/**
 * Where an archived file is, exactly as it is named on disk: its archive
 * folder over its file name. Every space is a `·`, because the tooltip it is
 * shown in collapses runs of spaces and loses them at either end, and his
 * names begin and end with spaces that are the whole of the difference
 * between two files.
 */
export function fileNameShown(note: Pick<ArchivedNote, 'archive' | 'fileName'>): string {
  return `${note.archive}\\\n${note.fileName}`.replaceAll(' ', '·');
}

function shelfFor(language: Language, handlers: ArchiveHandlers): Shelf<ArchivedNote> {
  const words = strings(language);
  const when = (note: ArchivedNote): string => describeWhen(note.updatedAt, language);
  /*
    A file in the archive that is no text to show: listed by its name with
    what is wrong in red, because everything put in an archive is accounted
    for, and with nothing offered to do with it.
  */
  const troubleOf = (note: ArchivedNote): string | null =>
    note.trouble === 'unreadable' ? words.archiveFileUnreadable : note.trouble === 'not-text' ? words.archiveFileNotText : null;

  return {
    mark: 'archive',
    heading: words.archive,
    intro: words.archiveIntro,
    previewHeading: words.archivePreview,
    previewIntro: words.archivePreviewCheck,
    emptyText: words.archiveEmpty,
    /*
      Which archive, then when it was last written — in that order, because the
      folder is the only thing that says where this came from and a date alone
      would read as one more old text. The date is the file's own: an archived
      text is not touched until it is brought in, so it still says when it was
      last written on whatever machine it came off.
    */
    whenFor: (note) => words.archiveFrom(note.archive, when(note)),
    // Said on the row rather than only in the preview, because the whole
    // reason to look at the list is to find the few that are not copies of
    // what he already has.
    markedFor: (note) => (note.alsoLive ? words.archiveAlsoLive : null),
    // `markedFor` already puts the already-have-one line at the top of the
    // preview, so it is not repeated here.
    notesFor: (note) => [
      troubleOf(note) ?? '',
      words.archiveOrigin(note.archive, when(note)),
      note.versions === 0 ? '' : words.archiveVersions(note.versions),
    ],
    troubleFor: troubleOf,
    hoverFor: fileNameShown,
    // Everything accounted for, in numbers: how many texts, and — in red,
    // and only when there are any — how many files cannot be opened.
    summaryFor: (texts) => {
      const failed = texts.filter((note) => note.trouble !== null).length;
      const readable = { said: words.archiveReadable(texts.length - failed) };
      return failed === 0 ? [readable] : [readable, { said: words.archiveFailed(failed), trouble: true }];
    },
    matching: words.archiveMatching,
    // Nothing outside this dialog can search the archive, because it is not
    // read until he asks for it. So the box is in here, and it starts empty.
    ownSearch: { placeholder: words.archiveSearch },
    actionsFor: (note) =>
      note.trouble !== null ? [] : [{ label: words.archiveBring, strength: 'main', act: () => handlers.onBringBack(note) }],
    backLabel: words.archiveBack,
    waiting: words.archiveLoading,
  };
}

export function openArchiveDialog(
  container: HTMLDialogElement,
  { archived, query, lengths }: ArchivedTexts,
  language: Language,
  handlers: ArchiveHandlers,
): () => void {
  return openTextShelf(container, shelfFor(language, handlers), { texts: archived, query, lengths }, language, {
    onClose: handlers.onClose,
    onUnreadable: handlers.onUnreadable,
  });
}
