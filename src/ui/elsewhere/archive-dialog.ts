import { type Language, describeWhen, strings } from '../../language/wording.ts';
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
}

/** What this dialog is about: everything in the archives, and what he searched. */
export interface ArchivedTexts {
  archived: readonly ArchivedNote[];
  query: string;
}

function shelfFor(language: Language, handlers: ArchiveHandlers): Shelf<ArchivedNote> {
  const words = strings(language);
  const when = (note: ArchivedNote): string => describeWhen(note.updatedAt, language);

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
      words.archiveOrigin(note.archive, when(note)),
      note.versions === 0 ? '' : words.archiveVersions(note.versions),
    ],
    matching: words.archiveMatching,
    // Nothing outside this dialog can search the archive, because it is not
    // read until he asks for it. So the box is in here, and it starts empty.
    ownSearch: { placeholder: words.archiveSearch },
    actionsFor: (note) => [
      { label: words.archiveBring, strength: 'main', act: () => handlers.onBringBack(note) },
    ],
    backLabel: words.archiveBack,
  };
}

export function openArchiveDialog(
  container: HTMLDialogElement,
  { archived, query }: ArchivedTexts,
  language: Language,
  handlers: ArchiveHandlers,
): () => void {
  return openTextShelf(container, shelfFor(language, handlers), { texts: archived, query }, language, {
    onClose: handlers.onClose,
  });
}
