/*
  The utisak's wait and failures in the panel, pretended. Plainer than the corrections window's wait
  (Danilo, 2026-11-10): his own text is still in front of him to look at, so the panel shows only the
  app's own "Čita tekst…" with its turning mark, what to expect, and a quiet clock. No stages: on free
  the move from 3.8 to 3.6 happens without a word, since he would not act on it.

  Measured (2026-11-09/10): a free utisak on 3.8 took 3–5½ minutes, nearly all of it queued at Google,
  the work itself a few seconds; 3.6 mostly started at once (5–8 Nov) but once queued 41 s and was then
  refused as busy. Paid (Opus via OpenRouter) took about 18 s.
*/
import { icon } from '../src/ui/icons.ts';
import { times } from './lektor-corrections-window-prototype.ts';
import { keys } from './lektor-keys-prototype.ts';
import { type Choice, type FreeModel, button, choiceMark, el, problem, state } from './lektor-prototype-pieces.ts';

export type CommentFailure = 'busy' | 'no-credit' | 'offline';

interface CommentRun {
  sentTo: Choice;
  startedAt: number;
  failure: CommentFailure | null;
}

export const commentRun: CommentRun = { sentTo: 'free', startedAt: 0, failure: null };

/** What the run tells the panel: it's over and the comment is there, or it failed. */
export interface CommentRunEvents {
  done: (by: Choice) => void;
  failed: () => void;
}

let timers: number[] = [];
let clockTimer: number | undefined;

export function stopCommentRun(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
  window.clearInterval(clockTimer);
}

/** The work once a model has started: a few seconds of thinking and writing; a comment is short. */
function workMs(to: Choice): number {
  // Paid (Opus) thinks longer than free Flash: about 18 s against a few seconds, measured.
  return to === 'paid' ? times().thinkingMs + times().writingStepMs * 1.5 : times().thinkingMs;
}

function fail(failure: CommentFailure, events: CommentRunEvents): void {
  stopCommentRun();
  commentRun.failure = failure;
  events.failed();
}

function askPaid(events: CommentRunEvents): void {
  commentRun.sentTo = 'paid';
  if (state.isOffline) return fail('offline', events);
  if (state.isMoneyOut) return fail('no-credit', events);
  timers.push(window.setTimeout(() => finish('paid', events), workMs('paid')));
}

/**
 * Free: 3.8 first; refused as busy, or still queued at the minute, it moves to 3.6 without a word.
 * 3.6 waits as long as it takes (to the app's 10-minute limit); refused, the utisak has failed as busy.
 */
function askFree(model: FreeModel, events: CommentRunEvents): void {
  commentRun.sentTo = 'free';
  if (state.isOffline) return fail('offline', events);
  const day = state.google[model];
  const isFirst = model === 'gemini-3.8-flash';
  if (day === 'busy') return isFirst ? askFree('gemini-3.6-flash', events) : fail('busy', events);
  const queueMs = day === 'slow' ? times().longQueueMs : times().queueMs;
  if (isFirst && queueMs > times().queueLimitMs) {
    timers.push(window.setTimeout(() => askFree('gemini-3.6-flash', events), times().queueLimitMs));
    return;
  }
  timers.push(window.setTimeout(() => finish('free', events), queueMs + workMs('free')));
}

function finish(by: Choice, events: CommentRunEvents): void {
  stopCommentRun();
  events.done(by);
}

export function startCommentRun(to: Choice, events: CommentRunEvents): void {
  stopCommentRun();
  commentRun.failure = null;
  commentRun.startedAt = performance.now();
  clockTimer = window.setInterval(() => {
    const clock = document.querySelector('.lektor-comment-clock');
    if (clock !== null) clock.textContent = waitedWords();
  }, 1000);
  if (to === 'paid') askPaid(events);
  else askFree('gemini-3.8-flash', events);
}

/** His wait so far, by the steady clock (never Date.now(), which can step back). */
function waitedWords(): string {
  const seconds = Math.floor((performance.now() - commentRun.startedAt) / 1000);
  return seconds < 60 ? `Prošlo je ${seconds} s.` : `Prošlo je ${Math.floor(seconds / 60)} min ${seconds % 60} s.`;
}

/**
 * The app's own wait, with what to expect said for the Lektor he sent it to: on free that a wait of
 * minutes is the queue, not a fault, so he doesn't send it again or close it at the first minute.
 */
export function commentWaiting(textInWords: string): HTMLElement {
  const waiting = el('div', 'lektor-waiting');
  const expect = commentRun.sentTo === 'free' ? 'Besplatni lektor često čeka na red, pa može da potraje nekoliko minuta.' : 'Obično traje pola minuta.';
  waiting.append(
    // Who, what and which text (Danilo, 2026-11-10): "Čita tekst…" alone left the subject for him to
    // supply, and with another text open the panel must say which one it is reading.
    el('p', 'lektor-reading', `AI Lektor čita tekst ${textInWords}…`),
    el('p', '', expect),
    el('p', 'lektor-comment-clock', waitedWords()),
  );
  return waiting;
}

/** The window's words for the same failures, and the same shape: the problem, then the way back. */
export function commentFailure(): HTMLElement {
  if (commentRun.failure === 'no-credit') return problem('Plaćeni iznos je potrošen.', keys.saved.free ? 'Možeš da pošalješ besplatnom lektoru, ili neka se uplati još.' : 'Neka se uplati još.');
  if (commentRun.failure === 'offline') return problem('Internet ne radi, a AI Lektoru je potreban.', 'Kad internet proradi, pošalji ponovo.');
  return problem('Gugl je sada zauzet.', keys.saved.paid ? 'Probaj malo kasnije, ili pošalji plaćenom lektoru.' : 'Probaj malo kasnije.');
}

/** The other Lektor, only where the trouble was the company's and he has its key; as in the window. */
export function commentShortcut(send: (to: Choice) => void): HTMLButtonElement | null {
  const to: Choice = commentRun.sentTo === 'free' ? 'paid' : 'free';
  const isCompanys = commentRun.failure === 'busy' || commentRun.failure === 'no-credit';
  if (!isCompanys || !keys.saved[to]) return null;
  const made = button(to === 'free' ? 'Pošalji besplatnom lektoru' : 'Pošalji plaćenom lektoru', () => send(to), 'status-action lektor-main-action lektor-sends');
  made.append(choiceMark(to), icon('move-out'));
  return made;
}
