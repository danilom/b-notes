const SECONDS_IN_A_MINUTE = 60;

/**
 * How long the Lektor has been at it, in words. Not "2:15", which reads as a time of day, and
 * in seconds throughout: a number that keeps changing shows the wait is going somewhere.
 *
 * @param said How his language puts it; minutes is zero under a minute.
 */
export function elapsedLine(seconds: number, said: (minutes: number, seconds: number) => string): string {
  const whole = Math.max(0, Math.floor(seconds));
  return said(Math.floor(whole / SECONDS_IN_A_MINUTE), whole % SECONDS_IN_A_MINUTE);
}
