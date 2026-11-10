/*
  The keys screen as it could be with OpenRouter for paid: the keys named after the choice they
  open (Besplatni, Plaćeni) with the company in brackets, since the key is that company's; a saved
  key saying so in words rather than as grey text in an empty box; and for the paid key the
  balance, since reading it is what proves the key works. "Dovoljan je jedan": one key is enough,
  as it already is in the app, and now he is told.
*/
import { icon } from '../src/ui/icons.ts';
import { type Choice, button, choiceMark, dollars, el, lineIcon, problem, state } from './lektor-prototype-pieces.ts';

/** What the check of a pasted key answers in this prototype, set by its switch. */
export type KeyCheck = 'works' | 'refused' | 'offline';

type KeyNote = 'checking' | 'refused' | 'offline' | null;

interface KeysState {
  saved: Record<Choice, boolean>;
  /**
   * A saved key the company now refuses (revoked, expired): OpenRouter's 401, Google's 400/403 for a
   * bad key, never its 429 or 503. Found when the panel opens if it can be (OpenRouter's balance
   * lookup uses the key; Google has a free call listing its models), else on sending.
   */
  dead: Record<Choice, boolean>;
  drafts: Record<Choice, string>;
  notes: Record<Choice, KeyNote>;
  check: KeyCheck;
}

export const keys: KeysState = {
  saved: { free: true, paid: true },
  dead: { free: false, paid: false },
  drafts: { free: '', paid: '' },
  notes: { free: null, paid: null },
  check: 'works',
};

const KEY_NAMES: Readonly<Record<Choice, string>> = { free: 'Besplatni (Google)', paid: 'Plaćeni (OpenRouter)' };
/** Long enough to see the check, short enough not to wait for. */
const PRETEND_CHECK_MS = 1200;

export const isAnyKeyDead = (): boolean => keys.dead.free || keys.dead.paid;

/** Lucide's key: the dead key's own mark, so it reads as a matter of the key, not as the Lektor being busy or broken. */
const KEY_PATHS = ['m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4', 'm21 2-9.6 9.6', 'M7.5 10a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11'];

/**
 * A key that stopped working, said once for the whole feature (Danilo, 2026-11-10): not one Lektor
 * greyed and the other left on, which reads as flaky; the problem, and what to do, which is his to
 * do (or to ask about): a new key, entered under API ključevi. No person named.
 */
export function deadKeyProblem(): HTMLElement {
  const box = el('div', 'lektor-problem lektor-dead-key');
  box.setAttribute('role', 'alert');
  const which = keys.dead.free && keys.dead.paid ? 'Ključevi za AI Lektora više ne rade.' : `Ključ za ${keys.dead.free ? 'besplatnog' : 'plaćenog'} lektora više ne radi.`;
  const lines = el('div', 'lektor-problem-words');
  lines.append(el('p', 'lektor-line', which), el('p', 'lektor-where', 'Treba nabaviti novi ključ i uneti ga pod „API ključevi”.'));
  box.append(lineIcon(KEY_PATHS, ['lektor-dead-key-mark']), lines);
  return box;
}

/** Under a saved key, that it works, and for paid the balance that proves it; "Sačuvan" is in the box. */
function savedLine(which: Choice): HTMLElement[] {
  if (keys.saved[which] && keys.dead[which] && keys.notes[which] === null) return [problem('Ovaj ključ više ne radi. Zalepi novi.')];
  if (!keys.saved[which] || keys.notes[which] !== null) return [];
  const balance = which === 'paid' && state.balance !== null ? ` · na računu ${dollars(state.balance)}` : '';
  return [el('p', 'lektor-key-state', `✓ Radi${balance}`)];
}

function noteLine(which: Choice): HTMLElement[] {
  const note = keys.notes[which];
  if (note === 'checking') return [el('p', 'lektor-reading', 'Proveravam API ključ…')];
  if (note === 'refused') return [problem('API ključ ne radi. Da li je zalepljen ceo?')];
  if (note === 'offline') return [problem('Internet ne radi, pa ključ ne može da se proveri.')];
  return [];
}

function keyField(which: Choice, isChecking: boolean, save: () => void): HTMLElement[] {
  const label = el('label', 'lektor-label lektor-key-label');
  label.append(choiceMark(which), document.createTextNode(KEY_NAMES[which]));
  const box = el('input', 'lektor-key');
  box.type = 'text';
  box.autocomplete = 'off';
  box.spellcheck = false;
  box.value = keys.drafts[which];
  box.disabled = isChecking;
  // The key itself is never shown again: the box says only whether there is one, and pasting over it replaces it.
  box.placeholder = keys.saved[which] ? 'Sačuvan' : 'Zalepi ključ ovde';
  box.addEventListener('input', () => {
    keys.drafts[which] = box.value;
  });
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
  });
  return [label, box, ...savedLine(which), ...noteLine(which)];
}

/**
 * Checks what was pasted, as the app does on saving. Nothing pasted is simply going back. On
 * success the app goes back to the first step and says the key works, as it does now.
 */
export function saveKeys(redraw: () => void, backToStart: () => void, savedAndBack: () => void): void {
  const pasted = (['free', 'paid'] as const).filter((which) => keys.drafts[which].trim() !== '');
  if (pasted.length === 0) {
    backToStart();
    return;
  }
  for (const which of pasted) keys.notes[which] = 'checking';
  redraw();
  window.setTimeout(() => {
    for (const which of pasted) {
      keys.notes[which] = keys.check === 'works' ? null : keys.check;
      if (keys.check === 'works') {
        keys.saved[which] = true;
        keys.dead[which] = false;
        keys.drafts[which] = '';
      }
    }
    if (keys.check === 'works') savedAndBack();
    else redraw();
  }, PRETEND_CHECK_MS);
}

/** @param savedAndBack Back to the first step after a key was saved and works, which the first step then says. */
/**
 * What scrolls, and for the strip at the panel's foot "Sačuvaj" on the right, as every step has
 * its main button, and "Nazad" on the left: a step back, so read left to right like the steps.
 * Not the order of the app's windows, Sačuvaj then Otkaži, since this closes nothing.
 */
export function keysScreen(
  redraw: () => void,
  backToStart: () => void,
  savedAndBack: () => void,
): { content: HTMLElement[]; main: HTMLButtonElement; back: HTMLButtonElement } {
  const isChecking = keys.notes.free === 'checking' || keys.notes.paid === 'checking';
  const save = (): void => saveKeys(redraw, backToStart, savedAndBack);
  // A full button, as tall as Sačuvaj beside it; plain, so the way out doesn't compete with the coloured one.
  const leave = button('', backToStart, 'status-action lektor-side-back');
  leave.append(icon('back'), el('span', '', 'Nazad'));
  const saveButton = button('Sačuvaj', save, 'status-action lektor-main-action');
  saveButton.disabled = isChecking;
  return {
    content: [
      el('p', 'lektor-line', 'Za rad AI Lektora potreban je API ključ. Ako ti ga je neko poslao, zalepi ga ovde. Dovoljan je jedan.'),
      ...keyField('free', isChecking, save),
      ...keyField('paid', isChecking, save),
    ],
    main: saveButton,
    back: leave,
  };
}
