import type { ChainFailure } from './lektor-model-chain.ts';
import type { LektorWords } from './lektor-pieces.ts';
import type { Choice } from './lektor-service.ts';

/*
  What every failure says, and what it offers (spec §10): the problem, "← Nazad" back to the
  request as he left it (where sending again is the retry), and at most one way on. A solid-blue
  shortcut to the other Lektor only where the trouble was the company's and he has its key;
  "Pokušaj ponovo" only where trying again is likely to work. A dead key has a screen of its own.
*/

export interface FailureView {
  sentence: string;
  /** What can be done, under it; empty where there is nothing to say. */
  wayOn: string;
  /** The other Lektor to send to instead, or none. */
  shortcut: Choice | null;
  /** Whether "Pokušaj ponovo", the same request again to the same Lektor, is offered. */
  isRetried: boolean;
}

export interface FailureFacts {
  failure: ChainFailure;
  /** Whose trouble it was. */
  side: Choice;
  /** Which keys he has: a shortcut is only to a Lektor he can reach. */
  hasKey: Readonly<Record<Choice, boolean>>;
  /** When the free Lektor works again, as his local time, for a spent day. */
  resetTime: string;
}

const other = (choice: Choice): Choice => (choice === 'free' ? 'paid' : 'free');

export function failureView({ failure, side, hasKey, resetTime }: FailureFacts, words: LektorWords): FailureView {
  const said = words.failures;
  const plain = (sentence: string, wayOn = '', isRetried = false): FailureView => ({ sentence, wayOn, shortcut: null, isRetried });
  const toOther = (sentence: string, withWay: string, without: string): FailureView =>
    hasKey[other(side)] ? { sentence, wayOn: withWay, shortcut: other(side), isRetried: false } : plain(sentence, without);
  switch (failure) {
    case 'busy':
      return side === 'free' ? toOther(said.busyFree, said.busyFreeWayOn, said.busyNoWayOn) : toOther(said.busyPaid, said.busyPaidWayOn, said.busyNoWayOn);
    case 'daily-limit': {
      const when = said.dailyLimitWhen(resetTime);
      return toOther(said.dailyLimit, `${when}${said.orToPaid}.`, `${when}.`);
    }
    case 'no-credit':
      return toOther(said.noCredit, said.noCreditWayOn, said.noCreditNoWayOn);
    case 'broke-after-hand-over':
      // No shortcut: back to free would only be slow again.
      return plain(said.brokeAfterHandOver, said.brokeAfterHandOverWayOn);
    case 'offline':
      // He may tether to his phone.
      return plain(words.offline, said.offlineWayOn, true);
    case 'cut-off':
      return plain(said.cutOff, said.cutOffWayOn, true);
    case 'declined':
      return toOther(said.declined, said.declinedWayOn, '');
    case 'too-long':
      return plain(said.tooLong);
    case 'not-brought-over':
      return plain(said.notBroughtOver);
    case 'bad-key':
      return plain(words.deadKey, words.callForHelp);
  }
}
