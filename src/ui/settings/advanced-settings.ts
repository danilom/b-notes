import type { FileSystem } from '../../platform/file-system.ts';

/**
 * The knobs that are not his.
 *
 * Kept apart from `settings.json` and `screen.json`, which hold things he has
 * an opinion about and can judge by looking at them. These he cannot: he has no
 * view on how long a card should wait before it appears, and a wrong value here
 * makes the app behave oddly in a way he would never connect to a number he set
 * once. They belong with the rest of the advanced panel — English, behind a
 * word you have to type, addressed to whoever set the machine up.
 *
 * Per machine, in `userData`, because that is where the person who would change
 * them is sitting when they do.
 */
const FILE = 'advanced.json';

export interface AdvancedSettings {
  /**
   * How long Ctrl is held before the card of shortcuts appears.
   *
   * Long enough that anyone who knows the shortcut never sees it, short enough
   * that hesitating summons it. The right number is the one that clears his
   * fastest deliberate `Ctrl+C` and stays under his patience, which is a thing
   * to watch rather than a thing to reason about — so it is here to be changed
   * after watching, not guessed at once and buried.
   */
  ctrlCardAfterMs: number;
}

export const DEFAULT_ADVANCED: AdvancedSettings = {
  ctrlCardAfterMs: 400,
};

/** Outside this, the delay is either a mistake or a way to switch the card off. */
const LONGEST_WAIT_MS = 5_000;

/**
 * What the file says, or the defaults.
 *
 * Read off disk, so nothing in it is believed: a hand-edited file is the
 * expected way this one changes, which makes a bad value the expected input
 * rather than the surprising one.
 */
export async function readAdvanced(
  files: FileSystem,
  appFolder: string,
): Promise<AdvancedSettings> {
  let raw: unknown;
  try {
    raw = JSON.parse(await files.read(`${appFolder}/${FILE}`));
  } catch {
    /*
      Not logged, and the one place in this app where that is the whole of the
      answer: the file is absent on every machine until somebody writes it, so
      this is the ordinary path rather than a fault, and a line each start would
      say nothing but "still absent".
    */
    return DEFAULT_ADVANCED;
  }
  return advancedFrom(raw);
}

/** Separated from the reading so the rules can be tested without a disk. */
export function advancedFrom(raw: unknown): AdvancedSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_ADVANCED;
  const wait = (raw as Record<string, unknown>)['ctrlCardAfterMs'];
  if (typeof wait !== 'number' || !Number.isFinite(wait) || wait < 0 || wait > LONGEST_WAIT_MS) {
    return DEFAULT_ADVANCED;
  }
  return { ctrlCardAfterMs: wait };
}
