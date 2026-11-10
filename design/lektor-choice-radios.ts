/*
  The free or paid choice, one piece drawn the same in the panel's first step and in the
  corrections window: it is one setting, so it looks like one wherever it is changed. With it the
  tick box for a slow free one and the paid account's balance, which go wherever the choice goes.
*/
import { keys } from './lektor-keys-prototype.ts';
import { type Choice, LOW_BALANCE_USD, type Work, balanceLine, button, el, markOf, radio, state, tierName } from './lektor-prototype-pieces.ts';

/** How long a free request may wait before a ticked one goes to paid Flash, as he is told it. */
export const FREE_LIMIT_WORDS = '2 minuta';

/** The tick box's state, kept by whoever shows it: the panel for the utisak, the window for corrections. */
export interface PaidIfSlow {
  isTicked: boolean;
  tick: (isTicked: boolean) => void;
}

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
  /**
   * What the Lektor is to do, which says which paid one it is: Plaćeni „Flash” where it is the same
   * writer as the free one, faster; Plaćeni „Opus” where it is another, better one (Danilo, 2026-11-10).
   */
  what: Work;
  /** The tick box for a slow free one, under Besplatni. */
  paidIfSlow: PaidIfSlow;
}

/**
 * The tick box starts ticked if there is a paid key and the account holds at least $1 (Danilo,
 * 2026-11-10): a courtesy on days Google's free queue is long, for a cent or two on the utisak and
 * about 10 on a correction. Set afresh each time the utisak or the window is opened; not with under
 * $1, and not when the balance can't be read, since then it isn't known to be safe.
 */
export function paidIfSlowByDefault(): boolean {
  return keys.saved.paid && state.balance !== null && state.balance >= LOW_BALANCE_USD;
}

/**
 * Asked before sending, so a slow or busy free one can be handed to paid Flash without a question
 * minutes in; ticking it is his own choice to pay, which makes acting on it later fair. Its mark and
 * name say who and that it costs; the grey line only when, since "spor" alone leaves that to his guess.
 */
export function paidIfSlowBox(paidIfSlow: PaidIfSlow, isDisabled: boolean): HTMLElement {
  const box = el('label', 'lektor-preset lektor-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = paidIfSlow.isTicked;
  input.disabled = isDisabled;
  input.addEventListener('change', () => paidIfSlow.tick(input.checked));
  const words = el('span', 'lektor-check-words');
  words.append(
    // His own word, "spor", rather than ours of a queue that won't start; the name after "lektoru", as Serbian sets a name.
    el('span', '', 'Ako je spor, pošalji plaćenom lektoru „Flash”'),
    el('span', 'lektor-check-why', `Posle ${FREE_LIMIT_WORDS} čekanja.`),
  );
  box.append(input, markOf('flash'), words);
  if (isDisabled) box.classList.add('lektor-preset-unavailable');
  return box;
}

/** The balance, apart from the rows, since it is no one row's; only with a paid key, where there is an account to read. */
export function paidBalance(): HTMLElement[] {
  return keys.saved.paid ? balanceLine() : [];
}

/** A choice whose key hasn't been entered is greyed, with the reason on hovering, as in the app. */
function levelOption(choice: Choice, actions: LektorChoiceActions): HTMLElement {
  const option = radio(actions.group, tierName(choice, actions.what), (actions.chosen ?? state.choice) === choice, () => actions.choose(choice), choice, actions.what);
  if (actions.better?.choice === choice) option.append(el('span', 'lektor-recommended', actions.better.why));
  const input = option.querySelector('input');
  if (input !== null) input.disabled = actions.isLocked === true || !keys.saved[choice];
  if (keys.saved[choice]) return option;
  option.classList.add('lektor-preset-unavailable');
  option.title = 'Nije unet API ključ.';
  return option;
}

/**
 * Under Besplatni, set in under its name; only with both keys, since it hands one to the other.
 * Greyed, not hidden, while Plaćeni is chosen, so nothing moves on switching.
 */
function slowBoxUnderFree(actions: LektorChoiceActions): HTMLElement[] {
  if (!keys.saved.free || !keys.saved.paid) return [];
  const isPaidChosen = (actions.chosen ?? state.choice) === 'paid';
  const box = paidIfSlowBox(actions.paidIfSlow, isPaidChosen || actions.isLocked === true);
  box.classList.add('lektor-check-nested');
  return [box];
}

/**
 * The heading, with the way to the keys at its right if wanted: the keys decide what can be
 * chosen, and there it leaves the choices' rows their full width. Then the two choices, the tick
 * box under the free one, and the balance under them all.
 */
export function lektorChoice(actions: LektorChoiceActions): HTMLElement[] {
  const options = el('div', 'lektor-choice-options');
  options.append(levelOption('free', actions), ...slowBoxUnderFree(actions), levelOption('paid', actions));
  const heading = el('p', 'lektor-heading', 'Izaberi AI Lektora:');
  const balance = paidBalance();
  if (actions.openKeys === undefined) return [heading, options, ...balance];
  const row = el('div', 'lektor-choice-with-keys');
  row.append(heading, button('API ključevi', actions.openKeys, 'lektor-again'));
  return [row, options, ...balance];
}
