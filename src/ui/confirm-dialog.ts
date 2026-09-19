import { toSearchable } from '../language/diacritics.ts';
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
  /**
   * A word he has to write out before the affirmative will do anything.
   *
   * For the one action that cannot be undone. Compared folded, so case, stray
   * spaces and the diacritics he may not know how to reach all come out the
   * same — the barrier exists to make him stop and mean it, not to test his
   * typing, and any of the spellings offered will do.
   *
   * `prompt` carries `{}` where each spelling belongs. Extra spellings past the
   * number of slots are still accepted, just not shown: English asks for one
   * word where Serbian shows two ways of writing the same one.
   */
  phrase?: { prompt: string; words: readonly string[] };
  /**
   * Whether the affirmative destroys something.
   *
   * Two effects, both about his hands rather than his eyes: the button is
   * marked as the dangerous one, and it is not what holds the focus, so the
   * reflex of hitting Enter at a dialog cancels rather than confirms.
   */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The sentence, with each spelling marked out where its slot was. */
function sentence(prompt: string, words: readonly string[]): (string | HTMLElement)[] {
  const parts = prompt.split('{}');
  return parts.flatMap((part, at) => {
    const word = words[at];
    if (at === parts.length - 1 || word === undefined) return [part];
    const marked = document.createElement('span');
    marked.className = 'confirm-key';
    marked.textContent = word;
    return [part, marked];
  });
}

/** The box he writes the word into, and the rule for when it counts. */
function phraseFor(
  asked: NonNullable<Confirmation['phrase']>,
  affirmative: HTMLButtonElement,
  onConfirm: () => void,
): { label: HTMLLabelElement; box: HTMLInputElement } {
  const label = document.createElement('label');
  label.className = 'confirm-prompt';

  // The sentence is one thing, the box is the next. Handing the label the
  // fragments loose would make each of them a row of its own, since the label
  // stacks what it is given.
  const said = document.createElement('span');
  said.append(...sentence(asked.prompt, asked.words));
  label.append(said);

  const box = document.createElement('input');
  box.type = 'text';
  box.className = 'confirm-word';
  box.autocomplete = 'off';
  box.spellcheck = false;
  label.append(box);

  const typed = (): string => toSearchable(box.value).trim();
  const written = (): boolean => asked.words.some((word) => typed() === toSearchable(word));
  affirmative.disabled = true;
  box.addEventListener('input', () => {
    affirmative.disabled = !written();
  });
  // Enter only once the word is there, which is the point at which pressing it
  // has stopped being a reflex.
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && written()) onConfirm();
  });

  return { label, box };
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

  /*
    With a word to write out, the box is the only thing here that should hold
    the cursor: he types, and if it has quietly gone somewhere else nothing
    appears and the dialog looks broken. A press anywhere that is not one of the
    answers leaves the cursor where it is rather than taking it away — refused
    on the way down, so it never moves at all, the same way the buttons beside
    his text leave the pen in his hand.
  */
  function keepTheCursorInTheBox(event: MouseEvent): void {
    if (asked === null) return;
    if (event.target instanceof HTMLButtonElement || event.target === asked.box) return;
    event.preventDefault();
  }

  const close = (): void => {
    container.hidden = true;
    container.replaceChildren();
    document.removeEventListener('keydown', onKey);
    container.removeEventListener('mousedown', keepTheCursorInTheBox);
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
  yes.className = confirmation.danger === true ? 'danger' : 'keep';
  yes.textContent = confirmation.confirm;
  yes.addEventListener('click', confirmation.onConfirm);

  const no = document.createElement('button');
  no.type = 'button';
  no.className = confirmation.danger === true ? 'keep' : '';
  no.textContent = words.cancel;
  no.addEventListener('click', confirmation.onCancel);
  footer.append(yes, no);

  const asked =
    confirmation.phrase === undefined
      ? null
      : phraseFor(confirmation.phrase, yes, confirmation.onConfirm);

  panel.append(header, body, ...(asked === null ? [] : [asked.label]), footer);
  container.replaceChildren(panel);
  container.hidden = false;

  // No click-outside-to-close, same as the appearance panel: a stray click
  // should never be an answer to a question he was still reading.
  document.addEventListener('keydown', onKey);
  if (asked !== null) {
    container.addEventListener('mousedown', keepTheCursorInTheBox);
    asked.box.focus();
  } else if (confirmation.danger === true) no.focus();
  else yes.focus();

  return close;
}
