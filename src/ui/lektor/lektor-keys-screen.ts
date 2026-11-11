import { icon } from '../icons.ts';
import { markOf } from './lektor-marks.ts';
import { button, el, type LektorWords, MAIN_ACTION, type ProblemParts, problemBox } from './lektor-pieces.ts';
import type { Choice } from './lektor-service.ts';

/*
  The keys screen (spec §4): the keys named after the choice they open, with the company in
  brackets; a saved key never shown again, its box saying "Sačuvan"; under a working key "✓ Radi",
  and for the paid one the balance that proves it. A dead key's box asks for a paste instead, under
  "Ovaj ključ više ne radi. Zalepi novi." Nazad at the left, Sačuvaj at the right.
*/

/** What has become of a key pasted into its box. */
export type KeyNote = 'checking' | 'refused' | 'offline' | 'unavailable' | null;

export interface KeysScreenState {
  drafts: Record<Choice, string>;
  notes: Record<Choice, KeyNote>;
  /** What each service said about a refused key, to show in small grey. */
  serviceSaid: Record<Choice, string>;
  hasKey: Readonly<Record<Choice, boolean>>;
  dead: Readonly<Record<Choice, boolean>>;
  balance: number | null;
}

export interface KeysScreen {
  content: HTMLElement[];
  main: HTMLButtonElement;
  /** None on the first run, with no keys at all: there is nothing to go back to. */
  back: HTMLButtonElement | null;
}

/** Under a saved key, that it works, and for paid the balance that proves it; or that it no longer does. */
function savedLine(words: LektorWords, parts: ProblemParts, state: KeysScreenState, which: Choice): HTMLElement[] {
  if (state.notes[which] !== null || !state.hasKey[which]) return [];
  if (state.dead[which]) return [problemBox(parts, words.keyDeadHere)];
  const balance = which === 'paid' && state.balance !== null ? words.keyBalance(words.dollars(state.balance)) : '';
  return [el('p', 'lektor-key-state', `${words.keyWorks}${balance}`)];
}

function noteLine(words: LektorWords, parts: ProblemParts, state: KeysScreenState, which: Choice): HTMLElement[] {
  const note = state.notes[which];
  if (note === null) return [];
  if (note === 'checking') return [el('p', 'lektor-reading', words.keyChecking)];
  return [problemBox(parts, words.keyNotes[note], '', state.serviceSaid[which])];
}

function keyField(words: LektorWords, parts: ProblemParts, state: KeysScreenState, which: Choice, save: () => void): HTMLElement[] {
  const label = el('label', 'lektor-label lektor-key-label');
  label.append(markOf(which === 'free' ? 'free' : 'paid-flash'), document.createTextNode(words.keyNames[which]));
  const box = el('input', 'lektor-key');
  box.type = 'text';
  box.autocomplete = 'off';
  box.spellcheck = false;
  box.value = state.drafts[which];
  box.disabled = state.notes.free === 'checking' || state.notes.paid === 'checking';
  box.setAttribute('aria-label', words.keyNames[which]);
  // The key itself is never shown again; a dead one's box asks for a paste, as an empty one does.
  box.placeholder = state.hasKey[which] && !state.dead[which] ? words.keySaved : words.keyPastePlace;
  box.addEventListener('input', () => {
    state.drafts[which] = box.value;
  });
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
  });
  return [label, box, ...savedLine(words, parts, state, which), ...noteLine(words, parts, state, which)];
}

export function keysScreen(words: LektorWords, parts: ProblemParts, state: KeysScreenState, save: () => void, goBack: (() => void) | null): KeysScreen {
  const isChecking = state.notes.free === 'checking' || state.notes.paid === 'checking';
  const saveButton = button(words.save, save, MAIN_ACTION);
  saveButton.disabled = isChecking;
  let back: HTMLButtonElement | null = null;
  if (goBack !== null) {
    back = button('', goBack, 'status-action lektor-side-back');
    back.append(icon('back'), el('span', '', words.back));
  }
  return {
    content: [el('p', 'lektor-line', words.keyIntro), ...keyField(words, parts, state, 'free', save), ...keyField(words, parts, state, 'paid', save)],
    main: saveButton,
    back,
  };
}
