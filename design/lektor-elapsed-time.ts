const SECONDS_IN_A_MINUTE = 60;

/**
 * How long the Lektor has been at it, in words. Not "2:15", which reads as a time of day, and
 * in seconds throughout: a number that keeps changing shows the wait is going somewhere.
 */
export function elapsedLine(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / SECONDS_IN_A_MINUTE);
  const rest = whole % SECONDS_IN_A_MINUTE;
  return minutes === 0 ? `Radi već ${rest} s` : `Radi već ${minutes} min ${rest} s`;
}
