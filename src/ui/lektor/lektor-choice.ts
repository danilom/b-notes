import { markOf } from './lektor-marks.ts';
import { balanceLine, el, type LektorWords, tierFor } from './lektor-pieces.ts';
import type { Choice, Work } from './lektor-service.ts';

/*
  The free or paid choice (spec §5, §6, §8), one piece drawn the same in the panel's step 2 and in
  the corrections window's rework kinds: it is one kind of setting, so it looks like one wherever it
  is changed. With it the tick box for a slow free one and the paid account's balance.
*/

/** The tick box's state, kept by whoever shows it: the panel for the utisak, the window for corrections. */
export interface PaidIfSlow {
  isTicked: boolean;
  tick: (isTicked: boolean) => void;
}

export interface ChoiceSetup {
  words: LektorWords;
  /** The radios' group: the panel's copy stays in the page behind the window, and each needs its own. */
  group: string;
  work: Work;
  chosen: Choice;
  choose: (choice: Choice) => void;
  /** After a choice's name, in a word, why one might pick it. */
  why: Partial<Record<Choice, string>>;
  hasKey: Readonly<Record<Choice, boolean>>;
  paidIfSlow: PaidIfSlow;
  /** What is left on the paid account; null when it can't be read. */
  balance: number | null;
  /** While a request runs nothing here can change. */
  isLocked: boolean;
}

/**
 * Asked before sending, so a slow or busy free one can be handed to paid Flash without a question
 * minutes in; ticking it is his own choice to pay. Its coin and name say who and that it costs.
 */
export function paidIfSlowBox(words: LektorWords, paidIfSlow: PaidIfSlow, isDisabled: boolean): HTMLElement {
  const box = el('label', 'lektor-preset lektor-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = paidIfSlow.isTicked;
  input.disabled = isDisabled;
  input.addEventListener('change', () => paidIfSlow.tick(input.checked));
  const sentence = el('span', 'lektor-check-words');
  sentence.append(el('span', '', words.paidIfSlow));
  box.append(input, markOf('paid-flash'), sentence);
  if (isDisabled) box.classList.add('lektor-preset-unavailable');
  return box;
}

/** A choice whose key hasn't been entered is greyed, with the reason on hovering. */
function levelOption(choice: Choice, setup: ChoiceSetup): HTMLElement {
  const tier = tierFor(choice, setup.work);
  const option = el('label', 'lektor-preset');
  const input = el('input');
  input.type = 'radio';
  input.name = setup.group;
  input.checked = setup.chosen === choice;
  input.disabled = setup.isLocked || !setup.hasKey[choice];
  input.addEventListener('change', () => setup.choose(choice));
  const name = el('span', '', setup.words.names[tier]);
  // In the name's own span, so the smaller grey sits on the name's baseline rather than centred beside it.
  const why = setup.why[choice];
  if (why !== undefined) name.append(' ', el('span', 'lektor-recommended', why));
  option.append(input, markOf(tier), name);
  if (setup.hasKey[choice]) return option;
  option.classList.add('lektor-preset-unavailable');
  option.title = setup.words.levelWithoutKey;
  return option;
}

/**
 * Under Besplatni, set in under its name; only with both keys, since it hands one to the other.
 * Greyed, not hidden, while Plaćeni is chosen, so nothing moves on switching.
 */
function slowBoxUnderFree(setup: ChoiceSetup): HTMLElement[] {
  if (!setup.hasKey.free || !setup.hasKey.paid) return [];
  const box = paidIfSlowBox(setup.words, setup.paidIfSlow, setup.chosen === 'paid' || setup.isLocked);
  box.classList.add('lektor-check-nested');
  return [box];
}

/** The heading, the two choices with the tick box under the free one, and the balance under them all. */
export function lektorChoice(setup: ChoiceSetup): HTMLElement[] {
  const options = el('div', 'lektor-choice-options');
  options.append(levelOption('free', setup), ...slowBoxUnderFree(setup), levelOption('paid', setup));
  return [el('p', 'lektor-heading', setup.words.chooseLektor), options, ...(setup.hasKey.paid ? balanceLine(setup.words, setup.balance) : [])];
}
