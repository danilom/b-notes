import type { strings } from '../../language/wording.ts';
import type { Log } from '../../platform/logging.ts';
import { icon } from '../icons.ts';
import { flashToast } from '../toast.ts';
import { LOW_BALANCE_USD } from './lektor-balance.ts';
import { elapsedLine } from './lektor-elapsed-time.ts';
import { deadKeyMark, markOf } from './lektor-marks.ts';
import type { Choice, Work } from './lektor-service.ts';
import { FREE_STAND_IN, fallsBack, freeModelsFor, PAID_FLASH, paidModelFor, type Tier } from './lektor-tiers.ts';

/* What the Lektor's panel and its corrections window both draw, piece by piece. */

export type LektorWords = ReturnType<typeof strings>['lektor'];

/** The one button that takes him on to the next step, solid blue. */
export const MAIN_ACTION = 'status-action lektor-main-action';

/** Past this, a service's own words are no longer something to read out over the telephone. */
const LONGEST_SERVICE_WORDS = 300;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  if (className !== '') made.className = className;
  if (text !== '') made.textContent = text;
  return made;
}

export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const made = el('button', className, label);
  made.type = 'button';
  made.addEventListener('click', onClick);
  return made;
}

/** The Lektor that does this work if sent there: free, or the work's paid one. */
export const tierFor = (choice: Choice, work: Work): Tier => (choice === 'free' ? 'free' : paidModelFor(work) === PAID_FLASH ? 'paid-flash' : 'paid-opus');

/** Who did or does it: "AI Lektor:", the mark and the name, as the app's service line has them. */
export function serviceLineOf(words: LektorWords, tier: Tier): HTMLElement {
  const line = el('p', 'lektor-service-line');
  line.append(el('span', '', words.serviceLabel), ' ', markOf(tier), el('span', '', words.names[tier]));
  return line;
}

/**
 * Under the choice, on a line of its own: the account is both paid Lektors', and the tick box spends
 * from it too, so it belongs to no one row. Nothing when it can't be read: a failed lookup is no
 * trouble with his money (spec §9). Red, with "(malo)", under a dollar: the only warning about money.
 */
export function balanceLine(words: LektorWords, dollars: number | null): HTMLElement[] {
  if (dollars === null) return [];
  const isLow = dollars < LOW_BALANCE_USD;
  return [el('p', `lektor-balance${isLow ? ' lektor-balance-low' : ''}`, `${words.balance(words.dollars(dollars))}${isLow ? words.balanceLow : ''}`)];
}

/**
 * What hovering a sending button tells: who gets the text and which model, one to a line. With the
 * tick box ticked, that a free one waiting too long goes to OpenRouter after all: the one place the
 * company is said, so it must be said whole. No cost: it can't be known before the run.
 */
export function sendTooltip(words: LektorWords, choice: Choice, work: Work, mayHandOver: boolean): string {
  if (choice === 'paid') return [words.sentTo.openrouter, words.model(paidModelFor(work))].join('\n');
  const [first = ''] = freeModelsFor(work);
  const standIn = fallsBack(work) ? words.standIn(FREE_STAND_IN) : '';
  const lines = [words.sentTo.google, `${words.model(first)}${standIn}`];
  if (mayHandOver) lines.push(words.handOverTo(PAID_FLASH));
  return lines.join('\n');
}

/** A button that sends: its words, the mark of where it goes, and the app's arrow. */
export function sendButton(label: string, tier: Tier, onClick: () => void, className: string, tooltip: string): HTMLButtonElement {
  const made = button(label, onClick, `${className} lektor-sends`);
  made.title = tooltip;
  made.append(markOf(tier), icon('move-out'));
  return made;
}

/** A turn of the spinner is 1 s and its pulse, where motion is spared, 2 s: one delay modulo this keeps both in step. */
const SPINNER_CYCLE_MS = 2000;

/**
 * The turning mark of something under way, in step with the clock rather than with when it was
 * drawn. The corrections wait draws its stages afresh each time the writing grows, many times a
 * second, and a mark that started its turn from the top each time only ever showed a few degrees.
 */
export function turningMark(className: string): HTMLElement {
  const mark = el('span', `${className} lektor-reading`);
  mark.style.setProperty('--turned', `${-(performance.now() % SPINNER_CYCLE_MS)}ms`);
  return mark;
}

/**
 * A way back, its arrow before its words and lined up on their middle, wherever it sits. Every
 * way back is made here: built by hand in four places, one of them came out with its arrow low.
 */
export function arrowBackButton(label: string, onBack: () => void, className: string): HTMLButtonElement {
  const back = button('', onBack, `${className} lektor-arrow-back`);
  back.append(icon('back'), el('span', '', label));
  return back;
}

/** A way back at the strip's left: its arrow and its words, plain beside the coloured way on. */
export function backButton(label: string, onBack: () => void): HTMLButtonElement {
  return arrowBackButton(label, onBack, 'status-action lektor-side-back');
}

export interface ProblemParts {
  words: () => LektorWords;
  copyToClipboard: (text: string) => Promise<void>;
  toast: HTMLDivElement;
  log: Log;
}

/** For sending on to whoever helps him. The whole of it, however much of it is shown. */
function copyMessageButton(parts: ProblemParts, message: string): HTMLButtonElement {
  const words = parts.words();
  const copy = button(words.copyMessage, () => {
    parts.copyToClipboard(message).then(
      () => {
        // A toast can't be seen over a dialog, which sits above everything else on the page; the button says so there.
        if (copy.closest('dialog') === null) flashToast(parts.toast, words.copied, words.copiedHow);
        else copy.textContent = words.copiedInDialog;
      },
      (error: unknown) => {
        parts.log.warn('The Lektor message could not be copied', { error: String(error) });
        copy.textContent = words.notCopied;
      },
    );
  }, 'lektor-copy-message');
  return copy;
}

/**
 * Something didn't work: recognisable by its icon before a word of it is read, then what can be
 * done. A remote service's own words go beneath, small and grey, with "Kopiraj poruku": he can read
 * them to whoever helps him, who has no other way of knowing what a stranger's server said.
 */
export function problemBox(parts: ProblemParts, sentence: string, wayOn = '', serviceSaid = ''): HTMLElement {
  const box = el('div', 'lektor-problem');
  box.setAttribute('role', 'alert');
  const lines = el('div', 'lektor-problem-words');
  lines.append(el('p', 'lektor-line', sentence));
  if (wayOn !== '') lines.append(el('p', 'lektor-where', wayOn));
  if (serviceSaid !== '') {
    const said = el('p', 'lektor-service-said', serviceSaid.slice(0, LONGEST_SERVICE_WORDS));
    said.lang = 'en';
    lines.append(said, copyMessageButton(parts, [sentence, wayOn, serviceSaid].filter((line) => line !== '').join('\n')));
  }
  box.append(icon('problem'), lines);
  return box;
}

/**
 * A key that stopped working, on a screen of its own (spec §4): its mark big and red, and very
 * short, since what to do is ask for help. Which key isn't said here: the keys screen says it,
 * beside the key, for whoever helps him.
 */
export function deadKeyNoticeOf(words: LektorWords): HTMLElement {
  const notice = el('div', 'lektor-dead-key');
  notice.setAttribute('role', 'alert');
  notice.append(deadKeyMark(), el('p', 'lektor-dead-key-title', words.deadKey), el('p', '', words.callForHelp));
  return notice;
}

/** His wait so far, from when he sent it, by the steady clock. */
export function elapsedWords(sinceMs: number, nowMs: number, elapsed: (minutes: number, seconds: number) => string): string {
  return elapsedLine((nowMs - sinceMs) / 1000, elapsed);
}
