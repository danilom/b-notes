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

/**
 * The app's own answer, used whenever the file does not give one.
 *
 * Eight hundred: long enough that a man who knows the shortcut never sees the
 * card, short enough that hesitating brings it. Found by watching him rather
 * than reasoned about, which is why the file can overrule it.
 */
export const DEFAULT_CTRL_CARD_AFTER_MS = 800;

export interface AdvancedSettings {
  /**
   * How long Ctrl is held before the card of shortcuts appears, or null when
   * the file says nothing and the number above is used.
   *
   * Long enough that anyone who knows the shortcut never sees it, short enough
   * that hesitating summons it. The right number is the one that clears his
   * Not set is its own answer, and not the same as zero: zero means show the
   * card the instant he touches the key, and nothing means leave it to the
   * app. Emptying the box in the panel says the second, so a number pinned
   * once does not outlive every later judgement about the right one.
   */
  ctrlCardAfterMs: number | null;
}

/** The file saying nothing, which is what it says until somebody writes it. */
export const NOTHING_SET: AdvancedSettings = { ctrlCardAfterMs: null };

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
    return NOTHING_SET;
  }
  return advancedFrom(raw);
}

/** Separated from the reading so the rules can be tested without a disk. */
export function advancedFrom(raw: unknown): AdvancedSettings {
  if (typeof raw !== 'object' || raw === null) return NOTHING_SET;
  const wait = (raw as Record<string, unknown>)['ctrlCardAfterMs'];
  if (typeof wait !== 'number' || !Number.isFinite(wait) || wait < 0 || wait > LONGEST_WAIT_MS) {
    return NOTHING_SET;
  }
  return { ctrlCardAfterMs: wait };
}

/**
 * Writes the file back, leaving anything it does not know about alone.
 *
 * Same care the settings file takes: a machine left off for months comes back
 * running an older build, and that build must not strip a key a newer one
 * wrote.
 */
export async function writeAdvanced(
  files: FileSystem,
  appFolder: string,
  settings: AdvancedSettings,
): Promise<void> {
  const at = `${appFolder}/${FILE}`;
  let had: unknown = {};
  try {
    had = JSON.parse(await files.read(at));
  } catch {
    // Absent or unreadable, which is the ordinary state before anyone has
    // changed anything. There is nothing to preserve, so there is nothing to
    // report either.
  }
  const kept: Record<string, unknown> =
    typeof had === 'object' && had !== null ? { ...(had as Record<string, unknown>) } : {};

  // Nothing set is written by taking the key out, not by writing a null: the
  // file should read as one somebody never touched.
  if (settings.ctrlCardAfterMs === null) delete kept['ctrlCardAfterMs'];
  else kept['ctrlCardAfterMs'] = settings.ctrlCardAfterMs;

  await files.write(at, `${JSON.stringify(kept, null, 2)}
`);
}
