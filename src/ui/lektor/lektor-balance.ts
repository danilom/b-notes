import { LEKTOR_UNREACHED, type LektorResponse } from '../../platform/lektor-remote.ts';
import { isRecord } from './lektor-service-call.ts';

/*
  What is left for the paid Lektors, from OpenRouter (spec §9). `/credits` gives the account:
  total_credits − total_usage. `/key`'s `limit_remaining` is only what is left of the key's own
  spending cap, null when it has none; either running out gets a 402, so the lower is shown. If
  `/credits` ever refuses an ordinary key, as its docs say it should, `limit_remaining` stands in.
*/

/** Under this the balance shows red, with "(malo)", and the tick box starts unticked. */
export const LOW_BALANCE_USD = 1;

export type BalanceReading =
  | { kind: 'read'; dollars: number }
  /** A lookup that failed is no trouble with his money: the balance is simply not shown. */
  | { kind: 'unreadable' }
  | { kind: 'dead-key' }
  | { kind: 'offline' };

const dataOf = (part: unknown): Record<string, unknown> | null => {
  if (!isRecord(part) || part['status'] !== 200 || !isRecord(part['reply'])) return null;
  const data = part['reply']['data'];
  return isRecord(data) ? data : null;
};

function accountLeft(credits: unknown): number | null {
  const data = dataOf(credits);
  const total = data?.['total_credits'];
  const used = data?.['total_usage'];
  return typeof total === 'number' && typeof used === 'number' ? total - used : null;
}

function capLeft(key: unknown): number | null {
  const left = dataOf(key)?.['limit_remaining'];
  return typeof left === 'number' ? left : null;
}

/** What the `balance` request's answer says is left, in dollars. */
export function balanceFrom({ status, reply }: LektorResponse): BalanceReading {
  if (status === LEKTOR_UNREACHED) return { kind: 'offline' };
  if (status === 401) return { kind: 'dead-key' };
  // A lookup out of time, or refused for anything but the key, is only unreadable.
  if (status !== 200 || !isRecord(reply)) return { kind: 'unreadable' };
  const account = accountLeft(reply['credits']);
  const cap = capLeft(reply['key']);
  const known = [account, cap].filter((left): left is number => left !== null);
  if (known.length === 0) return { kind: 'unreadable' };
  // Never shown below nothing: a cap overspent by a request in flight is still "nothing left".
  return { kind: 'read', dollars: Math.max(0, Math.min(...known)) };
}

/**
 * Whether "Ako čeka duže od 2 minuta…" starts ticked: with a paid key and a dollar or more.
 * Unticked under that, or when the balance can't be read (spec §5).
 */
export const paidIfSlowByDefault = (hasPaidKey: boolean, dollars: number | null): boolean => hasPaidKey && dollars !== null && dollars >= LOW_BALANCE_USD;

/** After a paid run that finished: its stated cost comes off at once, ahead of the re-read that follows. */
export const balanceAfter = (dollars: number | null, cost: number | null): number | null => (dollars === null || cost === null ? dollars : Math.max(0, dollars - cost));
