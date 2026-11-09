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
  /** "API ključevi": where the keys are entered, which decide what can be chosen. */
  openKeys: () => void;
  /** While a request runs nothing here can change. */
  isLocked?: boolean;
}

/** A choice whose key hasn't been entered is greyed, with the reason on hovering, as in the app. */
function levelOption(choice: Choice, name: string, actions: LektorChoiceActions): HTMLElement {
  const option = radio(actions.group, name, state.choice === choice, () => actions.choose(choice), choice);
  const input = option.querySelector('input');
  if (input !== null) input.disabled = actions.isLocked === true || !keys.saved[choice];
  if (keys.saved[choice]) return option;
  option.classList.add('lektor-preset-unavailable');
  option.title = 'Nije unet API ključ.';
  return option;
}

/** The heading, the two choices with the way to the keys on Besplatni's line, and the balance under them. */
export function lektorChoice(actions: LektorChoiceActions): HTMLElement[] {
  const options = el('div', 'lektor-choice-options');
  options.append(levelOption('free', 'Besplatni', actions), levelOption('paid', 'Plaćeni', actions));
  const toKeys = button('API ključevi', actions.openKeys, 'lektor-again');
  toKeys.disabled = actions.isLocked === true;
  const row = el('div', 'lektor-choice-with-keys');
  row.append(options, toKeys);
  return [el('p', 'lektor-heading', 'Izaberi AI Lektora:'), row, ...balanceLine()];
}
