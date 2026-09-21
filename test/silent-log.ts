import type { Log } from '../src/platform/logging.ts';

/**
 * A log that keeps what it was told and says nothing.
 *
 * Tests need somewhere for the app's warnings to go, and a run that printed
 * every deliberately-broken filesystem would bury the one line that matters.
 * Kept rather than dropped so a test can assert that something *was* reported —
 * a swallowed fault is exactly the bug these logs exist to prevent.
 */
export interface SilentLog extends Log {
  said: { level: 'info' | 'warn' | 'error'; message: string; detail?: unknown }[];
}

export function silentLog(): SilentLog {
  const said: SilentLog['said'] = [];
  return {
    said,
    info: (message, detail) => said.push({ level: 'info', message, detail }),
    warn: (message, detail) => said.push({ level: 'warn', message, detail }),
    error: (message, detail) => said.push({ level: 'error', message, detail }),
  };
}
