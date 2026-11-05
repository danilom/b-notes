import { type Language, strings } from '../../language/wording.ts';
import { diffTexts, mergeCloseChanges, separateTidying } from '../../notes/text-diff.ts';
import { titleOf } from '../dialogs/dialog-heading.ts';
import { showAsModal } from '../dialogs/modal.ts';
import { icon } from '../icons.ts';
import { createDiffReview } from '../diff-review.ts';
import { createTextDiffView } from '../diff-view.ts';

export interface LektorProposal {
  /** What the text is called. */
  title: string;
  /** The text as it stands. */
  current: string;
  /** What the proofreader would make of it. */
  proposed: string;
}

export interface LektorHandlers {
  /** The text as he left it here, to become the active text. */
  onApply: (text: string) => void;
  /** He left without taking anything. */
  onClose: () => void;
}

/**
 * What a proofreader proposes for a text, for him to look over.
 *
 * Everything counts as accepted unless he steps in: this is not a queue to work
 * through, and the main button takes whatever is on the page. He is free to change
 * one thing and stop.
 */
export function openLektorDialog(
  container: HTMLDialogElement,
  { title, current, proposed }: LektorProposal,
  language: Language,
  handlers: LektorHandlers,
): () => void {
  const words = strings(language);
  const pieces = mergeCloseChanges(separateTidying(diffTexts(current, proposed)));
  const hasAnything = pieces.some((piece) => piece.kind !== 'same');
  const large = pieces.filter((piece) => piece.kind === 'change').length;
  const small = pieces.filter((piece) => piece.kind === 'tidy').length;

  const preview = document.createElement('div');
  preview.className = 'review-preview';

  const review = createDiffReview(pieces, redraw);

  function viewOfDiff(): HTMLElement {
    const column = document.createElement('div');
    column.className = 'review-body lektor-body';

    const about = document.createElement('p');
    about.className = 'review-note-aside';
    about.textContent = `Precrtano je tvoj stari tekst, zeleno je predlog. Veće promene: ${large}, sitne popravke: ${small}.`;

    column.append(
      about,
      createTextDiffView(
        review.piecesNow(),
        { previous: words.changePrevious, next: words.changeNext, at: words.changeAt },
        { showTidied: true, editing: review.editing() },
      ),
    );
    return column;
  }

  /** Drawn again in the same place: he is looking at something, and it should not jump. */
  function redraw(): void {
    const before = preview.querySelector('.review-text')?.scrollTop ?? 0;
    preview.replaceChildren(viewOfDiff());
    queueMicrotask(() => {
      const box = preview.querySelector('.review-text');
      if (box !== null) box.scrollTop = before;
    });
  }

  function nothingToSay(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'review-text review-text-empty';
    box.textContent = 'Lektor nema šta da popravi u ovom tekstu.';
    return box;
  }

  const panel = document.createElement('div');
  panel.className = 'panel review-panel lektor-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const stacked = document.createElement('div');
  stacked.className = 'review-heading';
  const note = document.createElement('p');
  note.className = 'review-note';
  note.textContent = hasAnything
    ? 'Pregledaj predloge ispravki u tekstu ispod. Ako ti nešto ne odgovara, pređi mišem preko toga i promeni.'
    : 'Tekst je pregledan.';
  stacked.append(titleOf({ mark: 'lektor', label: 'AI Lektor ispravke', name: title }), note);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'close';
  dismiss.title = words.close;
  dismiss.setAttribute('aria-label', words.close);
  dismiss.append(icon('close'));
  dismiss.addEventListener('click', handlers.onClose);

  const header = document.createElement('header');
  header.append(stacked, dismiss);

  const body = document.createElement('div');
  body.className = 'review-panes';
  body.append(preview);

  const footer = document.createElement('footer');
  if (hasAnything) {
    const says = document.createElement('p');
    says.className = 'footer-note';
    for (const line of [words.versionRestoreNote, words.versionRestoreKept]) {
      const one = document.createElement('span');
      one.textContent = line;
      says.append(one);
    }

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'keep';
    apply.textContent = 'Unesi izmene u tekst';
    apply.addEventListener('click', () => handlers.onApply(review.textNow()));
    footer.append(says, apply);
  }

  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = words.close;
  done.addEventListener('click', handlers.onClose);
  footer.append(done);

  panel.append(header, body, footer);

  const modal = showAsModal(container, panel, handlers.onClose);
  if (hasAnything) redraw();
  else preview.replaceChildren(nothingToSay());

  return modal.close;
}
