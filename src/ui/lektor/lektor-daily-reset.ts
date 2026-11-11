/*
  When the free Lektor works again after its day's requests are spent: Google resets the daily
  quotas at midnight Pacific time. Said as his own local 24-hour time, since he travels with the
  laptop: 09:00 in Serbia, 15:00 in Bangkok. No "danas" or "sutra" (Danilo, 2026-11-11): on a daily
  cycle the clock time alone is unambiguous, and a day word can only confuse. Nothing is done for
  the days the clocks change.
*/

const PACIFIC = 'America/Los_Angeles';

/** The wall-clock time in a zone, as if it were UTC, so two can be subtracted. */
function wallClockIn(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((one) => one.type === type)?.value ?? 0);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
}

/**
 * Midnight Pacific as a 24-hour time on this computer's clock. Any day's midnight gives the same
 * clock time, the clock-change days aside, so today's is used.
 *
 * @param localZone His time zone; this computer's own when left out. Named only by tests.
 */
export function freeResetTime(now: Date, localZone?: string): string {
  const pacificNow = wallClockIn(PACIFIC, now);
  const offset = pacificNow - Math.floor(now.getTime() / 1000) * 1000;
  const today = new Date(pacificNow);
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - offset;
  return new Intl.DateTimeFormat('en-GB', { timeZone: localZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(midnight));
}
