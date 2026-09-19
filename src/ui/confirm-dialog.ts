import { type Language, strings } from '../language/wording.ts';
import { icon } from './icons.ts';

/**
 * What he is being asked, and what happens either way.
 *
 * The title names the action and the thing it acts on — "Obriši tekst: Ponta" —
 * because with an X in the corner and one word on the button, the header is the
 * only place the whole question is written down. A long title wraps rather than
 * being cut: the name of the text is the one thing here that cannot afford an
 * ellipsis.
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
  const title = document.createElement('h1');
  title.textContent = confirmation.title;

  // The same way out as the appearance panel's, in the same corner and doing
  // the same thing. Two dialogs that dismiss differently is one dialog too many
  // to learn.
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'close';
  dismiss.title = words.close;
  dismiss.setAttribute('aria-label', words.close);
  dismiss.append(icon('close'));
  dismiss.addEventListener('click', confirmation.onCancel);
  header.append(title, dismiss);

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
