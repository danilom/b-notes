/*
  The free or paid choice, one piece drawn the same in the panel's first step and in the
  corrections window: it is one setting, so it looks like one wherever it is changed.
*/
import { keys } from './lektor-keys-prototype.ts';
import { type Choice, balanceLine, button, el, radio, state } from './lektor-prototype-pieces.ts';

export interface LektorChoiceActions {
  /** The radios' group: the panel's copy stays in the page behind the window, and each needs its own. */
  group: string;
  choose: (choice: Choice) => void;
  /** "API ključevi", where the keys are entered: on the panel's first step only, not in the window. */
  openKeys?: () => void;
  /** While a request runs nothing here can change. */
  isLocked?: boolean;
  /** Which is chosen, where it isn't the panel's choice: in the window each kind has its own. */
  chosen?: Choice;
  /**
   * Where one choice is better for what is being done: which, and in a word why, after its name.
   * The why rather than "preporučeno", which reads as selling, not advice.
   */
  better?: { choice: Choice; why: string };
}

/**
 * The balance is the paid Lektor's money, so it is part of Plaćeni's row: its hover covers it and
 * clicking it picks Plaćeni. Shown under either choice, so nothing moves on switching; not without
 * a paid key, where there is no account to read.
 */
function paidBalance(): HTMLElement[] {
  return keys.saved.paid ? balanceLine() : [];
}

/** A choice whose key hasn't been entered is greyed, with the reason on hovering, as in the app. */
function levelOption(choice: Choice, name: string, actions: LektorChoiceActions): HTMLElement {
  const option = radio(actions.group, name, (actions.chosen ?? state.choice) === choice, () => actions.choose(choice), choice);
  if (actions.better?.choice === choice) option.append(el('span', 'lektor-recommended', actions.better.why));
  if (choice === 'paid') option.append(...paidBalance());
  const input = option.querySelector('input');
  if (input !== null) input.disabled = actions.isLocked === true || !keys.saved[choice];
  if (keys.saved[choice]) return option;
  option.classList.add('lektor-preset-unavailable');
  option.title = 'Nije unet API ključ.';
  return option;
}

/**
 * The heading, with the way to the keys at its right if wanted: the keys decide what can be
 * chosen, and there it leaves the choices' rows their full width. Then the two choices.
 */
export function lektorChoice(actions: LektorChoiceActions): HTMLElement[] {
  const options = el('div', 'lektor-choice-options');
  options.append(levelOption('free', 'Besplatni', actions), levelOption('paid', 'Plaćeni', actions));
  const heading = el('p', 'lektor-heading', 'Izaberi AI Lektora:');
  if (actions.openKeys === undefined) return [heading, options];
  const row = el('div', 'lektor-choice-with-keys');
  row.append(heading, button('API ključevi', actions.openKeys, 'lektor-again'));
  return [row, options];
}
