import { type Language, strings } from '../language/wording.ts';
import { type DeletedNote, type Note, isEmptyText } from '../notes/note.ts';
import type { Confirmation } from './confirm-dialog.ts';

/**
 * A confirmation with the answers left out, which the caller wires up.
 *
 * Kept apart from the dialog that shows it because the dialog does not know
 * what a note is, and should not have to: it asks a question and reports which
 * way he answered.
 */
export type Asked = Omit<Confirmation, 'onConfirm' | 'onCancel'>;

/**
 * Above this, destroying asks him to write the word out.
 *
 * Roughly a paragraph and a half of his writing — his own median paragraph runs
 * to about 270 characters — which is the line between a note to himself and
 * something he sat down to write. Under it the question is a plain yes or no,
 * which is what makes clearing out a pile of empty ones bearable.
 */
const WRITE_IT_OUT_ABOVE = 500;

/**
 * Whether destroying this one should make him write the word first.
 *
 * Any kept copy at all counts, whatever the file's size says. A short text he
 * emptied and rewrote has history behind it that the length cannot show, and
 * destroying takes that with it.
 */
export function mustWriteItOut(note: DeletedNote): boolean {
  return note.versions > 0 || note.bytes > WRITE_IT_OUT_ABOVE;
}

/** The same word the list uses, rather than a heading with a hole in it. */
function named(title: string, language: Language): string {
  return title.length > 0 ? title : strings(language).untitled;
}

/**
 * What he is told before a text is put away.
 *
 * A statement rather than a question: he has no way of being surer than he was
 * when he pressed the button, so what he needs is what is about to happen and
 * the fact that it can be undone — which is the part he cannot know.
 */
export function confirmationForDeleting(note: Note, language: Language): Asked {
  const words = strings(language);
  return {
    title: { mark: 'delete', label: words.deleteTitle, name: named(note.title, language) },
    // No promise of getting back a text that has nothing in it, since that is
    // the one text the promise might not hold for.
    body: isEmptyText(note.text) ? words.deleteEmptyBody : words.deleteBody,
    confirm: words.deleteKeep,
  };
}

/**
 * What he is told before a text is destroyed, and how hard he is made to work.
 *
 * The barrier is a word written out rather than a second button, because a
 * second button is still one press and the point is that this should not be
 * reachable by pressing.
 */
export function confirmationForDestroying(note: DeletedNote, language: Language): Asked {
  const words = strings(language);
  return {
    title: { mark: 'delete', label: words.destroyTitle, name: named(note.title, language) },
    body: note.versions > 0 ? words.destroyBodyWithVersions : words.destroyBody,
    confirm: words.destroy,
    danger: true,
    ...(mustWriteItOut(note)
      ? { phrase: { prompt: words.destroyPrompt, words: [words.destroyWord, words.destroyWordPlain] } }
      : {}),
  };
}
