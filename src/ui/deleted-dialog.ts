import { type Language, describeWhen, strings } from '../language/wording.ts';
import { type Shelf, openTextShelf } from './text-shelf.ts';
import type { DeletedNote } from '../notes/note.ts';

/**
 * The shelf he filled himself, and the way back off it.
 *
 * A dialog rather than a corner of the app, because bringing a text back is a
 * thing he does instead of writing, not alongside it. Being unable to reach
 * his writing while it is open is what makes the text inside it obviously not
 * his to edit — no caret, nothing to type into, and no explaining required.
 *
 * Everything about how it behaves is in `text-shelf.ts`. What is here is what
 * makes this one the deleted texts rather than the archive: the bin on the
 * heading, the promise that nothing is gone, and the one button in the app
 * that can lose his writing on purpose.
 */

export interface DeletedHandlers {
  onRestore: (id: string) => void;
  onDestroy: (note: DeletedNote) => void;
  onClose: () => void;
}

/** What this dialog is about: everything he has put away, and what he searched. */
export interface DeletedTexts {
  deleted: readonly DeletedNote[];
  query: string;
}

function shelfFor(language: Language, handlers: DeletedHandlers): Shelf<DeletedNote> {
  const words = strings(language);
  return {
    mark: 'delete',
    heading: words.deleted,
    intro: words.deletedKept,
    previewHeading: words.deletedPreview,
    previewIntro: words.deletedPreviewCheck,
    emptyText: words.deletedEmpty,
    // When he put it away, which is what a file in Obrisano has for a time: it
    // is written on the way in, so the moment it landed is the moment it says.
    whenFor: (note) => words.deletedWhen(describeWhen(note.updatedAt, language)),
    // What else is kept of it, and silent when there is nothing to say.
    notesFor: (note) => (note.versions === 0 ? [] : [words.deletedVersions(note.versions)]),
    matching: words.deletedMatching,
    actionsFor: (note) => [
      { label: words.restore, strength: 'main', act: () => handlers.onRestore(note.id) },
      { label: words.destroy, strength: 'grave', act: () => handlers.onDestroy(note) },
    ],
    backLabel: words.deletedBack,
  };
}

export function openDeletedDialog(
  container: HTMLDialogElement,
  { deleted, query }: DeletedTexts,
  language: Language,
  handlers: DeletedHandlers,
): () => void {
  return openTextShelf(container, shelfFor(language, handlers), { texts: deleted, query }, language, {
    onClose: handlers.onClose,
  });
}
