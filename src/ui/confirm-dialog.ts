import { type Language, strings } from '../language/wording.ts';

/**
 * What he is being asked, and what happens either way.
 *
 * The title is the thing itself — the text's own name — rather than a question
 * about it. He has to know which text this is about before the answer means
 * anything, and a name he recognises does that faster than a sentence with the
 * name buried in it.
 */
export interface Confirmation {
  title: string;
  body: string;
  /** The affirmative, named for what it does. Never "U redu". */
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks him something over the top of everything else, and hands back the way
 * to take it down again.
 *
 * Modal on purpose: the question is about the text he is looking at, so being
 * able to edit it while deciding would mean answering about something that had
 * since changed.
 */
export function openConfirmDialog(
  container: HTMLElement,
  confirmation: Confirmation,
  language: Language,
): () => void {
  const words = strings(language);

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') confirmation.onCancel();
  }

  const close = (): void => {
    container.hidden = true;
    container.replaceChildren();
    document.removeEventListener('keydown', onKey);
  };

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = confirmation.title;
  header.append(title);

  const body = document.createElement('p');
  body.className = 'confirm-body';
  body.textContent = confirmation.body;

  const footer = document.createElement('footer');
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'keep';
  yes.textContent = confirmation.confirm;
  yes.addEventListener('click', confirmation.onConfirm);

  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = words.cancel;
  no.addEventListener('click', confirmation.onCancel);

  footer.append(yes, no);
  panel.append(header, body, footer);
  container.replaceChildren(panel);
  container.hidden = false;

  // No click-outside-to-close, same as the appearance panel: a stray click
  // should never be an answer to a question he was still reading.
  document.addEventListener('keydown', onKey);
  yes.focus();

  return close;
}
